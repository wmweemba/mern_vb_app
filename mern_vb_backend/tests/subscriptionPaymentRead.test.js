/**
 * GET /api/billing/lipila/attempts/:attemptId, /latest, /history tests — U6
 * (lipila-subscription-collection).
 *
 * Harness copied from tests/subscriptionPaymentInitiate.test.js.
 * utils/subscriptionCollection is jest.mock'd so reconcileAttempt is a plain
 * jest.fn() — no network calls, and we can assert how many times (and when)
 * it's called.
 */

jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: () => ({ userId: 'user_test' }),
  clerkClient: { users: { getUser: jest.fn() } },
}));

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

jest.mock('../utils/subscriptionCollection', () => ({
  reconcileAttempt: jest.fn(),
}));

jest.setTimeout(120000);

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');

const { reconcileAttempt } = require('../utils/subscriptionCollection');

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
  reconcileAttempt.mockReset();
});

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
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

let refSeq = 0;
async function makeAttempt(groupId, overrides = {}) {
  const attempt = await SubscriptionPayment().create({
    groupId,
    initiatedByMemberId: new mongoose.Types.ObjectId(),
    initiatedByName: 'Jane Treasurer',
    payerEmail: 'jane@test.com',
    plan: 'starter',
    periodMonths: 1,
    amount: 200,
    currency: 'ZMW',
    msisdn: '260975551234',
    reference: `c360-test-${Date.now()}-${refSeq++}`,
    status: 'pending',
    ...overrides,
  });
  if (overrides.createdAt) {
    await SubscriptionPayment().collection.updateOne({ _id: attempt._id }, { $set: { createdAt: overrides.createdAt } });
  }
  if (overrides.lastCheckedAt !== undefined) {
    await SubscriptionPayment().collection.updateOne({ _id: attempt._id }, { $set: { lastCheckedAt: overrides.lastCheckedAt } });
  }
  return SubscriptionPayment().findById(attempt._id);
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

describe('GET /api/billing/lipila/attempts/:attemptId', () => {
  test('member role -> 403', async () => {
    const group = await makeGroup();
    const attempt = await makeAttempt(group._id);
    setAuth({ groupId: group._id, role: 'member' });
    const res = await request(app).get(`/api/billing/lipila/attempts/${attempt._id}`);
    expect(res.status).toBe(403);
  });

  test('loan_officer role -> 403', async () => {
    const group = await makeGroup();
    const attempt = await makeAttempt(group._id);
    setAuth({ groupId: group._id, role: 'loan_officer' });
    const res = await request(app).get(`/api/billing/lipila/attempts/${attempt._id}`);
    expect(res.status).toBe(403);
  });

  test('malformed id -> 404, no 500', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id });
    const res = await request(app).get('/api/billing/lipila/attempts/not-an-id');
    expect(res.status).toBe(404);
  });

  test("another group's attempt -> 404", async () => {
    const group = await makeGroup();
    const otherGroup = await makeGroup();
    const attempt = await makeAttempt(otherGroup._id);
    setAuth({ groupId: group._id });
    const res = await request(app).get(`/api/billing/lipila/attempts/${attempt._id}`);
    expect(res.status).toBe(404);
  });

  test('fresh pending (< 20s) does NOT reconcile', async () => {
    const group = await makeGroup();
    const attempt = await makeAttempt(group._id, { status: 'pending' });
    setAuth({ groupId: group._id });
    const res = await request(app).get(`/api/billing/lipila/attempts/${attempt._id}`);
    expect(res.status).toBe(200);
    expect(reconcileAttempt).not.toHaveBeenCalled();
  });

  test('stale pending with lastCheckedAt null DOES reconcile once', async () => {
    const group = await makeGroup();
    const attempt = await makeAttempt(group._id, {
      status: 'pending',
      createdAt: new Date(Date.now() - 30 * 1000),
    });
    reconcileAttempt.mockResolvedValue({ ...attempt.toObject(), status: 'success', paidUntilAfter: new Date() });
    setAuth({ groupId: group._id });
    const res = await request(app).get(`/api/billing/lipila/attempts/${attempt._id}`);
    expect(res.status).toBe(200);
    expect(reconcileAttempt).toHaveBeenCalledTimes(1);
  });

  test('stale pending with lastCheckedAt 5s ago does NOT reconcile', async () => {
    const group = await makeGroup();
    const attempt = await makeAttempt(group._id, {
      status: 'pending',
      createdAt: new Date(Date.now() - 30 * 1000),
      lastCheckedAt: new Date(Date.now() - 5 * 1000),
    });
    setAuth({ groupId: group._id });
    const res = await request(app).get(`/api/billing/lipila/attempts/${attempt._id}`);
    expect(res.status).toBe(200);
    expect(reconcileAttempt).not.toHaveBeenCalled();
  });

  test('a reconcile throw does not 500 the poll', async () => {
    const group = await makeGroup();
    const attempt = await makeAttempt(group._id, {
      status: 'pending',
      createdAt: new Date(Date.now() - 30 * 1000),
    });
    reconcileAttempt.mockRejectedValue(new Error('network blip'));
    setAuth({ groupId: group._id });
    const res = await request(app).get(`/api/billing/lipila/attempts/${attempt._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending');
  });

  test('failed attempt returns failureKind pin, no failureReason/msisdn in body', async () => {
    const group = await makeGroup();
    const attempt = await makeAttempt(group._id, {
      status: 'failed',
      failureReason: 'Incorrect pin has been entered.',
      completedAt: new Date(),
    });
    setAuth({ groupId: group._id });
    const res = await request(app).get(`/api/billing/lipila/attempts/${attempt._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.failureKind).toBe('pin');
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/failureReason/);
    expect(bodyStr).not.toMatch(/msisdn/i);
    expect(bodyStr).not.toMatch(/Incorrect pin/);
  });
});

describe('GET /api/billing/lipila/latest', () => {
  test('role guard -> 403 for member', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id, role: 'member' });
    const res = await request(app).get('/api/billing/lipila/latest');
    expect(res.status).toBe(403);
  });

  test('kill switch off -> enabled:false, attempt:null, no reconcile', async () => {
    delete process.env.LIPILA_ENABLED;
    const group = await makeGroup();
    await makeAttempt(group._id, { status: 'pending', createdAt: new Date(Date.now() - 30 * 1000) });
    setAuth({ groupId: group._id });
    const res = await request(app).get('/api/billing/lipila/latest');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ enabled: false, attempt: null });
    expect(reconcileAttempt).not.toHaveBeenCalled();
  });

  test('no attempt -> attempt null, enabled true', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id });
    const res = await request(app).get('/api/billing/lipila/latest');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ enabled: true, attempt: null });
  });

  test('success within 24h -> returned', async () => {
    const group = await makeGroup();
    const attempt = await makeAttempt(group._id, {
      status: 'success',
      paidUntilAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      completedAt: new Date(),
    });
    setAuth({ groupId: group._id });
    const res = await request(app).get('/api/billing/lipila/latest');
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.attempt).not.toBeNull();
    expect(res.body.data.attempt.attemptId).toBe(String(attempt._id));
    expect(res.body.data.attempt.maskedMsisdn).toBe('•••234');
  });

  test('pending older than 10 min is hidden', async () => {
    const group = await makeGroup();
    await makeAttempt(group._id, {
      status: 'pending',
      createdAt: new Date(Date.now() - 11 * 60 * 1000),
      lastCheckedAt: new Date(),
    });
    setAuth({ groupId: group._id });
    const res = await request(app).get('/api/billing/lipila/latest');
    expect(res.status).toBe(200);
    expect(res.body.data.attempt).toBeNull();
  });

  test('a failed retry after a success still returns the success', async () => {
    const group = await makeGroup();
    const success = await makeAttempt(group._id, {
      status: 'success',
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 60 * 60 * 1000),
      paidUntilAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await makeAttempt(group._id, {
      status: 'failed',
      failureReason: 'Incorrect pin has been entered.',
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
      completedAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    setAuth({ groupId: group._id });
    const res = await request(app).get('/api/billing/lipila/latest');
    expect(res.status).toBe(200);
    expect(res.body.data.attempt.attemptId).toBe(String(success._id));
    expect(res.body.data.attempt.status).toBe('success');
  });

  test('anything older than 24h is hidden', async () => {
    const group = await makeGroup();
    await makeAttempt(group._id, {
      status: 'success',
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    setAuth({ groupId: group._id });
    const res = await request(app).get('/api/billing/lipila/latest');
    expect(res.status).toBe(200);
    expect(res.body.data.attempt).toBeNull();
  });
});

describe('GET /api/billing/lipila/history', () => {
  test('role guard -> 403 for loan_officer', async () => {
    const group = await makeGroup();
    setAuth({ groupId: group._id, role: 'loan_officer' });
    const res = await request(app).get('/api/billing/lipila/history');
    expect(res.status).toBe(403);
  });

  test('only success, newest first, max 24, masked', async () => {
    const group = await makeGroup();
    await makeAttempt(group._id, { status: 'pending' });
    await makeAttempt(group._id, { status: 'failed', completedAt: new Date() });

    const older = await makeAttempt(group._id, {
      status: 'success',
      completedAt: new Date(Date.now() - 60 * 1000),
      paidUntilAfter: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
    });
    const newer = await makeAttempt(group._id, {
      status: 'success',
      completedAt: new Date(),
      paidUntilAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    setAuth({ groupId: group._id });
    const res = await request(app).get('/api/billing/lipila/history');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].maskedMsisdn).toBe('•••234');
    expect(new Date(res.body.data[0].date).getTime()).toBe(newer.completedAt.getTime());
    expect(new Date(res.body.data[1].date).getTime()).toBe(older.completedAt.getTime());
  });

  test('caps at 24 rows', async () => {
    const group = await makeGroup();
    for (let i = 0; i < 26; i++) {
      await makeAttempt(group._id, {
        status: 'success',
        completedAt: new Date(Date.now() - i * 1000),
      });
    }
    setAuth({ groupId: group._id });
    const res = await request(app).get('/api/billing/lipila/history');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(24);
  });
});
