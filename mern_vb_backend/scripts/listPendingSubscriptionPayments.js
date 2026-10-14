/**
 * Weekly stuck-payment check (CLAUDE.md "Automated Subscription Collection
 * (Lipila)" runbook). Default mode is strictly read-only — no writes anywhere.
 *
 * Lists SubscriptionPayment attempts that look stuck:
 *   - status 'pending' and createdAt older than 15 minutes (Lipila never
 *     resolved, and nothing has polled/reconciled it since), or
 *   - status 'failed' with failureReason 'not_found_at_provider' (the
 *     resolver gave up on an 'unknown' provider status after 30 minutes).
 *
 * Production is reachable only via `docker exec` on the Coolify box (see
 * CLAUDE.md's DB section):
 *   ssh -i ~/.ssh/hetzner_coolify root@78.47.128.95 \
 *     "docker exec <backend-container-name> node scripts/listPendingSubscriptionPayments.js"
 *
 * RUNBOOK — for each stuck row printed:
 *   1. Run `node scripts/listPendingSubscriptionPayments.js --reconcile <attemptId>`
 *      FIRST. This calls Lipila's check-status endpoint (read-only at Lipila)
 *      through the normal resolver — if Lipila confirms the money arrived, it
 *      activates the group the same way a webhook would, so the row is fixed
 *      with no second extension risk.
 *   2. Only if Lipila has no record of the reference at all, but the Lipila
 *      dashboard shows the money arrived another way, use Activate / Extend in
 *      Platform Admin by hand — and note that doing so leaves the
 *      SubscriptionPayment attempt itself still 'pending' (record this
 *      explicitly; it is expected, not a bug).
 *   3. Never use Activate / Extend for a row that --reconcile can resolve —
 *      that would double-extend the group (once via reconcile/webhook, once
 *      by hand).
 *   Refunds, if ever needed, are done by hand from the Lipila dashboard — this
 *   app has no refund path.
 *
 * Usage:
 *   node scripts/listPendingSubscriptionPayments.js                 # list (read-only)
 *   node scripts/listPendingSubscriptionPayments.js --reconcile <id> # reconcile one attempt
 *   node scripts/listPendingSubscriptionPayments.js --help
 */

function printHelp() {
  console.log(`
Usage:
  node scripts/listPendingSubscriptionPayments.js
      List SubscriptionPayment attempts that look stuck (read-only, default).

  node scripts/listPendingSubscriptionPayments.js --reconcile <attemptId>
      Reconcile one attempt against Lipila (read-only at Lipila; may activate
      the group through the normal resolver if Lipila confirms success).
      Prints status/paidUntil before and after.

  node scripts/listPendingSubscriptionPayments.js --help
      Show this message and exit without connecting to any database.
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

require('dotenv').config();
const mongoose = require('mongoose');
const { printTarget, maskUri } = require('./utils/productionGuard');

const Group = require('../models/Group');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { maskMsisdn } = require('../utils/msisdn');
const { reconcileAttempt } = require('../utils/subscriptionCollection');

const PENDING_STALE_MS = 15 * 60 * 1000;
const clientOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

async function runReconcile(attemptId) {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI is not set.'); process.exit(1); }
  await mongoose.connect(uri, clientOptions);

  console.log('\n🔁 Reconcile one Subscription Payment attempt');
  printTarget(maskUri(uri));

  const before = await SubscriptionPayment.findById(attemptId).lean();
  if (!before) {
    console.error(`\nNo SubscriptionPayment found with id ${attemptId}.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`\nBefore: status=${before.status} paidUntilAfter=${before.paidUntilAfter ? before.paidUntilAfter.toISOString() : 'n/a'}`);

  const after = await reconcileAttempt(attemptId);

  if (!after) {
    console.log('\nAfter: attempt no longer exists.');
  } else {
    console.log(`After:  status=${after.status} paidUntilAfter=${after.paidUntilAfter ? new Date(after.paidUntilAfter).toISOString() : 'n/a'}`);
    if (after.status === 'pending') {
      console.log('\nStill pending — Lipila has no confirmed status for this attempt yet. Do NOT use Activate/Extend; re-run this reconcile later, or check the Lipila dashboard for the reference.');
    }
  }

  await mongoose.disconnect();
}

async function runList() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI is not set.'); process.exit(1); }
  await mongoose.connect(uri, clientOptions);

  console.log('\n🔍 Stuck Subscription Payments (read-only)');
  printTarget(maskUri(uri));

  const staleBefore = new Date(Date.now() - PENDING_STALE_MS);

  const attempts = await SubscriptionPayment.find({
    $or: [
      { status: 'pending', createdAt: { $lt: staleBefore } },
      { status: 'failed', failureReason: 'not_found_at_provider' },
    ],
  }).sort({ createdAt: -1 }).lean();

  if (!attempts.length) {
    console.log('\nNo stuck payments found.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nFound ${attempts.length} attempt(s):\n`);

  for (const a of attempts) {
    const group = await Group.findById(a.groupId).lean();
    const groupName = group ? group.name : '(missing)';
    console.log(
      `  [${a.status}] ${a._id} | ${a.reference} | group: ${groupName} | plan: ${a.plan} | ` +
      `amount: ${a.currency || 'ZMW'} ${a.amount} | msisdn: ${maskMsisdn(a.msisdn)} | ` +
      `createdAt: ${a.createdAt?.toISOString()}` +
      (a.failureReason ? ` | failureReason: ${a.failureReason}` : '')
    );
  }

  console.log(`\nSummary: ${attempts.length} stuck attempt(s). Run with --reconcile <id> first for each row — see the RUNBOOK in this file's header comment before ever using Activate/Extend by hand.`);

  await mongoose.disconnect();
}

async function run() {
  const reconcileId = arg('--reconcile');
  if (reconcileId) {
    await runReconcile(reconcileId);
    return;
  }
  await runList();
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
