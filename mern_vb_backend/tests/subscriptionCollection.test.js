/**
 * Resolver + notifications tests — U4 (lipila-subscription-collection).
 *
 * Uses MongoMemoryReplSet because resolveAttempt() runs inside a Mongo
 * transaction (session.withTransaction requires a replica set even in test
 * environments). Mirrors the harness in tests/adminBilling.test.js /
 * tests/contributionController.test.js.
 *
 * notifyBilling and lipilaClient (checkCollectionStatus, for reconcileAttempt)
 * are jest-mocked so no network calls happen and notifications are assertable.
 */

jest.mock('../utils/notifyBilling');
jest.mock('../utils/lipilaClient', () => ({
  checkCollectionStatus: jest.fn(),
}));
// Used only by the "notifyBilling (actual implementation)" describe block below,
// which bypasses the auto-mock above via jest.requireActual to exercise the real
// Telegram/Resend send logic with both channels failing.
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockRejectedValue(new Error('resend down')) },
  })),
}));

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Same convention as tests/contributionController.test.js / paymentController.test.js
// / etc. — MongoMemoryReplSet startup can exceed Jest's default 5s hook timeout when
// many suites spin one up in parallel.
jest.setTimeout(120000);

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  jest.clearAllMocks();
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

const Group = () => require('../models/Group');
const SubscriptionPayment = () => require('../models/SubscriptionPayment');
const { resolveAttempt, reconcileAttempt } = require('../utils/subscriptionCollection');
const { notifyAdminSubscriptionCollected, sendPaymentReceipt } = require('../utils/notifyBilling');
const { checkCollectionStatus } = require('../utils/lipilaClient');

async function makeGroup(overrides = {}) {
  return Group().create({
    name: 'ZZZ_TEST Group',
    slug: `zzz-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    trialExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    isPaid: false,
    paidUntil: null,
    plan: null,
    ...overrides,
  });
}

async function makeAttempt(overrides = {}) {
  const group = overrides.group || (await makeGroup());
  const attempt = await SubscriptionPayment().create({
    groupId: group._id,
    initiatedByMemberId: new mongoose.Types.ObjectId(),
    initiatedByName: 'Jane Treasurer',
    payerEmail: 'jane@example.com',
    plan: 'starter',
    periodMonths: 1,
    amount: 200,
    currency: 'ZMW',
    isTestAmount: false,
    msisdn: '260975551234',
    reference: `c360-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status: 'pending',
    ...overrides,
  });
  return { group, attempt };
}

function successResult(overrides = {}) {
  return {
    status: 'success',
    amount: 200,
    currency: 'ZMW',
    externalId: 'MNO-REF-1',
    identifier: 'LPLXC-1',
    raw: { status: 'Successful' },
    ...overrides,
  };
}

// resolveAttempt's post-commit notifications are detached (not awaited) so a
// hung Telegram/Resend call can never hang the webhook or poll route. Tests
// that assert on the notifyBilling mocks must flush the microtask queue first.
async function flush() {
  await new Promise((r) => setImmediate(r));
}

describe('resolveAttempt — success cases', () => {
  test('three identical success results -> exactly one extension and notifications called once', async () => {
    const { group, attempt } = await makeAttempt();

    const result = successResult();
    const outcomes = [];
    outcomes.push(await resolveAttempt(attempt._id, result));
    outcomes.push(await resolveAttempt(attempt._id, result));
    outcomes.push(await resolveAttempt(attempt._id, result));
    await flush();

    expect(outcomes[0].activated).toBe(true);
    expect(outcomes[1].activated).toBe(false);
    expect(outcomes[2].activated).toBe(false);

    const updatedGroup = await Group().findById(group._id);
    const now = new Date();
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() + 1);
    expect(Math.abs(updatedGroup.paidUntil.getTime() - expected.getTime())).toBeLessThan(5000);
    expect(updatedGroup.isPaid).toBe(true);
    expect(updatedGroup.plan).toBe('starter');

    expect(notifyAdminSubscriptionCollected).toHaveBeenCalledTimes(1);
    expect(sendPaymentReceipt).toHaveBeenCalledTimes(1);

    const updatedAttempt = await SubscriptionPayment().findById(attempt._id);
    expect(updatedAttempt.status).toBe('success');
  });

  test('late success (attempt failed -> success) activates with wasLateSuccess and warning', async () => {
    const { group, attempt } = await makeAttempt({ status: 'failed', failureReason: 'Incorrect pin has been entered.' });

    const outcome = await resolveAttempt(attempt._id, successResult());

    expect(outcome.activated).toBe(true);
    expect(outcome.warnings).toContain('late_success');
    expect(outcome.attempt.wasLateSuccess).toBe(true);

    const updatedGroup = await Group().findById(group._id);
    expect(updatedGroup.isPaid).toBe(true);
  });

  test('amount mismatch (result.amount 50 vs attempt.amount 200) activates and flags amountMismatch', async () => {
    const { attempt } = await makeAttempt({ amount: 200 });

    const outcome = await resolveAttempt(attempt._id, successResult({ amount: 50 }));

    expect(outcome.activated).toBe(true);
    expect(outcome.warnings).toContain('amount_mismatch');
    expect(outcome.attempt.amountMismatch).toBe(true);
  });

  test('group missing (hard-deleted) -> keeps success, failureReason group_missing, still notifies William but not a receipt', async () => {
    const { group, attempt } = await makeAttempt();
    await Group().findByIdAndDelete(group._id);

    const outcome = await resolveAttempt(attempt._id, successResult());
    await flush();

    expect(outcome.activated).toBe(false);
    expect(outcome.transitioned).toBe(true);
    const updatedAttempt = await SubscriptionPayment().findById(attempt._id);
    expect(updatedAttempt.status).toBe('success');
    expect(updatedAttempt.failureReason).toBe('group_missing');

    // Money arrived even though the group is gone — William must still be
    // told (source plan §5a), but there's no group/paidUntil to send a
    // payer receipt about.
    expect(notifyAdminSubscriptionCollected).toHaveBeenCalledTimes(1);
    const notifyArgs = notifyAdminSubscriptionCollected.mock.calls[0][0];
    expect(notifyArgs.warnings).toContain('group_missing');
    expect(sendPaymentReceipt).not.toHaveBeenCalled();
  });

  test('already_paid_up warning when group paidUntil was 20 days out before this payment', async () => {
    const paidUntil = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const group = await makeGroup({ isPaid: true, paidUntil, plan: 'starter' });
    const { attempt } = await makeAttempt({ group });

    const outcome = await resolveAttempt(attempt._id, successResult());

    expect(outcome.activated).toBe(true);
    expect(outcome.warnings).toContain('already_paid_up');
  });

  test('concurrent resolveAttempt(success) and an admin-style activate on the same group -> two months total, none lost', async () => {
    const group = await makeGroup();
    const { attempt } = await makeAttempt({ group });
    const { extendGroupSubscription } = require('../utils/subscription');

    const adminActivate = async () => {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await extendGroupSubscription(session, { groupId: group._id, plan: 'starter', durationMonths: 1 });
        });
      } finally {
        session.endSession();
      }
    };

    await Promise.all([resolveAttempt(attempt._id, successResult()), adminActivate()]);

    const updatedGroup = await Group().findById(group._id);
    const now = new Date();
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() + 2);
    expect(Math.abs(updatedGroup.paidUntil.getTime() - expected.getTime())).toBeLessThan(10000);
  });
});

describe('resolveAttempt — non-activating cases', () => {
  test('failed result never extends the group and sends no notifications', async () => {
    const { group, attempt } = await makeAttempt();

    const outcome = await resolveAttempt(attempt._id, { status: 'failed', message: 'Incorrect pin has been entered.' });

    expect(outcome.activated).toBe(false);
    expect(outcome.transitioned).toBe(true);
    const updatedAttempt = await SubscriptionPayment().findById(attempt._id);
    expect(updatedAttempt.status).toBe('failed');
    expect(updatedAttempt.failureReason).toBe('Incorrect pin has been entered.');

    const updatedGroup = await Group().findById(group._id);
    expect(updatedGroup.isPaid).toBe(false);
    expect(notifyAdminSubscriptionCollected).not.toHaveBeenCalled();
    expect(sendPaymentReceipt).not.toHaveBeenCalled();
  });

  test('failed on an already-failed attempt is a no-op', async () => {
    const { attempt } = await makeAttempt({ status: 'failed', failureReason: 'Failed' });

    const outcome = await resolveAttempt(attempt._id, { status: 'failed', message: 'Failed again' });

    expect(outcome.transitioned).toBe(false);
    const updatedAttempt = await SubscriptionPayment().findById(attempt._id);
    expect(updatedAttempt.failureReason).toBe('Failed');
  });

  test('unknown at 10 minutes stays pending and sets lastCheckedAt', async () => {
    const { attempt } = await makeAttempt({
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    await SubscriptionPayment().collection.updateOne({ _id: attempt._id }, { $set: { createdAt: new Date(Date.now() - 10 * 60 * 1000) } });

    const outcome = await resolveAttempt(attempt._id, { status: 'unknown', raw: null });

    expect(outcome.transitioned).toBe(false);
    expect(outcome.activated).toBe(false);
    const updatedAttempt = await SubscriptionPayment().findById(attempt._id);
    expect(updatedAttempt.status).toBe('pending');
    expect(updatedAttempt.lastCheckedAt).not.toBeNull();
  });

  test('unknown at 31 minutes -> failed with not_found_at_provider', async () => {
    const { attempt } = await makeAttempt();
    await SubscriptionPayment().collection.updateOne({ _id: attempt._id }, { $set: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } });

    const outcome = await resolveAttempt(attempt._id, { status: 'unknown', raw: null });

    expect(outcome.transitioned).toBe(true);
    const updatedAttempt = await SubscriptionPayment().findById(attempt._id);
    expect(updatedAttempt.status).toBe('failed');
    expect(updatedAttempt.failureReason).toBe('not_found_at_provider');
  });

  test('pending result sets lastCheckedAt and stays pending', async () => {
    const { attempt } = await makeAttempt();

    const outcome = await resolveAttempt(attempt._id, { status: 'pending', raw: null });

    expect(outcome.transitioned).toBe(false);
    const updatedAttempt = await SubscriptionPayment().findById(attempt._id);
    expect(updatedAttempt.status).toBe('pending');
    expect(updatedAttempt.lastCheckedAt).not.toBeNull();
  });

  test('already success is a no-op even on a new success result', async () => {
    const { attempt } = await makeAttempt({ status: 'success', completedAt: new Date() });

    const outcome = await resolveAttempt(attempt._id, successResult());

    expect(outcome.transitioned).toBe(false);
    expect(outcome.activated).toBe(false);
    expect(notifyAdminSubscriptionCollected).not.toHaveBeenCalled();
  });

  test('missing attempt returns transitioned: false, attempt: null', async () => {
    const outcome = await resolveAttempt(new mongoose.Types.ObjectId(), successResult());
    expect(outcome.transitioned).toBe(false);
    expect(outcome.attempt).toBeNull();
  });
});

describe('reconcileAttempt', () => {
  test('calls checkCollectionStatus only for pending attempts', async () => {
    const { attempt: pendingAttempt } = await makeAttempt();
    checkCollectionStatus.mockResolvedValueOnce({ status: 'pending', raw: null });

    await reconcileAttempt(pendingAttempt._id);
    expect(checkCollectionStatus).toHaveBeenCalledTimes(1);
    expect(checkCollectionStatus).toHaveBeenCalledWith({ reference: pendingAttempt.reference });
  });

  test('does not call checkCollectionStatus for a non-pending attempt', async () => {
    const { attempt: failedAttempt } = await makeAttempt({ status: 'failed', failureReason: 'Failed' });

    const result = await reconcileAttempt(failedAttempt._id);
    expect(checkCollectionStatus).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });

  test('returns null for a missing attempt', async () => {
    const result = await reconcileAttempt(new mongoose.Types.ObjectId());
    expect(result).toBeNull();
    expect(checkCollectionStatus).not.toHaveBeenCalled();
  });

  test('resolves via the fetched status, activating the group on success', async () => {
    const { group, attempt } = await makeAttempt();
    checkCollectionStatus.mockResolvedValueOnce(successResult());

    const result = await reconcileAttempt(attempt._id);
    expect(result.status).toBe('success');
    const updatedGroup = await Group().findById(group._id);
    expect(updatedGroup.isPaid).toBe(true);
  });
});

// Bypasses the top-level jest.mock('../utils/notifyBilling') to exercise the
// real Telegram/Resend send logic, with fetch (Telegram) and Resend (mocked
// above, module-wide) both failing.
describe('notifyBilling (actual implementation)', () => {
  const realNotifyBilling = jest.requireActual('../utils/notifyBilling');
  let originalFetch;
  let originalEnv;
  let consoleErrorSpy;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.TELEGRAM_BOT_TOKEN = 'tg-token';
    process.env.TELEGRAM_CHAT_ID = 'tg-chat';
    process.env.RESEND_API_KEY = 're-key';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('telegram down'));
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    consoleErrorSpy.mockRestore();
  });

  test('notifyAdminSubscriptionCollected never throws when both channels reject; message contains only the masked MSISDN', async () => {
    await expect(
      realNotifyBilling.notifyAdminSubscriptionCollected({
        groupName: 'ZZZ_TEST Group',
        payerName: 'Jane',
        plan: 'Starter',
        amount: 200,
        currency: 'ZMW',
        paidUntil: new Date(),
        providerExternalId: 'MNO-1',
        maskedMsisdn: '•••234',
        isTestAmount: false,
        warnings: [],
      }),
    ).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.text).toContain('•••234');
    expect(callBody.text).not.toContain('260975551234');
  });

  test('sendPaymentReceipt never throws when Resend rejects', async () => {
    await expect(
      realNotifyBilling.sendPaymentReceipt({
        to: 'jane@example.com',
        groupName: 'ZZZ_TEST Group',
        plan: 'Starter',
        amount: 200,
        currency: 'ZMW',
        date: new Date(),
        providerExternalId: 'MNO-1',
        paidUntil: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});
