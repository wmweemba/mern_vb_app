/**
 * Weekly stuck-payment check (CLAUDE.md "Automated Subscription Collection
 * (Lipila)" runbook). Strictly read-only — no writes anywhere.
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
 * For each row printed: check the Lipila dashboard for that reference.
 *   - If it turns out the money WAS paid, use Activate / Extend in Platform
 *     Admin (never edit SubscriptionPayment directly).
 *   - Refunds, if ever needed, are done by hand from the Lipila dashboard —
 *     this app has no refund path.
 *
 *   node scripts/listPendingSubscriptionPayments.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { printTarget, maskUri } = require('./utils/productionGuard');

const Group = require('../models/Group');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { maskMsisdn } = require('../utils/msisdn');

const PENDING_STALE_MS = 15 * 60 * 1000;
const clientOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };

async function run() {
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
      `  [${a.status}] ${a.reference} | group: ${groupName} | plan: ${a.plan} | ` +
      `amount: ${a.currency || 'ZMW'} ${a.amount} | msisdn: ${maskMsisdn(a.msisdn)} | ` +
      `createdAt: ${a.createdAt?.toISOString()}` +
      (a.failureReason ? ` | failureReason: ${a.failureReason}` : '')
    );
  }

  console.log(`\nSummary: ${attempts.length} stuck attempt(s). Check each reference in the Lipila dashboard.`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
