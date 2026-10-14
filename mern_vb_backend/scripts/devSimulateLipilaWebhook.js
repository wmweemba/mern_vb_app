/**
 * Dev-only simulator for POST /api/webhooks/lipila/subscriptions — lets the
 * Lipila subscription-collection flow be exercised end to end (initiate a
 * pending attempt, then "deliver" a correctly signed webhook) with no real
 * money moving and no dependency on Lipila actually being reachable.
 *
 * Source plan: docs/plan_lipila_subscription_collection.md §3 (payload shape)
 * and Step 7a. Build plan: docs/build/lipila-subscription-collection/plan.md U8.
 *
 * SAFETY — read before touching the guards below:
 * Every file under scripts/ is deployed into the production backend
 * container on every push (Coolify builds the whole repo), even though
 * nothing invokes these scripts automatically. That means this script sits
 * inert on production's filesystem the same way createThrowawayTestUser.js
 * does, and must assume it may one day be run there by mistake — by a typo'd
 * command, a copy-pasted docker exec, or muscle memory from a dev shell. The
 * four guards below (production NODE_ENV, Atlas-dev-only MONGODB_URI,
 * localhost-only target URL, a webhook secret must be configured) all run
 * BEFORE any Mongo connection or HTTP request, and each one refuses loudly
 * rather than silently doing nothing. Do not weaken, reorder, or add a flag
 * that bypasses any of them.
 *
 * Usage:
 *   node scripts/devSimulateLipilaWebhook.js --help
 *
 *   # Insert a new pending attempt for a group, then deliver a Successful webhook
 *   node scripts/devSimulateLipilaWebhook.js --group <groupId> --plan starter
 *
 *   # Reuse an existing attempt (e.g. one created by the real /initiate route)
 *   node scripts/devSimulateLipilaWebhook.js --attempt <attemptId>
 *
 *   # Simulate a failure
 *   node scripts/devSimulateLipilaWebhook.js --group <groupId> --status Failed
 *
 *   # Duplicate delivery (same webhook-id) — should extend the group only once
 *   node scripts/devSimulateLipilaWebhook.js --group <groupId> --repeat 3
 *
 *   # Bad signature / replay checks
 *   node scripts/devSimulateLipilaWebhook.js --group <groupId> --bad-signature
 *   node scripts/devSimulateLipilaWebhook.js --group <groupId> --old-timestamp
 *
 *   # Reference that matches no attempt anywhere
 *   node scripts/devSimulateLipilaWebhook.js --unknown-reference
 */
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      args[key] = next !== undefined && !next.startsWith('--') ? next : true;
      if (args[key] !== true) i++;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Dev-only simulator for the Lipila subscription-collection webhook.
Refuses to run anywhere except a local backend against the Atlas dev database.

Usage:
  node scripts/devSimulateLipilaWebhook.js [options]

Attempt selection (choose one):
  --attempt <id>            Reuse an existing SubscriptionPayment by id
  --group <groupId>         Insert a new pending attempt for this group
  --unknown-reference       Send a reference that matches no attempt at all

Options:
  --plan starter|standard   Plan for a newly inserted attempt (default: starter)
  --amount <n>              Override the webhook payload amount (default: attempt.amount)
  --status Successful|Failed   Webhook status (default: Successful)
  --type <type>             Webhook "type" field (default: Collection)
  --message <text>          Webhook "message" field (default derived from --status)
  --bad-signature           Sign with a random, wrong secret (expect 401)
  --old-timestamp           Use a timestamp 400s in the past (expect 401)
  --repeat <n>              Send the identical delivery n times (same webhook-id)
  --url <url>               Target URL (default: http://localhost:<PORT||5000>/api/webhooks/lipila/subscriptions)
  --help                    Show this help and exit 0 (no env guards run)
`);
}

// ---- Guards -----------------------------------------------------------
// All four MUST run before any mongoose.connect() or fetch() call.

function assertNotProduction() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run: NODE_ENV=production. This script is dev-only.');
  }
}

// Production's Coolify Mongo container host — never a legitimate target for
// this script, even if someone points MONGODB_URI at it by mistake.
const PRODUCTION_CONTAINER_HOST = 'bw0k4sgwsw8kkkg4skkc8ksw';

function assertAtlasDevUri() {
  const uri = process.env.MONGODB_URI || '';
  const looksLikeAtlasDev = uri.includes('mern-vb-cluster') || uri.startsWith('mongodb+srv');
  const looksLikeProdContainer = uri.includes(PRODUCTION_CONTAINER_HOST);
  if (!looksLikeAtlasDev || looksLikeProdContainer) {
    throw new Error(
      'Refusing to run: MONGODB_URI does not look like the Atlas dev cluster. ' +
      'It must contain "mern-vb-cluster" or start with "mongodb+srv", and must NOT ' +
      `contain the production Coolify Mongo container host ("${PRODUCTION_CONTAINER_HOST}").`
    );
  }
}

function assertLocalTarget(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Refusing to run: --url "${url}" is not a valid URL.`);
  }
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error(
      `Refusing to run: target URL host "${parsed.hostname}" is not "localhost" or "127.0.0.1". ` +
      'This script only ever POSTs to a local backend.'
    );
  }
}

function assertWebhookSecretConfigured() {
  if (!process.env.LIPILA_WEBHOOK_SECRET) {
    throw new Error('Refusing to run: LIPILA_WEBHOOK_SECRET is not set.');
  }
}

// ---- Signing (Standard Webhooks — mirrors utils/lipilaClient.js verifyWebhookSignature) ----

function signPayload({ id, timestamp, body, secret }) {
  const secretBytes = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const digest = crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${digest}`;
}

function randomHex(n = 6) {
  return crypto.randomBytes(n).toString('hex');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  // Guards, in order, before anything touches Mongo or the network.
  assertNotProduction();
  assertAtlasDevUri();
  const defaultPort = process.env.PORT || 5000;
  const targetUrl = typeof args.url === 'string' ? args.url : `http://localhost:${defaultPort}/api/webhooks/lipila/subscriptions`;
  assertLocalTarget(targetUrl);
  assertWebhookSecretConfigured();

  await mongoose.connect(process.env.MONGODB_URI);

  const SubscriptionPayment = require('../models/SubscriptionPayment');
  const Group = require('../models/Group');
  const GroupMember = require('../models/GroupMember');
  const plans = require('../config/plans');
  const { maskMsisdn } = require('../utils/msisdn');

  try {
    let attempt = null;
    let referenceToSend;

    if (args['unknown-reference']) {
      referenceToSend = `c360-sim-unknown-${Date.now()}-${randomHex()}`;
      console.log(`Sending webhook for an unknown reference: ${referenceToSend}`);
    } else if (args.attempt) {
      attempt = await SubscriptionPayment.findById(args.attempt);
      if (!attempt) throw new Error(`No SubscriptionPayment found with id ${args.attempt}`);
      referenceToSend = attempt.reference;
      console.log(`Reusing attempt ${attempt._id} (reference ${attempt.reference})`);
    } else if (args.group) {
      const group = await Group.findById(args.group);
      if (!group) throw new Error(`No Group found with id ${args.group}`);

      const planKey = typeof args.plan === 'string' ? args.plan : 'starter';
      const planConfig = plans[planKey];
      if (!planConfig) throw new Error(`Unknown plan "${planKey}" — expected one of: ${Object.keys(plans).join(', ')}`);

      const initiator = await GroupMember.findOne({
        groupId: group._id,
        role: { $in: ['admin', 'treasurer'] },
        active: true,
      }).sort({ createdAt: 1 });
      if (!initiator) throw new Error(`Group ${group._id} has no active admin/treasurer GroupMember to attribute the attempt to.`);

      referenceToSend = `c360-sim-${Date.now()}-${randomHex()}`;
      attempt = await SubscriptionPayment.create({
        groupId: group._id,
        initiatedByMemberId: initiator._id,
        initiatedByName: initiator.name,
        payerEmail: initiator.email || '',
        plan: planKey,
        periodMonths: 1,
        amount: planConfig.price,
        currency: planConfig.currency,
        isTestAmount: false,
        msisdn: '260975551234',
        reference: referenceToSend,
        status: 'pending',
      });
      console.log(`Inserted pending attempt ${attempt._id} (reference ${attempt.reference}) for group ${group._id}`);
    } else {
      throw new Error('Pass --attempt <id>, --group <groupId>, or --unknown-reference. See --help.');
    }

    const amount = args.amount !== undefined ? Number(args.amount) : (attempt ? attempt.amount : 200);
    const status = typeof args.status === 'string' ? args.status : 'Successful';
    const type = typeof args.type === 'string' ? args.type : 'Collection';
    const defaultMessage = status === 'Successful' ? 'Successful' : 'Failed';
    const message = typeof args.message === 'string' ? args.message : defaultMessage;
    const identifier = `LPLXC-SIM-${randomHex()}`;
    const externalId = status === 'Successful' ? `SIM${randomHex(5)}` : '';

    const payload = {
      referenceId: referenceToSend,
      currency: attempt ? attempt.currency : 'ZMW',
      amount,
      accountNumber: attempt ? attempt.msisdn : '260975551234',
      status,
      paymentType: 'MtnMoney',
      type,
      identifier,
      externalId,
      message,
    };

    const body = JSON.stringify(payload);
    const repeat = args.repeat !== undefined ? Number(args.repeat) : 1;
    const webhookId = `msg_sim_${randomHex()}`;

    const realSecret = process.env.LIPILA_WEBHOOK_SECRET;
    const signingSecret = args['bad-signature']
      ? 'whsec_' + crypto.randomBytes(32).toString('base64')
      : realSecret;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const timestamp = args['old-timestamp'] ? String(nowSeconds - 400) : String(nowSeconds);

    const signature = signPayload({ id: webhookId, timestamp, body, secret: signingSecret });

    console.log(`\nPOSTing ${repeat} time(s) to ${targetUrl}`);
    console.log(`  status=${status} type=${type} amount=${amount} msisdn=${maskMsisdn(payload.accountNumber)}`);

    for (let i = 0; i < repeat; i++) {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': webhookId,
          'webhook-timestamp': timestamp,
          'webhook-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(20000),
      });
      console.log(`  delivery ${i + 1}/${repeat} -> HTTP ${res.status}`);
    }

    if (attempt) {
      const updatedAttempt = await SubscriptionPayment.findById(attempt._id);
      const updatedGroup = await Group.findById(updatedAttempt.groupId);
      console.log('\nResulting state:');
      console.log(`  attempt.status:       ${updatedAttempt.status}`);
      console.log(`  attempt.paidUntilAfter: ${updatedAttempt.paidUntilAfter || '(none)'}`);
      console.log(`  attempt.amountMismatch: ${updatedAttempt.amountMismatch}`);
      console.log(`  attempt.wasLateSuccess: ${updatedAttempt.wasLateSuccess}`);
      if (updatedGroup) {
        console.log(`  group.isPaid:  ${updatedGroup.isPaid}`);
        console.log(`  group.plan:    ${updatedGroup.plan}`);
        console.log(`  group.paidUntil: ${updatedGroup.paidUntil || '(none)'}`);
      } else {
        console.log('  group: (not found)');
      }
    } else {
      console.log('\nNo attempt matched this reference — nothing to report.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  });
