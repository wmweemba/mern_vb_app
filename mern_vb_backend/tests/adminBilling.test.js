/**
 * Admin billing tests — U3 (lipila-subscription-collection).
 *
 * Uses MongoMemoryReplSet because `activate` now runs inside a Mongo transaction
 * (session.withTransaction requires a replica set even in test environments).
 *
 * Covers:
 *  1. Activate on a trial group -> isPaid true, plan set, paidUntil ~ now+1mo,
 *     trialExpiresAt year 2099, exactly one admin audit row.
 *  2. Activate on a paid-up group (paidUntil in 10 days) -> extends from the OLD expiry.
 *  3. customPaidUntil path sets exactly that date.
 *  4. Invalid plan -> 400, group unchanged.
 *  5. markUnpaid behaviour unchanged.
 *  6. Unknown groupId -> 404.
 *  7. extendGroupSubscription directly, for a lapsed group (paidUntil in the past) ->
 *     extends from now, not from the stale past date.
 */

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());

  const billing = require('../controllers/adminBillingController');

  // Stub super-admin auth — this unit owns only the controller, not routes/admin.js
  // or requireSuperAdmin's Clerk lookup. The handler itself is what's under test.
  const stubSuperAdmin = (req, res, next) => {
    req.superAdmin = { clerkUserId: 'super_test', email: 'super@test.com' };
    req.isSuperAdmin = true;
    next();
  };

  app = express();
  app.use(express.json());
  app.get('/api/admin/billing/plans', billing.listPlans);
  app.post('/api/admin/groups/:groupId/billing/activate', stubSuperAdmin, billing.activate);
  app.post('/api/admin/groups/:groupId/billing/mark-unpaid', stubSuperAdmin, billing.markUnpaid);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

const Group = () => require('../models/Group');
const AdminAuditLog = () => require('../models/AdminAuditLog');

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

describe('adminBillingController.activate', () => {
  test('activates a trial group: isPaid, plan, paidUntil ~ now+1mo, trialExpiresAt 2099, one audit row', async () => {
    const group = await makeGroup();

    const res = await request(app)
      .post(`/api/admin/groups/${group._id}/billing/activate`)
      .send({ plan: 'starter', durationMonths: 1 });

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('starter');

    const updated = await Group().findById(group._id);
    expect(updated.isPaid).toBe(true);
    expect(updated.plan).toBe('starter');
    expect(updated.trialExpiresAt.getUTCFullYear()).toBe(2099);

    const now = new Date();
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() + 1);
    expect(Math.abs(updated.paidUntil.getTime() - expected.getTime())).toBeLessThan(5000);

    const logs = await AdminAuditLog().find({ action: 'billing.activate', groupId: group._id });
    expect(logs.length).toBe(1);
    expect(logs[0].metadata.after.isPaid).toBe(true);
  });

  test('activates a paid-up group: extends from the OLD expiry, not from now', async () => {
    const oldPaidUntil = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days out
    const group = await makeGroup({ isPaid: true, paidUntil: oldPaidUntil, plan: 'starter' });

    const res = await request(app)
      .post(`/api/admin/groups/${group._id}/billing/activate`)
      .send({ plan: 'starter', durationMonths: 1 });

    expect(res.status).toBe(200);
    const updated = await Group().findById(group._id);

    const expected = new Date(oldPaidUntil);
    expected.setMonth(expected.getMonth() + 1);
    expect(Math.abs(updated.paidUntil.getTime() - expected.getTime())).toBeLessThan(5000);
  });

  test('customPaidUntil sets exactly that date', async () => {
    const group = await makeGroup();
    const custom = new Date('2027-03-15T00:00:00.000Z');

    const res = await request(app)
      .post(`/api/admin/groups/${group._id}/billing/activate`)
      .send({ plan: 'standard', customPaidUntil: custom.toISOString() });

    expect(res.status).toBe(200);
    const updated = await Group().findById(group._id);
    expect(updated.paidUntil.toISOString()).toBe(custom.toISOString());
    expect(updated.plan).toBe('standard');
  });

  test('invalid plan -> 400, group unchanged', async () => {
    const group = await makeGroup();

    const res = await request(app)
      .post(`/api/admin/groups/${group._id}/billing/activate`)
      .send({ plan: 'not_a_plan', durationMonths: 1 });

    expect(res.status).toBe(400);
    const unchanged = await Group().findById(group._id);
    expect(unchanged.isPaid).toBe(false);
    expect(unchanged.plan).toBeNull();

    const logs = await AdminAuditLog().find({ groupId: group._id });
    expect(logs.length).toBe(0);
  });

  test('unknown groupId -> 404', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/admin/groups/${fakeId}/billing/activate`)
      .send({ plan: 'starter', durationMonths: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Group not found');
  });

  test('invalid customPaidUntil -> 400 before touching the group', async () => {
    const group = await makeGroup();
    const res = await request(app)
      .post(`/api/admin/groups/${group._id}/billing/activate`)
      .send({ plan: 'starter', customPaidUntil: 'not-a-date' });

    expect(res.status).toBe(400);
    const unchanged = await Group().findById(group._id);
    expect(unchanged.isPaid).toBe(false);
  });
});

describe('adminBillingController.markUnpaid (unchanged)', () => {
  test('sets isPaid false and paidUntil null, logs one audit row', async () => {
    const group = await makeGroup({ isPaid: true, paidUntil: new Date(), plan: 'starter' });

    const res = await request(app)
      .post(`/api/admin/groups/${group._id}/billing/mark-unpaid`)
      .send({});

    expect(res.status).toBe(200);
    const updated = await Group().findById(group._id);
    expect(updated.isPaid).toBe(false);
    expect(updated.paidUntil).toBeNull();
    // plan is left untouched by markUnpaid (pre-existing behaviour)
    expect(updated.plan).toBe('starter');

    const logs = await AdminAuditLog().find({ action: 'billing.mark_unpaid', groupId: group._id });
    expect(logs.length).toBe(1);
  });

  test('unknown groupId -> 404', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post(`/api/admin/groups/${fakeId}/billing/mark-unpaid`)
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('extendGroupSubscription (direct)', () => {
  const { extendGroupSubscription } = require('../utils/subscription');

  test('a lapsed group (paidUntil in the past) extends from now, not from the stale date', async () => {
    const pastPaidUntil = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const group = await makeGroup({ isPaid: true, paidUntil: pastPaidUntil, plan: 'starter' });

    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = await extendGroupSubscription(session, {
          groupId: group._id, plan: 'starter', durationMonths: 1,
        });
      });
    } finally {
      session.endSession();
    }

    expect(result).not.toBeNull();
    const now = new Date();
    const expected = new Date(now);
    expected.setMonth(expected.getMonth() + 1);
    expect(Math.abs(result.paidUntil.getTime() - expected.getTime())).toBeLessThan(5000);
    // not extended from the stale past paidUntil
    const wrongExpected = new Date(pastPaidUntil);
    wrongExpected.setMonth(wrongExpected.getMonth() + 1);
    expect(Math.abs(result.paidUntil.getTime() - wrongExpected.getTime())).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  test('returns null for a missing group', async () => {
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = await extendGroupSubscription(session, {
          groupId: new mongoose.Types.ObjectId(), plan: 'starter', durationMonths: 1,
        });
      });
    } finally {
      session.endSession();
    }
    expect(result).toBeNull();
  });
});
