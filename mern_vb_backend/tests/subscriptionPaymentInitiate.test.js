/**
 * POST /api/billing/lipila/initiate tests — U5 (lipila-subscription-collection).
 *
 * Uses MongoMemoryReplSet because the initiate handler runs inside a Mongo
 * transaction (session.withTransaction requires a replica set even in test
 * environments). Mirrors the harness in tests/contributionController.test.js.
 *
 * utils/lipilaClient is partially mocked: initiateCollection is a jest.fn()
 * (no network calls), classifyFailureReason stays the real implementation
 * (needed to assert failureKind on the 502 case).
 */

jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: () => ({ userId: 'user_test' }),
  clerkClient: { users: { getUser: jest.fn() } },
}));

// Mutable per-test auth state, read by the mocked resolveGroup below. This
// lets each test control req.groupId / req.role / req.member without
// re-deriving it from request headers.
const authState = { groupId: null, role: 'admin', member: null, isSuperAdmin: false };

jest.mock('../middleware/resolveGroup', () => ({
  resolveGroup: (req, res, next) => {
    req.groupId = authState.groupId;
    req.role = authState.role;
    req.member = authState.member;
    req.isSuperAdmin = authState.isSuperAdmin;
    req.groupScope = { groupId: authState.groupId };
    next();
  },
}));

jest.mock('../utils/lipilaClient', () => {
  const actual = jest.requireActual('../utils/lipilaClient');
  return { ...actual, initiateCollection: jest.fn() };
});

jest.setTimeout(120000);

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');

const { initiateCollection } = require('../utils/lipilaClient');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/billing/lipila', require('../routes/subscriptionPaymentRoutes'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.LIPILA_ENABLED = 'true';
  delete process.env.LIPILA_BASE_URL;
  delete process.env.LIPILA_TEST_AMOUNT;
  process.env.NODE_ENV = 'test';
  initiateCollection.mockReset();
  initiateCollection.mockResolvedValue({ outcome: 'pending', raw: { identifier: 'LPLXC-test' } });
});

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

const Group = () => require('../models/Group');
const GroupMember = () => require('../models/GroupMember');
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

async function makeActiveMembers(groupId, count) {
  const docs = Array.from({ length: count }, (_, i) => ({
    groupId,
    role: 'member',
    name: `Member ${i}`,
    active: true,
    deletedAt: null,
  }));
  return GroupMember().insertMany(docs);
}

function setAuth({ groupId, role = 'admin', member, isSuperAdmin = false }) {
  authState.groupId = groupId;
  authState.role = role;
  authState.isSuperAdmin = isSuperAdmin;
  authState.member = member || {
    _id: new mongoose.Types.ObjectId(),
    name: 'Jane Treasurer',
    email: 'jane@test.com',
  };
}

const VALID_MSISDN = '0975551234'; // normalizes to 260975551234

describe('POST /api/billing/lipila/initiate', () => {
  test('member role -> 403', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id, role: 'member' });
    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(403);
    expect(initiateCollection).not.toHaveBeenCalled();
  });

  test('loan_officer role -> 403', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id, role: 'loan_officer' });
    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(403);
  });

  test('kill switch unset -> 503', async () => {
    delete process.env.LIPILA_ENABLED;
    const group = await makeGroup();
    setAuth({ groupId: group._id });
    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('UNAVAILABLE');
  });

  test('invalid MSISDN -> 400', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id });
    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_MSISDN');
  });

  test('legacy no-expiry paid group -> 409 NO_EXPIRY_GROUP', async () => {
    const group = await makeGroup({ isPaid: true, paidUntil: null, plan: 'starter' });
    setAuth({ groupId: group._id });
    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NO_EXPIRY_GROUP');
  });

  test('21 active members + starter -> 409 PLAN_TOO_SMALL, Lipila never called', async () => {
    const group = await makeGroup();
    await makeActiveMembers(group._id, 21);
    setAuth({ groupId: group._id });
    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PLAN_TOO_SMALL');
    expect(res.body.data).toEqual({ activeCount: 21, memberLimit: 20 });
    expect(initiateCollection).not.toHaveBeenCalled();
  });

  test('exactly 20 active members + starter -> 201', async () => {
    const group = await makeGroup();
    await makeActiveMembers(group._id, 20);
    setAuth({ groupId: group._id });
    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.resumed).toBe(false);
    expect(res.body.data.amount).toBe(200);
    expect(res.body.data.maskedMsisdn).toBe('•••234');
  });

  test('resume within 90s with same plan+msisdn — Lipila called once total', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id });

    const first = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(first.status).toBe(201);
    expect(first.body.data.resumed).toBe(false);

    const second = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(second.status).toBe(201);
    expect(second.body.data.resumed).toBe(true);
    expect(second.body.data.attemptId).toBe(first.body.data.attemptId);

    expect(initiateCollection).toHaveBeenCalledTimes(1);
  });

  test('different plan within 90s -> 409 ATTEMPT_IN_PROGRESS', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id });

    const first = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'standard', msisdn: VALID_MSISDN });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('ATTEMPT_IN_PROGRESS');
  });

  test('6th attempt for the group within an hour -> 429 TOO_MANY_ATTEMPTS', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id });

    // Backdate 5 prior attempts past the 90s resume window but inside the hour
    // throttle window, each with a distinct msisdn so the msisdn throttle
    // doesn't fire first. Mongoose timestamps strip createdAt from $set, so
    // backdate via the raw collection.
    const backdate = new Date(Date.now() - 5 * 60 * 1000);
    for (let i = 0; i < 5; i++) {
      const attempt = await SubscriptionPayment().create({
        groupId: group._id,
        initiatedByMemberId: new mongoose.Types.ObjectId(),
        initiatedByName: 'Jane',
        plan: 'starter',
        periodMonths: 1,
        amount: 200,
        currency: 'ZMW',
        msisdn: `26097555${1000 + i}`,
        reference: `c360-test-${i}-${Date.now()}`,
        status: 'failed',
      });
      await SubscriptionPayment().collection.updateOne({ _id: attempt._id }, { $set: { createdAt: backdate } });
    }

    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('TOO_MANY_ATTEMPTS');
    expect(initiateCollection).not.toHaveBeenCalled();
  });

  test('4th attempt for the same MSISDN across groups within an hour -> 429', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id });

    const backdate = new Date(Date.now() - 5 * 60 * 1000);
    for (let i = 0; i < 3; i++) {
      const otherGroup = await makeGroup();
      const attempt = await SubscriptionPayment().create({
        groupId: otherGroup._id,
        initiatedByMemberId: new mongoose.Types.ObjectId(),
        initiatedByName: 'Jane',
        plan: 'starter',
        periodMonths: 1,
        amount: 200,
        currency: 'ZMW',
        msisdn: '260975551234',
        reference: `c360-test-msisdn-${i}-${Date.now()}`,
        status: 'failed',
      });
      await SubscriptionPayment().collection.updateOne({ _id: attempt._id }, { $set: { createdAt: backdate } });
    }

    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('TOO_MANY_ATTEMPTS');
    expect(initiateCollection).not.toHaveBeenCalled();
  });

  test('test amount used in dev with lipila.dev base URL', async () => {
    process.env.NODE_ENV = 'test';
    process.env.LIPILA_BASE_URL = 'https://api.lipila.dev';
    process.env.LIPILA_TEST_AMOUNT = '1';
    const group = await makeGroup();
    setAuth({ groupId: group._id });

    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(1);

    const attempt = await SubscriptionPayment().findOne({ groupId: group._id });
    expect(attempt.isTestAmount).toBe(true);
    expect(attempt.amount).toBe(1);
  });

  test('test amount ignored when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LIPILA_BASE_URL = 'https://api.lipila.dev';
    process.env.LIPILA_TEST_AMOUNT = '1';
    const group = await makeGroup();
    setAuth({ groupId: group._id });

    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(200);
  });

  test('test amount ignored when base URL is blz.lipila.io', async () => {
    process.env.NODE_ENV = 'test';
    process.env.LIPILA_BASE_URL = 'https://blz.lipila.io';
    process.env.LIPILA_TEST_AMOUNT = '1';
    const group = await makeGroup();
    setAuth({ groupId: group._id });

    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(200);
  });

  test('client-sent amount is ignored — price comes from PLANS server-side', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id });

    const res = await request(app)
      .post('/api/billing/lipila/initiate')
      .send({ plan: 'standard', msisdn: VALID_MSISDN, amount: 1, price: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(300);
  });

  test('Lipila failed outcome -> 502 COLLECTION_REJECTED, no raw text, attempt status failed', async () => {
    initiateCollection.mockResolvedValue({ outcome: 'failed', reason: 'Incorrect pin has been entered.' });
    const group = await makeGroup();
    setAuth({ groupId: group._id });

    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('COLLECTION_REJECTED');
    expect(res.body.data.failureKind).toBe('pin');
    expect(JSON.stringify(res.body)).not.toMatch(/Incorrect pin/);

    const attempt = await SubscriptionPayment().findOne({ groupId: group._id });
    expect(attempt.status).toBe('failed');
    expect(attempt.failureReason).toBe('Incorrect pin has been entered.');
  });

  test('Lipila ambiguous outcome -> stays pending, normal 201', async () => {
    initiateCollection.mockResolvedValue({ outcome: 'ambiguous', reason: 'timeout' });
    const group = await makeGroup();
    setAuth({ groupId: group._id });

    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');

    const attempt = await SubscriptionPayment().findOne({ groupId: group._id });
    expect(attempt.status).toBe('pending');
    expect(attempt.failureReason).toBe('timeout');
  });

  test('expired-trial group can still initiate (no checkTrial)', async () => {
    const group = await makeGroup({
      isPaid: false,
      trialExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    setAuth({ groupId: group._id });
    const res = await request(app).post('/api/billing/lipila/initiate').send({ plan: 'starter', msisdn: VALID_MSISDN });
    expect(res.status).toBe(201);
  });
});
