const mongoose = require('mongoose');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { extendGroupSubscription } = require('./subscription');
const { checkCollectionStatus } = require('./lipilaClient');
const { maskMsisdn } = require('./msisdn');
const { notifyAdminSubscriptionCollected, sendPaymentReceipt } = require('./notifyBilling');
const PLANS = require('../config/plans');

// Source plan §5a / Step 5a — the only place a Lipila collection result may
// activate a subscription. Idempotent and safe to call concurrently from the
// webhook route and reconcileAttempt()'s poll path: both run through the same
// transaction, claiming the attempt atomically before extending the group.
const UNKNOWN_EXPIRY_MS = 30 * 60 * 1000; // unknown older than this -> failed
const RECENT_SUCCESS_WINDOW_MS = 24 * 60 * 60 * 1000;
const ALREADY_PAID_UP_DAYS = 7;

/**
 * Apply a provider result to an attempt. Idempotent; safe to call concurrently
 * from the webhook and the poll route.
 * @param {string} attemptId
 * @param {{ status: 'pending'|'success'|'failed'|'unknown', amount?, currency?, externalId?, identifier?, message?, raw? }} result
 * @returns {Promise<{ transitioned: boolean, activated: boolean, attempt: object|null, warnings: string[], groupName?: string, paidUntil?: Date }>}
 */
async function resolveAttempt(attemptId, result) {
  const session = await mongoose.startSession();
  let outcome;
  try {
    await session.withTransaction(async () => {
      const attempt = await SubscriptionPayment.findById(attemptId).session(session);
      if (!attempt) {
        outcome = { transitioned: false, activated: false, attempt: null, warnings: [] };
        return;
      }

      // Already success -> no-op (idempotent against duplicate webhooks/polls).
      if (attempt.status === 'success') {
        outcome = { transitioned: false, activated: false, attempt, warnings: [] };
        return;
      }

      if (result.status === 'pending' || result.status === 'unknown') {
        if (result.status === 'unknown') {
          const ageMs = Date.now() - attempt.createdAt.getTime();
          if (ageMs > UNKNOWN_EXPIRY_MS) {
            attempt.status = 'failed';
            attempt.failureReason = 'not_found_at_provider';
            attempt.lastCheckedAt = new Date();
            attempt.completedAt = new Date();
            await attempt.save({ session });
            outcome = { transitioned: true, activated: false, attempt, warnings: [] };
            return;
          }
        }
        attempt.lastCheckedAt = new Date();
        await attempt.save({ session });
        outcome = { transitioned: false, activated: false, attempt, warnings: [] };
        return;
      }

      if (result.status === 'failed') {
        // failed -> failed is a no-op; only a pending attempt transitions.
        if (attempt.status !== 'pending') {
          outcome = { transitioned: false, activated: false, attempt, warnings: [] };
          return;
        }
        attempt.status = 'failed';
        attempt.failureReason = result.message || 'Failed';
        if (result.identifier) attempt.providerIdentifier = result.identifier;
        if (result.raw) attempt.rawResponse = result.raw;
        attempt.completedAt = new Date();
        await attempt.save({ session });
        outcome = { transitioned: true, activated: false, attempt, warnings: [] };
        return;
      }

      // result.status === 'success' — money that arrived always activates, even
      // a late success on an attempt already marked failed, and even on an
      // amount mismatch (flagged for review, never withheld).
      const wasLateSuccess = attempt.status === 'failed';

      // Atomic claim: blocks a concurrent duplicate success from double-extending.
      const claimed = await SubscriptionPayment.findOneAndUpdate(
        { _id: attemptId, status: { $ne: 'success' } },
        { $set: { status: 'success' } },
        { session, new: true },
      );
      if (!claimed) {
        // Another caller already claimed it inside this same window.
        const fresh = await SubscriptionPayment.findById(attemptId).session(session);
        outcome = { transitioned: false, activated: false, attempt: fresh, warnings: [] };
        return;
      }

      const amountMismatch =
        Math.abs(Number(result.amount) - Number(claimed.amount)) > 0.005 ||
        (!!result.currency && result.currency !== claimed.currency);

      const ext = await extendGroupSubscription(session, {
        groupId: claimed.groupId,
        plan: claimed.plan,
        durationMonths: claimed.periodMonths,
      });

      const warnings = [];
      if (amountMismatch) warnings.push('amount_mismatch');
      if (wasLateSuccess) warnings.push('late_success');

      let groupName;
      let paidUntil = null;

      if (!ext) {
        // Group hard-deleted — keep success (money arrived), flag for William.
        claimed.failureReason = 'group_missing';
        warnings.push('group_missing');
      } else {
        groupName = ext.group.name;
        paidUntil = ext.paidUntil;

        if (ext.group.deletedAt || ext.group.suspendedAt) {
          warnings.push('group_deleted_or_suspended');
        }

        // Read-only — never alters the activation, just flags a possible
        // double payment for William. Uses the pre-extension value (`before`).
        const alreadyPaidUpThreshold = new Date(Date.now() + ALREADY_PAID_UP_DAYS * 24 * 60 * 60 * 1000);
        if (ext.before.paidUntil && ext.before.paidUntil > alreadyPaidUpThreshold) {
          warnings.push('already_paid_up');
        }

        const recentSuccess = await SubscriptionPayment.findOne({
          groupId: claimed.groupId,
          status: 'success',
          _id: { $ne: attemptId },
          completedAt: { $gte: new Date(Date.now() - RECENT_SUCCESS_WINDOW_MS) },
        }).session(session);
        if (recentSuccess) warnings.push('recent_success');
      }

      claimed.providerExternalId = result.externalId || claimed.providerExternalId || null;
      claimed.providerIdentifier = result.identifier || claimed.providerIdentifier;
      claimed.rawResponse = result.raw;
      claimed.amountMismatch = amountMismatch;
      claimed.wasLateSuccess = wasLateSuccess;
      claimed.paidUntilAfter = paidUntil;
      claimed.completedAt = new Date();
      await claimed.save({ session });

      outcome = {
        transitioned: true,
        activated: !!ext,
        // Set only on the branch that just claimed this attempt as success in
        // THIS call — distinct from `activated` (which means "group extended").
        // Money arrived either way; William must be notified either way
        // (source plan §5a: group missing still keeps success and notifies).
        claimedSuccessNow: true,
        attempt: claimed,
        warnings,
        groupName,
        paidUntil,
      };
    });
  } finally {
    session.endSession();
  }

  // Post-commit side effects only — never inside the transaction above (it can
  // retry). Detached on purpose: the webhook route and the UI poll route both
  // call resolveAttempt synchronously, and a hung Telegram/Resend call must
  // never hang either of them. Failures are swallowed here; notifyBilling's
  // own functions already never throw on their own, this catch is a backstop.
  if (outcome.claimedSuccessNow) {
    afterResolve(outcome).catch((err) => console.error('[lipila] post-commit notify failed:', err.message));
  }

  return outcome;
}

async function afterResolve(outcome) {
  const { attempt, warnings, groupName, paidUntil, activated } = outcome;
  const planInfo = PLANS[attempt.plan] || {};
  const planLabel = planInfo.name || attempt.plan;

  // Admin notification fires whenever money was claimed as a success — even
  // when the group is gone, per source plan §5a (keep success, notify William).
  await notifyAdminSubscriptionCollected({
    groupName: groupName || 'Unknown group',
    payerName: attempt.initiatedByName,
    plan: planLabel,
    amount: attempt.amount,
    currency: attempt.currency,
    paidUntil,
    providerExternalId: attempt.providerExternalId,
    maskedMsisdn: maskMsisdn(attempt.msisdn),
    isTestAmount: attempt.isTestAmount,
    warnings,
  });

  // The payer receipt only makes sense if a group was actually found/extended.
  if (activated) {
    await sendPaymentReceipt({
      to: attempt.payerEmail,
      groupName: groupName || 'your group',
      plan: planLabel,
      amount: attempt.amount,
      currency: attempt.currency,
      date: attempt.completedAt,
      providerExternalId: attempt.providerExternalId,
      paidUntil,
    });
  }
}

/** Poll-path wrapper: checkCollectionStatus OUTSIDE any transaction, then resolveAttempt. */
async function reconcileAttempt(attemptId) {
  const attempt = await SubscriptionPayment.findById(attemptId);
  if (!attempt) return null;
  if (attempt.status !== 'pending') return attempt;

  const result = await checkCollectionStatus({ reference: attempt.reference });
  const outcome = await resolveAttempt(attemptId, result);
  return outcome.attempt || attempt;
}

module.exports = { resolveAttempt, reconcileAttempt };
