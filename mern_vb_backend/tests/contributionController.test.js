/**
 * Contribution feature tests — dual-balance backend.
 *
 * Uses MongoMemoryReplSet for all transactional tests (session.withTransaction
 * requires a replica set even in test environments).
 *
 * Test coverage:
 *  1. Happy path — contribution routes to main BankBalance
 *  2. Happy path — contribution routes to SocialFundBalance
 *  3. Override toggle — recorder flips the type's default routing
 *  4. Rollback — invalid type causes no partial writes
 *  5. Expense reduces social fund balance
 *  6. Overspend guard — 400 when expense > available balance
 *  7. Member cannot record a contribution (403)
 *  8. Member cannot create a contribution type (403)
 *  9. Cross-group isolation — group A data never leaks to group B
 * 10. New group seeds two default ContributionTypes + zeroed SocialFundBalance
 */

// --- Clerk mock (must be first) ---
jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: (req) => {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer valid-admin-token'))   return { userId: 'user_admin' };
    if (auth.startsWith('Bearer valid-member-token'))  return { userId: 'user_member' };
    if (auth.startsWith('Bearer valid-admin2-token'))  return { userId: 'user_admin2' };
    return {};
  },
}));

// --- resolveGroup mock: controlled per token ---
jest.mock('../middleware/resolveGroup', () => ({
  resolveGroup: (req, res, next) => {
    const mongoose = require('mongoose');
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer valid-admin-token')) {
      req.groupId    = mongoose.Types.ObjectId.createFromHexString('aaaaaaaaaaaaaaaaaaaaaaaa');
      req.memberId   = mongoose.Types.ObjectId.createFromHexString('cccccccccccccccccccccccc');
      req.groupScope = { groupId: mongoose.Types.ObjectId.createFromHexString('aaaaaaaaaaaaaaaaaaaaaaaa') };
      req.role       = 'admin';
      req.user       = { id: req.memberId, role: 'admin', groupId: req.groupId };
      req.isSuperAdmin = false;
      return next();
    }
    if (auth.startsWith('Bearer valid-member-token')) {
      req.groupId    = mongoose.Types.ObjectId.createFromHexString('aaaaaaaaaaaaaaaaaaaaaaaa');
      req.memberId   = mongoose.Types.ObjectId.createFromHexString('dddddddddddddddddddddddd');
      req.groupScope = { groupId: mongoose.Types.ObjectId.createFromHexString('aaaaaaaaaaaaaaaaaaaaaaaa') };
      req.role       = 'member';
      req.user       = { id: req.memberId, role: 'member', groupId: req.groupId };
      req.isSuperAdmin = false;
      return next();
    }
    if (auth.startsWith('Bearer valid-admin2-token')) {
      req.groupId    = mongoose.Types.ObjectId.createFromHexString('bbbbbbbbbbbbbbbbbbbbbbbb');
      req.memberId   = mongoose.Types.ObjectId.createFromHexString('eeeeeeeeeeeeeeeeeeeeeeee');
      req.groupScope = { groupId: mongoose.Types.ObjectId.createFromHexString('bbbbbbbbbbbbbbbbbbbbbbbb') };
      req.role       = 'admin';
      req.user       = { id: req.memberId, role: 'admin', groupId: req.groupId };
      req.isSuperAdmin = false;
      return next();
    }
    return res.status(401).json({ error: 'Unauthenticated' });
  },
}));

// --- checkTrial mock: always passes ---
jest.mock('../middleware/checkTrial', () => ({
  checkTrial: (req, res, next) => next(),
}));

jest.setTimeout(120000);

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');

let mongoServer;
let app;

// IDs used across tests
const GROUP_A = mongoose.Types.ObjectId.createFromHexString('aaaaaaaaaaaaaaaaaaaaaaaa');
const GROUP_B = mongoose.Types.ObjectId.createFromHexString('bbbbbbbbbbbbbbbbbbbbbbbb');
const ADMIN_A = mongoose.Types.ObjectId.createFromHexString('cccccccccccccccccccccccc');
const ADMIN_B = mongoose.Types.ObjectId.createFromHexString('eeeeeeeeeeeeeeeeeeeeeeee');

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());

  const { verifyToken } = require('../middleware/auth');
  const { resolveGroup } = require('../middleware/resolveGroup');
  const { checkTrial } = require('../middleware/checkTrial');

  app.use('/api/contribution-types', require('../routes/contributionTypes'));
  app.use('/api/contributions', require('../routes/contributions'));
  app.use('/api/social-fund', require('../routes/socialFund'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Clean all collections between tests for isolation
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// --- helpers ---

const GroupMember       = () => require('../models/GroupMember');
const BankBalance       = () => require('../models/BankBalance');
const SocialFundBalance = () => require('../models/SocialFundBalance');
const Contribution      = () => require('../models/Contribution');
const Transaction       = () => require('../models/Transaction');
const SocialFundExpense = () => require('../models/SocialFundExpense');
const ContributionType  = () => require('../models/ContributionType');

async function seedGroupA() {
  // Admin member for group A
  await GroupMember().create({ _id: ADMIN_A, clerkUserId: 'user_admin', groupId: GROUP_A, role: 'admin', name: 'Admin A', active: true });
  // Contributing member
  await GroupMember().create({ groupId: GROUP_A, role: 'member', name: 'Alice Banda', active: true });
  await BankBalance().create({ groupId: GROUP_A, balance: 0 });
  await SocialFundBalance().create({ groupId: GROUP_A, balance: 0 });
}

async function seedContributionType(groupId, affectsMainBalance = true) {
  return ContributionType().create({
    groupId,
    name: affectsMainBalance ? 'Admin Fee' : 'Social Fund',
    affectsMainBalance,
    isDefault: true,
    active: true,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Contribution recording', () => {
  test('1. happy path — routes to main BankBalance when affectsMainBalance=true', async () => {
    await seedGroupA();
    const type = await seedContributionType(GROUP_A, true);

    const res = await request(app)
      .post('/api/contributions')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', contributionTypeId: type._id, amount: 500 });

    expect(res.statusCode).toBe(201);
    expect(res.body.affectsMainBalance).toBe(true);
    expect(res.body.amount).toBe(500);
    expect(res.body.typeName).toBe('Admin Fee');

    const tx = await Transaction().findOne({ referenceId: res.body._id });
    expect(tx).not.toBeNull();
    expect(tx.type).toBe('contribution');
    expect(tx.amount).toBe(500);

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(500);

    const sf = await SocialFundBalance().findOne({ groupId: GROUP_A });
    expect(sf.balance).toBe(0); // social fund unchanged
  });

  test('2. happy path — routes to SocialFundBalance when affectsMainBalance=false', async () => {
    await seedGroupA();
    const type = await seedContributionType(GROUP_A, false);

    const res = await request(app)
      .post('/api/contributions')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', contributionTypeId: type._id, amount: 200 });

    expect(res.statusCode).toBe(201);
    expect(res.body.affectsMainBalance).toBe(false);

    const tx = await Transaction().findOne({ referenceId: res.body._id });
    expect(tx.type).toBe('social_fund_credit');

    const sf = await SocialFundBalance().findOne({ groupId: GROUP_A });
    expect(sf.balance).toBe(200);

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(0); // main balance unchanged
  });

  test('3. override toggle — recorder flips type default (main→social)', async () => {
    await seedGroupA();
    const type = await seedContributionType(GROUP_A, true); // type default = main balance

    const res = await request(app)
      .post('/api/contributions')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', contributionTypeId: type._id, amount: 300, affectsMainBalance: false });

    expect(res.statusCode).toBe(201);
    expect(res.body.affectsMainBalance).toBe(false);
    expect(res.body.overrodeDefault).toBe(true);

    const tx = await Transaction().findOne({ referenceId: res.body._id });
    expect(tx.type).toBe('social_fund_credit');

    const sf = await SocialFundBalance().findOne({ groupId: GROUP_A });
    expect(sf.balance).toBe(300);

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(0);
  });

  test('4. rollback — invalid contributionTypeId causes no partial writes', async () => {
    await seedGroupA();
    const fakeTypeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post('/api/contributions')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', contributionTypeId: fakeTypeId, amount: 100 });

    expect(res.statusCode).toBe(400);

    const count = await Contribution().countDocuments({ groupId: GROUP_A });
    expect(count).toBe(0); // no contribution row persisted

    const txCount = await Transaction().countDocuments({ groupId: GROUP_A });
    expect(txCount).toBe(0); // no transaction row persisted

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(0); // balance unchanged
  });
});

describe('Social fund expense', () => {
  test('5. happy path — expense reduces social fund balance, main balance untouched', async () => {
    await seedGroupA();
    await SocialFundBalance().findOneAndUpdate({ groupId: GROUP_A }, { balance: 1000 });

    const res = await request(app)
      .post('/api/social-fund/expenses')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ amount: 300, description: 'Birthday cake for member', category: 'birthday' });

    expect(res.statusCode).toBe(201);
    expect(res.body.amount).toBe(300);
    expect(res.body.category).toBe('birthday');

    const tx = await Transaction().findOne({ referenceId: res.body._id });
    expect(tx.type).toBe('social_fund_debit');
    expect(tx.amount).toBe(300);

    const sf = await SocialFundBalance().findOne({ groupId: GROUP_A });
    expect(sf.balance).toBe(700);

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(0); // main balance untouched
  });

  test('6. overspend guard — 400 when expense exceeds available social fund', async () => {
    await seedGroupA();
    await SocialFundBalance().findOneAndUpdate({ groupId: GROUP_A }, { balance: 200 });

    const res = await request(app)
      .post('/api/social-fund/expenses')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ amount: 500, description: 'Overspend attempt' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/insufficient/i);

    const count = await SocialFundExpense().countDocuments({ groupId: GROUP_A });
    expect(count).toBe(0);

    const sf = await SocialFundBalance().findOne({ groupId: GROUP_A });
    expect(sf.balance).toBe(200); // unchanged
  });
});

describe('Permissions', () => {
  test('7. member cannot record a contribution (403)', async () => {
    const res = await request(app)
      .post('/api/contributions')
      .set('Authorization', 'Bearer valid-member-token')
      .send({ username: 'Alice Banda', contributionTypeId: new mongoose.Types.ObjectId(), amount: 100 });

    expect(res.statusCode).toBe(403);
  });

  test('8. member cannot create a contribution type (403)', async () => {
    const res = await request(app)
      .post('/api/contribution-types')
      .set('Authorization', 'Bearer valid-member-token')
      .send({ name: 'New Type' });

    expect(res.statusCode).toBe(403);
  });
});

describe('Group scoping', () => {
  test('9. cross-group isolation — group B contributions never appear in group A list', async () => {
    // Seed group A
    await seedGroupA();
    const typeA = await seedContributionType(GROUP_A, true);

    // Seed group B
    await GroupMember().create({ _id: ADMIN_B, clerkUserId: 'user_admin2', groupId: GROUP_B, role: 'admin', name: 'Admin B', active: true });
    await GroupMember().create({ groupId: GROUP_B, role: 'member', name: 'Bob Phiri', active: true });
    await BankBalance().create({ groupId: GROUP_B, balance: 0 });
    await SocialFundBalance().create({ groupId: GROUP_B, balance: 0 });
    const typeB = await seedContributionType(GROUP_B, true);

    // Record a contribution in group B
    const resB = await request(app)
      .post('/api/contributions')
      .set('Authorization', 'Bearer valid-admin2-token')
      .send({ username: 'Bob Phiri', contributionTypeId: typeB._id, amount: 999 });
    expect(resB.statusCode).toBe(201);

    // Group A should see zero contributions
    const resListA = await request(app)
      .get('/api/contributions')
      .set('Authorization', 'Bearer valid-admin-token');
    expect(resListA.statusCode).toBe(200);
    expect(resListA.body).toHaveLength(0);

    // Group B's BankBalance should have increased; group A's should not
    const bbA = await BankBalance().findOne({ groupId: GROUP_A });
    const bbB = await BankBalance().findOne({ groupId: GROUP_B });
    expect(bbA.balance).toBe(0);
    expect(bbB.balance).toBe(999);
  });
});

describe('Group seeding', () => {
  test('10. new group createGroup seeds 2 default ContributionTypes + zeroed SocialFundBalance', async () => {
    const { getAuth } = require('@clerk/express');

    // Build a minimal Express app that uses the real groupController
    // with a mocked Clerk auth
    const groupApp = express();
    groupApp.use(express.json());

    // Inline verifyToken that reads from the mock getAuth
    const { verifyToken } = require('../middleware/auth');
    const groupController = require('../controllers/groupController');
    groupApp.post('/api/groups', verifyToken, groupController.createGroup);

    const res = await request(groupApp)
      .post('/api/groups')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({
        groupName: 'Seed Test Group',
        treasurerName: 'Seeder Treasurer',
        cycleLengthMonths: 6,
        interestRate: 10,
        interestMethod: 'reducing',
        loanLimitMultiplier: 3,
        lateFineAmount: 500,
      });

    expect(res.statusCode).toBe(201);
    const gid = res.body.group.id;

    const types = await ContributionType().find({ groupId: gid }).sort({ name: 1 });
    expect(types).toHaveLength(2);
    expect(types.map(t => t.name)).toEqual(expect.arrayContaining(['Admin Fee', 'Social Fund']));
    const adminFee = types.find(t => t.name === 'Admin Fee');
    const socialFund = types.find(t => t.name === 'Social Fund');
    expect(adminFee.affectsMainBalance).toBe(true);
    expect(adminFee.isDefault).toBe(true);
    expect(socialFund.affectsMainBalance).toBe(false);
    expect(socialFund.isDefault).toBe(true);

    const sf = await SocialFundBalance().findOne({ groupId: gid });
    expect(sf).not.toBeNull();
    expect(sf.balance).toBe(0);
  });
});
