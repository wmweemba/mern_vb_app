/**
 * Signup source tracking (U2) — Group.signupRef + new-group Telegram alert.
 *
 * Covers:
 *  a. Valid mixed-case ref -> stored lower-case, notifyNewGroup called once with it.
 *  b. Invalid ref (<script>) -> signupRef null, alert called with ref: null.
 *  c. No ref -> signupRef null.
 *  d. notifyNewGroup rejecting never blocks the 201 / the group existing (D10).
 *  e. Duplicate group name (409) -> notifyNewGroup NOT called.
 *  f. Super-admin createGroup -> Group.signupRef === 'admin'.
 *
 * Plus a direct unit test of utils/notifyNewGroup itself (env-gated, never throws).
 */

// --- Clerk mock: userId is just whatever follows "Bearer " ---
jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: (req) => {
    const auth = req.headers?.authorization || '';
    const match = auth.match(/^Bearer (.+)$/);
    if (!match) return {};
    return { userId: match[1] };
  },
}));

jest.mock('../utils/notifyNewGroup', () => ({
  notifyNewGroup: jest.fn().mockResolvedValue(),
}));

jest.setTimeout(120000);

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');

let mongoServer;
let groupApp;
let adminApp;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());

  const { verifyToken } = require('../middleware/auth');
  const groupController = require('../controllers/groupController');
  groupApp = express();
  groupApp.use(express.json());
  groupApp.post('/api/groups', verifyToken, groupController.createGroup);

  // Cheap harness for the super-admin path, same pattern as adminBilling.test.js —
  // the controller itself doesn't check req.isSuperAdmin, so a stub is enough.
  const adminGroupsController = require('../controllers/adminGroupsController');
  const stubSuperAdmin = (req, res, next) => {
    req.superAdmin = { clerkUserId: 'super_test', email: 'super@test.com' };
    req.isSuperAdmin = true;
    next();
  };
  adminApp = express();
  adminApp.use(express.json());
  adminApp.post('/api/admin/groups', stubSuperAdmin, adminGroupsController.createGroup);
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
const { notifyNewGroup } = require('../utils/notifyNewGroup');

describe('Group seeding — signupRef', () => {
  test('a. valid mixed-case ref stored lower-case; alert called once with it', async () => {
    const res = await request(groupApp)
      .post('/api/groups')
      .set('Authorization', 'Bearer user_a')
      .send({
        groupName: 'Ref Test Group A',
        treasurerName: 'Treasurer A',
        signupRef: 'P-Maluba',
      });

    expect(res.statusCode).toBe(201);
    const group = await Group().findById(res.body.group.id);
    expect(group.signupRef).toBe('p-maluba');

    // notifyNewGroup is fire-and-forget (no await in the controller) — flush
    // the microtask queue before asserting it was called.
    await new Promise((r) => setImmediate(r));
    expect(notifyNewGroup).toHaveBeenCalledTimes(1);
    expect(notifyNewGroup).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'p-maluba', groupName: 'Ref Test Group A' }),
    );
  });

  test('b. invalid ref (<script>) -> signupRef null, alert called with ref: null', async () => {
    const res = await request(groupApp)
      .post('/api/groups')
      .set('Authorization', 'Bearer user_b')
      .send({
        groupName: 'Ref Test Group B',
        treasurerName: 'Treasurer B',
        signupRef: '<script>',
      });

    expect(res.statusCode).toBe(201);
    const group = await Group().findById(res.body.group.id);
    expect(group.signupRef).toBeNull();

    await new Promise((r) => setImmediate(r));
    expect(notifyNewGroup).toHaveBeenCalledWith(expect.objectContaining({ ref: null }));
  });

  test('c. no ref -> signupRef null', async () => {
    const res = await request(groupApp)
      .post('/api/groups')
      .set('Authorization', 'Bearer user_c')
      .send({
        groupName: 'Ref Test Group C',
        treasurerName: 'Treasurer C',
      });

    expect(res.statusCode).toBe(201);
    const group = await Group().findById(res.body.group.id);
    expect(group.signupRef).toBeNull();
  });

  test('d. notifyNewGroup rejecting never blocks the 201 / the group existing (D10)', async () => {
    notifyNewGroup.mockRejectedValueOnce(new Error('telegram down'));

    const res = await request(groupApp)
      .post('/api/groups')
      .set('Authorization', 'Bearer user_d')
      .send({
        groupName: 'Ref Test Group D',
        treasurerName: 'Treasurer D',
        signupRef: 'fb',
      });

    expect(res.statusCode).toBe(201);
    const group = await Group().findById(res.body.group.id);
    expect(group).not.toBeNull();
    expect(group.signupRef).toBe('fb');

    // Flush the rejected promise's .catch() before the test (and its implicit
    // unhandled-rejection window) ends.
    await new Promise((r) => setImmediate(r));
  });

  test('e. duplicate group name (409) -> notifyNewGroup NOT called', async () => {
    const first = await request(groupApp)
      .post('/api/groups')
      .set('Authorization', 'Bearer user_e1')
      .send({ groupName: 'Ref Test Group E', treasurerName: 'Treasurer E1' });
    expect(first.statusCode).toBe(201);

    jest.clearAllMocks();

    const dupe = await request(groupApp)
      .post('/api/groups')
      .set('Authorization', 'Bearer user_e2')
      .send({ groupName: 'Ref Test Group E', treasurerName: 'Treasurer E2' });

    expect(dupe.statusCode).toBe(409);
    await new Promise((r) => setImmediate(r));
    expect(notifyNewGroup).not.toHaveBeenCalled();
  });

  test('f. super-admin createGroup stores signupRef: "admin"', async () => {
    const res = await request(adminApp)
      .post('/api/admin/groups')
      .send({
        name: 'Ref Test Admin Group',
        adminName: 'Admin Creator',
      });

    expect(res.statusCode).toBe(201);
    const group = await Group().findById(res.body._id);
    expect(group.signupRef).toBe('admin');
  });
});

describe('utils/notifyNewGroup — direct unit tests', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete global.fetch;
  });

  test('env vars set, fetch rejects -> resolves without throwing', async () => {
    jest.resetModules();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const { notifyNewGroup: realNotify } = jest.requireActual('../utils/notifyNewGroup');
    await expect(realNotify({
      groupName: 'X', treasurerName: 'Y', templateKey: 'village_bank', ref: 'fb',
    })).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('env vars unset -> fetch not called', async () => {
    jest.resetModules();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    global.fetch = jest.fn();

    const { notifyNewGroup: realNotify } = jest.requireActual('../utils/notifyNewGroup');
    await realNotify({ groupName: 'X', treasurerName: 'Y', templateKey: 'village_bank', ref: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('HTML-escapes groupName and shows "direct" when ref is null', async () => {
    jest.resetModules();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';
    let capturedBody;
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true });
    });

    const { notifyNewGroup: realNotify } = jest.requireActual('../utils/notifyNewGroup');
    await realNotify({ groupName: '<b>x', treasurerName: 'Y', templateKey: 'village_bank', ref: null });

    expect(capturedBody.text).toContain('&lt;b&gt;x');
    expect(capturedBody.text).toContain('Source:</b> direct');
  });
});
