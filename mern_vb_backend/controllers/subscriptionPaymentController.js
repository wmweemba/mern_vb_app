const mongoose = require('mongoose');
const crypto = require('crypto');
const { getAuth, clerkClient } = require('@clerk/express');

const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const PLANS = require('../config/plans');
const { normalizeZambianMsisdn, maskMsisdn } = require('../utils/msisdn');
const { initiateCollection, classifyFailureReason } = require('../utils/lipilaClient');
const { reconcileAttempt } = require('../utils/subscriptionCollection');

const ATTEMPT_RESUME_WINDOW_MS = 90 * 1000;
const THROTTLE_WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_GROUP_PER_HOUR = 5;
const MAX_ATTEMPTS_PER_MSISDN_PER_HOUR = 3;

// Step 4b/4c's shared reconcile throttle: a pending attempt is only re-checked
// against Lipila if it's old enough that a webhook should already have
// arrived, and not so recently checked that we'd hammer the provider on every
// poll tick.
const RECONCILE_MIN_AGE_MS = 20 * 1000;
const RECONCILE_THROTTLE_MS = 15 * 1000;
const LATEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const LATEST_PENDING_RESUME_WINDOW_MS = 10 * 60 * 1000;
const HISTORY_MAX = 24;

function shouldReconcile(attempt) {
  if (!attempt || attempt.status !== 'pending') return false;
  const ageMs = Date.now() - attempt.createdAt.getTime();
  if (ageMs <= RECONCILE_MIN_AGE_MS) return false;
  if (!attempt.lastCheckedAt) return true;
  return Date.now() - attempt.lastCheckedAt.getTime() > RECONCILE_THROTTLE_MS;
}

// Never surfaced to the browser: raw failureReason/msisdn/rawResponse stay
// server-side. failureKind is the only user-facing signal of why it failed.
function toFailureKind(attempt) {
  return attempt.status === 'failed' ? classifyFailureReason(attempt.failureReason) : null;
}

// Thrown to abort the transaction with a specific HTTP status/body — caught
// outside withTransaction and turned into the response. Never a transient
// Mongo error, so withTransaction never retries it.
class InitiateAbort extends Error {
  constructor(status, body) {
    super(body?.error || 'InitiateAbort');
    this.status = status;
    this.body = body;
  }
}

// Reuses the same active/non-deleted member counting as utils/planLimits.js
// getMemberLimitStatus — kept inline here rather than importing it because
// that helper derives its own plan from group.plan, whereas D10 needs the
// count checked against the *requested* plan, not the group's current one.
async function countActiveMembers(groupId) {
  return GroupMember.countDocuments({ groupId, active: true, deletedAt: null });
}

/**
 * POST /api/billing/lipila/initiate
 * See docs/plan_lipila_subscription_collection.md Step 4a.
 */
exports.initiate = async (req, res) => {
  try {
    if (process.env.LIPILA_ENABLED !== 'true') {
      return res.status(503).json({ error: 'UNAVAILABLE' });
    }

    const { plan, msisdn: rawMsisdn } = req.body || {};
    if (!plan || !Object.prototype.hasOwnProperty.call(PLANS, plan)) {
      return res.status(400).json({ error: 'INVALID_PLAN' });
    }
    if (typeof rawMsisdn !== 'string' || rawMsisdn.length === 0 || rawMsisdn.length > 20) {
      return res.status(400).json({ error: 'INVALID_MSISDN' });
    }
    const msisdn = normalizeZambianMsisdn(rawMsisdn);
    if (!msisdn) {
      return res.status(400).json({ error: 'INVALID_MSISDN' });
    }

    const group = await Group.findById(req.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // §4.3: a legacy no-expiry paid group must never be auto-restated to a
    // finite paidUntil — that would shorten its access, not extend it.
    if (group.isPaid && !group.paidUntil) {
      return res.status(409).json({ error: 'NO_EXPIRY_GROUP' });
    }

    // D10 plan-too-small guard, checked before any Lipila call.
    const activeCount = await countActiveMembers(group._id);
    const memberLimit = PLANS[plan].memberLimit;
    if (activeCount > memberLimit) {
      return res.status(409).json({ error: 'PLAN_TOO_SMALL', data: { activeCount, memberLimit } });
    }

    const planDef = PLANS[plan];
    let amount = planDef.price;
    const currency = planDef.currency;
    let isTestAmount = false;
    // Rule 7's double guard — only ever applies outside production AND against
    // the sandbox host, so a misconfigured production container can never
    // charge a test amount for a real month.
    if (
      process.env.NODE_ENV !== 'production' &&
      (process.env.LIPILA_BASE_URL || '').includes('lipila.dev') &&
      Number(process.env.LIPILA_TEST_AMOUNT) > 0
    ) {
      amount = Number(process.env.LIPILA_TEST_AMOUNT);
      isTestAmount = true;
    }

    // Payer email resolution happens BEFORE the transaction — it calls Clerk,
    // which must never run inside withTransaction (can retry).
    let payerEmail = req.member?.email || '';
    if (!payerEmail) {
      try {
        const { userId: clerkUserId } = getAuth(req);
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        const primaryEmail = clerkUser.emailAddresses?.find((e) => e.id === clerkUser.primaryEmailAddressId);
        payerEmail = primaryEmail?.emailAddress || '';
      } catch (err) {
        console.error('Lipila initiate: failed to resolve payer email via Clerk', err.message);
      }
    }

    const reference = `c360-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const now = new Date();

        // Touch Group.lastPaymentAttemptAt FIRST — this is the write both a
        // concurrent double-tap and this request serialise on (§4.4).
        await Group.updateOne({ _id: group._id }, { $set: { lastPaymentAttemptAt: now } }, { session });

        const recentPending = await SubscriptionPayment.findOne({
          groupId: group._id,
          status: 'pending',
          createdAt: { $gte: new Date(now.getTime() - ATTEMPT_RESUME_WINDOW_MS) },
        }).sort({ createdAt: -1 }).session(session);

        if (recentPending) {
          if (recentPending.plan === plan && recentPending.msisdn === msisdn) {
            result = { resumed: true, attempt: recentPending };
            return;
          }
          throw new InitiateAbort(409, { error: 'ATTEMPT_IN_PROGRESS' });
        }

        const oneHourAgo = new Date(now.getTime() - THROTTLE_WINDOW_MS);
        const [groupAttemptCount, msisdnAttemptCount] = await Promise.all([
          SubscriptionPayment.countDocuments({ groupId: group._id, createdAt: { $gte: oneHourAgo } }).session(session),
          SubscriptionPayment.countDocuments({ msisdn, createdAt: { $gte: oneHourAgo } }).session(session),
        ]);
        if (groupAttemptCount >= MAX_ATTEMPTS_PER_GROUP_PER_HOUR || msisdnAttemptCount >= MAX_ATTEMPTS_PER_MSISDN_PER_HOUR) {
          throw new InitiateAbort(429, { error: 'TOO_MANY_ATTEMPTS' });
        }

        const [created] = await SubscriptionPayment.create([{
          groupId: group._id,
          initiatedByMemberId: req.member._id,
          initiatedByName: req.member.name,
          payerEmail,
          plan,
          periodMonths: 1,
          amount,
          currency,
          isTestAmount,
          msisdn,
          reference,
        }], { session, ordered: true });

        result = { resumed: false, attempt: created };
      });
    } catch (err) {
      if (err instanceof InitiateAbort) {
        return res.status(err.status).json(err.body);
      }
      throw err;
    } finally {
      await session.endSession();
    }

    if (result.resumed) {
      const attempt = result.attempt;
      return res.status(201).json({
        data: {
          attemptId: attempt._id,
          status: attempt.status,
          amount: attempt.amount,
          currency: attempt.currency,
          maskedMsisdn: maskMsisdn(attempt.msisdn),
          resumed: true,
        },
      });
    }

    // Lipila is called only AFTER commit (§4.4) — never inside withTransaction.
    const attempt = result.attempt;
    const narration = `Chama360 ${planDef.name} – ${group.name}`.slice(0, 60);
    const lipilaResult = await initiateCollection({
      reference: attempt.reference,
      amount: attempt.amount,
      currency: attempt.currency,
      msisdn: attempt.msisdn,
      narration,
      email: payerEmail,
    });

    // Post-commit writes below use conditional updateOne({..., status: 'pending'})
    // rather than attempt.save(), because a concurrent webhook can resolve this
    // same attempt (to success, or to failed) while we're still waiting on
    // Lipila's HTTP response. An unconditional save() would clobber whatever
    // the resolver already wrote.
    if (lipilaResult.outcome === 'failed') {
      const updateResult = await SubscriptionPayment.updateOne(
        { _id: attempt._id, status: 'pending' },
        { $set: { status: 'failed', failureReason: lipilaResult.reason, completedAt: new Date() } },
      );

      if (updateResult.matchedCount === 0) {
        // A webhook already resolved this attempt before our failed outcome
        // landed — respond per the attempt's actual (already-resolved) status
        // rather than overwriting it or lying with a 502.
        const resolved = await SubscriptionPayment.findById(attempt._id);
        if (resolved && resolved.status === 'success') {
          return res.status(201).json({
            data: {
              attemptId: resolved._id,
              status: 'success',
              amount: resolved.amount,
              currency: resolved.currency,
              maskedMsisdn: maskMsisdn(resolved.msisdn),
              resumed: false,
            },
          });
        }
        return res.status(201).json({
          data: {
            attemptId: attempt._id,
            status: resolved ? resolved.status : 'failed',
            amount: attempt.amount,
            currency: attempt.currency,
            maskedMsisdn: maskMsisdn(attempt.msisdn),
            resumed: false,
          },
        });
      }

      return res.status(502).json({
        error: 'COLLECTION_REJECTED',
        data: { attemptId: attempt._id, failureKind: classifyFailureReason(lipilaResult.reason) },
      });
    }

    if (lipilaResult.outcome === 'pending') {
      await SubscriptionPayment.updateOne(
        { _id: attempt._id, status: 'pending' },
        { $set: { providerIdentifier: lipilaResult.raw?.identifier, rawResponse: lipilaResult.raw } },
      );
    } else {
      // ambiguous — stays pending; reason stored for diagnosis only, never
      // surfaced to the browser.
      await SubscriptionPayment.updateOne(
        { _id: attempt._id, status: 'pending' },
        { $set: { failureReason: lipilaResult.reason } },
      );
    }

    return res.status(201).json({
      data: {
        attemptId: attempt._id,
        status: 'pending',
        amount: attempt.amount,
        currency: attempt.currency,
        maskedMsisdn: maskMsisdn(attempt.msisdn),
        resumed: false,
      },
    });
  } catch (err) {
    console.error('Lipila initiate failed', err.message);
    return res.status(500).json({ error: 'Failed to initiate payment', details: err.message });
  }
};

/**
 * GET /api/billing/lipila/attempts/:attemptId
 * See docs/plan_lipila_subscription_collection.md Step 4b.
 */
exports.getAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    let attempt = await SubscriptionPayment.findOne({ _id: attemptId, groupId: req.groupId });
    if (!attempt) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (shouldReconcile(attempt)) {
      try {
        const fresh = await reconcileAttempt(attempt._id);
        if (fresh) attempt = fresh;
      } catch (err) {
        // A reconcile failure must never 500 the poll — the client keeps
        // polling against the attempt as it last stood.
        console.error('Lipila attempt reconcile failed', err.message);
      }
    }

    return res.status(200).json({
      data: {
        status: attempt.status,
        amount: attempt.amount,
        currency: attempt.currency,
        plan: attempt.plan,
        failureKind: toFailureKind(attempt),
        paidUntil: attempt.paidUntilAfter || null,
      },
    });
  } catch (err) {
    console.error('Lipila getAttempt failed', err.message);
    return res.status(500).json({ error: 'Failed to load attempt', details: err.message });
  }
};

/**
 * GET /api/billing/lipila/latest
 * See docs/plan_lipila_subscription_collection.md Step 4c.
 */
exports.getLatest = async (req, res) => {
  try {
    const enabled = process.env.LIPILA_ENABLED === 'true';
    if (!enabled) {
      // Kept simple per the brief: disabled means no reconcile and no attempt
      // handed to the UI at all.
      return res.status(200).json({ data: { enabled: false, attempt: null } });
    }

    let attempt = await SubscriptionPayment.findOne({
      groupId: req.groupId,
      createdAt: { $gte: new Date(Date.now() - LATEST_WINDOW_MS) },
    }).sort({ createdAt: -1 });

    if (!attempt) {
      return res.status(200).json({ data: { enabled: true, attempt: null } });
    }

    if (shouldReconcile(attempt)) {
      try {
        const fresh = await reconcileAttempt(attempt._id);
        if (fresh) attempt = fresh;
      } catch (err) {
        console.error('Lipila latest reconcile failed', err.message);
      }
    }

    const isResumableSuccess = attempt.status === 'success';
    const isResumablePending =
      attempt.status === 'pending' && Date.now() - attempt.createdAt.getTime() < LATEST_PENDING_RESUME_WINDOW_MS;

    if (!isResumableSuccess && !isResumablePending) {
      // The newest attempt isn't actionable (e.g. a failed retry after a
      // real payment). Fall back to the most recent success in the window so
      // the page still confirms the payment that did land.
      const recentSuccess = await SubscriptionPayment.findOne({
        groupId: req.groupId,
        status: 'success',
        createdAt: { $gte: new Date(Date.now() - LATEST_WINDOW_MS) },
      }).sort({ createdAt: -1 });
      if (!recentSuccess) {
        return res.status(200).json({ data: { enabled: true, attempt: null } });
      }
      attempt = recentSuccess;
    }

    return res.status(200).json({
      data: {
        enabled: true,
        attempt: {
          attemptId: attempt._id,
          status: attempt.status,
          amount: attempt.amount,
          currency: attempt.currency,
          plan: attempt.plan,
          maskedMsisdn: maskMsisdn(attempt.msisdn),
          failureKind: toFailureKind(attempt),
          paidUntil: attempt.paidUntilAfter || null,
          createdAt: attempt.createdAt,
        },
      },
    });
  } catch (err) {
    console.error('Lipila getLatest failed', err.message);
    return res.status(500).json({ error: 'Failed to load latest attempt', details: err.message });
  }
};

/**
 * GET /api/billing/lipila/history
 * See docs/plan_lipila_subscription_collection.md Step 4d.
 */
exports.getHistory = async (req, res) => {
  try {
    const attempts = await SubscriptionPayment.find({ groupId: req.groupId, status: 'success' })
      .sort({ completedAt: -1 })
      .limit(HISTORY_MAX);

    return res.status(200).json({
      data: attempts.map((attempt) => ({
        date: attempt.completedAt,
        plan: attempt.plan,
        amount: attempt.amount,
        currency: attempt.currency,
        maskedMsisdn: maskMsisdn(attempt.msisdn),
        providerExternalId: attempt.providerExternalId,
        initiatedByName: attempt.initiatedByName,
        paidUntilAfter: attempt.paidUntilAfter,
      })),
    });
  } catch (err) {
    console.error('Lipila getHistory failed', err.message);
    return res.status(500).json({ error: 'Failed to load payment history', details: err.message });
  }
};
