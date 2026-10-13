/**
 * POST /api/webhooks/lipila/subscriptions tests — U7 (lipila-subscription-collection).
 *
 * Uses MongoMemoryReplSet because resolveAttempt() runs inside a Mongo
 * transaction. Mirrors the harness in tests/subscriptionCollection.test.js.
 * notifyBilling is mocked so no network calls happen during activation.
 */

jest.mock('../utils/notifyBilling');

jest.setTimeout(120000);

const crypto = require('crypto');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');

let mongoServer;
let app;

const SECRET = 'whsec_' + Buffer.from('test-lipila-webhook-secret-32bytes!!').toString('base64');

function sign({ id, timestamp, body }) {
  const secretBytes = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64');
  const digest = crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${digest}`;
}

function sendWebhook({ body, id = 'msg_1', timestamp, signature, headers = {} } = {}) {
  const ts = timestamp !== undefined ? timestamp : Math.floor(Date.now() / 1000).toString();
  const sig = signature !== undefined ? signature : sign({ id, timestamp: ts, body });
  let req = request(app)
    .post('/api/webhooks/lipila/subscriptions')
    .set('Content-Type', 'application/json');
  if (id !== null) req = req.set('webhook-id', id);
  if (ts !== null) req = req.set('webhook-timestamp', ts);
  if (sig !== null) req = req.set('webhook-signature', sig);
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return req.send(body);
}

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());

  process.env.LIPILA_WEBHOOK_SECRET = SECRET;

  app = express();
  app.use('/api/webhooks', require('../routes/webhookRoutes'));
  app.use(express.json());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

const Group = () => require('../models/Group');
const SubscriptionPayment = () => require('../models/SubscriptionPayment');

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
  const reference = `c360-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    reference,
    status: 'pending',
    ...overrides,
  });
  return { group, attempt };
}

function collectionPayload(attempt, overrides = {}) {
  return {
    referenceId: attempt.reference,
    type: 'Collection',
    status: 'Successful',
    amount: attempt.amount,
    currency: attempt.currency,
    accountNumber: attempt.msisdn,
    paymentType: 'mobile-money',
    identifier: 'LPLXC-1',
    externalId: 'MNO-REF-1',
    message: '',
    ...overrides,
  };
}

describe('POST /api/webhooks/lipila/subscriptions', () => {
  test('bad signature -> 401, attempt unchanged', async () => {
    const { attempt } = await makeAttempt();
    const body = JSON.stringify(collectionPayload(attempt));

    const res = await sendWebhook({ body, signature: 'v1,bm90dGhlc2lnbmF0dXJl' });

    expect(res.status).toBe(401);
    const unchanged = await SubscriptionPayment().findById(attempt._id);
    expect(unchanged.status).toBe('pending');
  });

  test('old timestamp (replay) -> 401', async () => {
    const { attempt } = await makeAttempt();
    const body = JSON.stringify(collectionPayload(attempt));
    const oldTs = (Math.floor(Date.now() / 1000) - 400).toString();

    const res = await sendWebhook({ body, timestamp: oldTs });

    expect(res.status).toBe(401);
    const unchanged = await SubscriptionPayment().findById(attempt._id);
    expect(unchanged.status).toBe('pending');
  });

  test('missing headers -> 401', async () => {
    const { attempt } = await makeAttempt();
    const body = JSON.stringify(collectionPayload(attempt));

    const res = await sendWebhook({ body, id: null, timestamp: null, signature: null });

    expect(res.status).toBe(401);
    const unchanged = await SubscriptionPayment().findById(attempt._id);
    expect(unchanged.status).toBe('pending');
  });

  test('signed but unparseable body -> 200', async () => {
    const body = '{not valid json';
    const res = await sendWebhook({ body });
    expect(res.status).toBe(200);
  });

  test('type Disbursement -> 200, attempt unchanged', async () => {
    const { attempt } = await makeAttempt();
    const body = JSON.stringify(collectionPayload(attempt, { type: 'Disbursement' }));

    const res = await sendWebhook({ body });

    expect(res.status).toBe(200);
    const unchanged = await SubscriptionPayment().findById(attempt._id);
    expect(unchanged.status).toBe('pending');
  });

  test('unknown referenceId -> 200, nothing written', async () => {
    const body = JSON.stringify({
      referenceId: 'does-not-exist',
      type: 'Collection',
      status: 'Successful',
      amount: 200,
      currency: 'ZMW',
    });

    const res = await sendWebhook({ body });

    expect(res.status).toBe(200);
    const count = await SubscriptionPayment().countDocuments({});
    expect(count).toBe(0);
  });

  test('valid Successful for a pending attempt -> 200, attempt success, group paidUntil extended by one month', async () => {
    const { group, attempt } = await makeAttempt();
    const body = JSON.stringify(collectionPayload(attempt));

    const res = await sendWebhook({ body });

    expect(res.status).toBe(200);
    const updatedAttempt = await SubscriptionPayment().findById(attempt._id);
    expect(updatedAttempt.status).toBe('success');

    const updatedGroup = await Group().findById(group._id);
    const expected = new Date();
    expected.setMonth(expected.getMonth() + 1);
    expect(Math.abs(updatedGroup.paidUntil.getTime() - expected.getTime())).toBeLessThan(10000);
    expect(updatedGroup.isPaid).toBe(true);
  });

  test('same webhook delivered 3 times -> group extended exactly once', async () => {
    const { group, attempt } = await makeAttempt();
    const body = JSON.stringify(collectionPayload(attempt));

    await sendWebhook({ body, id: 'msg_dup' });
    await sendWebhook({ body, id: 'msg_dup' });
    await sendWebhook({ body, id: 'msg_dup' });

    const updatedGroup = await Group().findById(group._id);
    const expected = new Date();
    expected.setMonth(expected.getMonth() + 1);
    expect(Math.abs(updatedGroup.paidUntil.getTime() - expected.getTime())).toBeLessThan(10000);
  });

  test('valid Failed -> attempt failed, group unchanged', async () => {
    const { group, attempt } = await makeAttempt();
    const body = JSON.stringify(collectionPayload(attempt, { status: 'Failed', message: 'Incorrect pin has been entered.', externalId: '' }));

    const res = await sendWebhook({ body });

    expect(res.status).toBe(200);
    const updatedAttempt = await SubscriptionPayment().findById(attempt._id);
    expect(updatedAttempt.status).toBe('failed');
    expect(updatedAttempt.failureReason).toBe('Incorrect pin has been entered.');

    const updatedGroup = await Group().findById(group._id);
    expect(updatedGroup.isPaid).toBe(false);
  });

  test('content-type text/plain is still verified correctly (raw body Buffer)', async () => {
    const { group, attempt } = await makeAttempt();
    const body = JSON.stringify(collectionPayload(attempt));
    const id = 'msg_textplain';
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = sign({ id, timestamp: ts, body });

    const res = await request(app)
      .post('/api/webhooks/lipila/subscriptions')
      .set('Content-Type', 'text/plain')
      .set('webhook-id', id)
      .set('webhook-timestamp', ts)
      .set('webhook-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    const updatedAttempt = await SubscriptionPayment().findById(attempt._id);
    expect(updatedAttempt.status).toBe('success');
    const updatedGroup = await Group().findById(group._id);
    expect(updatedGroup.isPaid).toBe(true);
  });

  test('resolveAttempt throwing -> 500', async () => {
    const subscriptionCollection = require('../utils/subscriptionCollection');
    const spy = jest.spyOn(subscriptionCollection, 'resolveAttempt').mockRejectedValueOnce(new Error('boom'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { attempt } = await makeAttempt();
    const body = JSON.stringify(collectionPayload(attempt));

    const res = await sendWebhook({ body });

    expect(res.status).toBe(500);
    spy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
