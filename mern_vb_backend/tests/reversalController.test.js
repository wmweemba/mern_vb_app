/**
 * Reversal feature — Savings, Contributions, and Fund Expenses.
 *
 * Added for the support ticket where a treasurer double-recorded a contribution
 * to the App Subscription fund and had no way to correct it. Mirrors
 * paymentController.voidFine's shape: soft-cancel the record, reverse whichever
 * balance it originally touched, log an offsetting Transaction.
 *
 * Test coverage:
 *  1. Reverse a savings entry — BankBalance nets back to 0, Transaction logged
 *  2. Cannot reverse an already-reversed savings entry
 *  3. Reverse a main-balance contribution — BankBalance nets back to 0
 *  4. Reverse a fund-routed contribution (e.g. duplicate App Subscription credit)
 *     — fund balance nets back to 0, main balance untouched
 *  5. Reverse a fund expense — fund balance credited back
 *  6. Member cannot reverse a savings entry (403)
 *  7. Cannot reverse a contribution from a closed (archived) cycle
 */

jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: (req) => {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer valid-admin-token'))  return { userId: 'user_admin' };
    if (auth.startsWith('Bearer valid-member-token')) return { userId: 'user_member' };
    return {};
  },
}));

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
    return res.status(401).json({ error: 'Unauthenticated' });
  },
}));

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

const GROUP_A = mongoose.Types.ObjectId.createFromHexString('aaaaaaaaaaaaaaaaaaaaaaaa');
const ADMIN_A = mongoose.Types.ObjectId.createFromHexString('cccccccccccccccccccccccc');

const GroupMember      = () => require('../models/GroupMember');
const BankBalance      = () => require('../models/BankBalance');
const GroupFund        = () => require('../models/GroupFund');
const Saving           = () => require('../models/Savings');
const Contribution     = () => require('../models/Contribution');
const FundExpense      = () => require('../models/FundExpense');
const Transaction      = () => require('../models/Transaction');
const ContributionType = () => require('../models/ContributionType');
const GroupSettings    = () => require('../models/GroupSettings');

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/savings', require('../routes/savings'));
  app.use('/api/contributions', require('../routes/contributions'));
  app.use('/api/funds', require('../routes/funds'));
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

async function seedGroupA() {
  await GroupMember().create({ _id: ADMIN_A, clerkUserId: 'user_admin', groupId: GROUP_A, role: 'admin', name: 'Admin A', active: true });
  await GroupMember().create({ groupId: GROUP_A, role: 'member', name: 'Alice Banda', active: true });
  await BankBalance().create({ groupId: GROUP_A, balance: 0 });
  await GroupFund().create({ groupId: GROUP_A, key: 'app_subscription', name: 'App Subscription', balance: 0 });
  await GroupSettings().create({
    groupId: GROUP_A, groupName: 'Test Group',
    cycleLengthMonths: 6, interestRate: 10, interestMethod: 'reducing',
    defaultLoanDuration: 4, loanLimitMultiplier: 3,
    latePenaltyRate: 15, overdueFineAmount: 1000, earlyPaymentCharge: 200,
    savingsInterestRate: 0, minimumSavingsMonth1: 0, minimumSavingsMonthly: 0,
    maximumSavingsFirst3Months: 999999, savingsShortfallFine: 0,
    profitSharingMethod: 'proportional', lateFineType: 'fixed', partialPaymentFineAmount: 0,
  });
}

describe('Savings reversal', () => {
  test('1. reverse a savings entry — BankBalance nets back to 0, Transaction logged', async () => {
    await seedGroupA();
    const createRes = await request(app)
      .post('/api/savings')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', month: 1, amount: 500 });
    expect(createRes.statusCode).toBe(201);

    let bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(500);

    const savingId = createRes.body._id;
    const reverseRes = await request(app)
      .put(`/api/savings/${savingId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Entered twice by mistake' });

    expect(reverseRes.statusCode).toBe(200);
    expect(reverseRes.body.saving.cancelled).toBe(true);

    bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(0);

    const saving = await Saving().findById(savingId);
    expect(saving.cancelled).toBe(true);
    expect(saving.cancelReason).toBe('Entered twice by mistake');
    expect(saving.cancelledBy.toString()).toBe(ADMIN_A.toString());

    const txs = await Transaction().find({ referenceId: savingId }).sort({ createdAt: 1 });
    expect(txs).toHaveLength(2);
    expect(txs[0].amount).toBe(500);
    expect(txs[1].amount).toBe(-500);
    expect(txs[1].type).toBe('saving');
  });

  test('2. cannot reverse an already-reversed savings entry', async () => {
    await seedGroupA();
    const createRes = await request(app)
      .post('/api/savings')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', month: 1, amount: 300 });
    const savingId = createRes.body._id;

    await request(app)
      .put(`/api/savings/${savingId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'First reversal' });

    const secondAttempt = await request(app)
      .put(`/api/savings/${savingId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Second reversal' });

    expect(secondAttempt.statusCode).toBe(400);
    expect(secondAttempt.body.error).toMatch(/already reversed/i);

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(0); // unchanged by the rejected second attempt
  });

  test('6. member cannot reverse a savings entry (403)', async () => {
    await seedGroupA();
    const createRes = await request(app)
      .post('/api/savings')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', month: 1, amount: 300 });
    const savingId = createRes.body._id;

    const res = await request(app)
      .put(`/api/savings/${savingId}/reverse`)
      .set('Authorization', 'Bearer valid-member-token')
      .send({ cancelReason: 'Trying to reverse' });

    expect(res.statusCode).toBe(403);
  });
});

describe('Contribution reversal', () => {
  test('3. reverse a main-balance contribution — BankBalance nets back to 0', async () => {
    await seedGroupA();
    const type = await ContributionType().create({ groupId: GROUP_A, name: 'Admin Fee', affectsMainBalance: true, isDefault: true, active: true });

    const createRes = await request(app)
      .post('/api/contributions')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', contributionTypeId: type._id, amount: 500 });
    expect(createRes.statusCode).toBe(201);

    const contributionId = createRes.body._id;
    const reverseRes = await request(app)
      .put(`/api/contributions/${contributionId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Wrong member' });

    expect(reverseRes.statusCode).toBe(200);

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(0);

    const txs = await Transaction().find({ referenceId: contributionId }).sort({ createdAt: 1 });
    expect(txs).toHaveLength(2);
    expect(txs[1].amount).toBe(-500);
    expect(txs[1].type).toBe('contribution');
  });

  test('4. reverse a duplicate App Subscription (fund) contribution — fund balance nets back to 0, main balance untouched', async () => {
    await seedGroupA();
    const fund = await GroupFund().findOne({ groupId: GROUP_A, key: 'app_subscription' });
    const type = await ContributionType().create({ groupId: GROUP_A, name: 'App Subscription', fundId: fund._id, affectsMainBalance: false, isDefault: true, active: true });

    // Simulate the ticket: Simon Peter records the same contribution twice by mistake.
    const first = await request(app)
      .post('/api/contributions')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', contributionTypeId: type._id, amount: 150 });
    const duplicate = await request(app)
      .post('/api/contributions')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', contributionTypeId: type._id, amount: 150 });
    expect(first.statusCode).toBe(201);
    expect(duplicate.statusCode).toBe(201);

    let fundDoc = await GroupFund().findById(fund._id);
    expect(fundDoc.balance).toBe(300);

    // Reverse the duplicate only.
    const reverseRes = await request(app)
      .put(`/api/contributions/${duplicate.body._id}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Accidental double credit' });
    expect(reverseRes.statusCode).toBe(200);

    fundDoc = await GroupFund().findById(fund._id);
    expect(fundDoc.balance).toBe(150); // back to just the original, correct entry

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(0); // main pool was never touched by either entry

    const dupContribution = await Contribution().findById(duplicate.body._id);
    expect(dupContribution.cancelled).toBe(true);

    const originalContribution = await Contribution().findById(first.body._id);
    expect(originalContribution.cancelled).toBe(false); // untouched

    const txs = await Transaction().find({ referenceId: duplicate.body._id }).sort({ createdAt: 1 });
    expect(txs).toHaveLength(2);
    expect(txs[1].amount).toBe(-150);
    expect(txs[1].type).toBe('fund_credit');
  });

  test('7. cannot reverse a contribution from a closed (archived) cycle', async () => {
    await seedGroupA();
    const type = await ContributionType().create({ groupId: GROUP_A, name: 'Admin Fee', affectsMainBalance: true, isDefault: true, active: true });
    const createRes = await request(app)
      .post('/api/contributions')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', contributionTypeId: type._id, amount: 400 });

    await Contribution().findByIdAndUpdate(createRes.body._id, { archived: true });

    const res = await request(app)
      .put(`/api/contributions/${createRes.body._id}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Too late' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/closed cycle/i);

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(400); // unchanged
  });
});

describe('Fund expense reversal', () => {
  test('5. reverse a fund expense — fund balance credited back', async () => {
    await seedGroupA();
    const fund = await GroupFund().findOne({ groupId: GROUP_A, key: 'app_subscription' });
    await GroupFund().findByIdAndUpdate(fund._id, { balance: 1000 });

    const expenseRes = await request(app)
      .post('/api/funds/expenses')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ amount: 300, description: 'Wrong deduction', category: 'other', fundId: fund._id });
    expect(expenseRes.statusCode).toBe(201);

    let fundDoc = await GroupFund().findById(fund._id);
    expect(fundDoc.balance).toBe(700);

    const reverseRes = await request(app)
      .put(`/api/funds/expenses/${expenseRes.body._id}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Recorded against the wrong fund' });
    expect(reverseRes.statusCode).toBe(200);

    fundDoc = await GroupFund().findById(fund._id);
    expect(fundDoc.balance).toBe(1000);

    const expense = await FundExpense().findById(expenseRes.body._id);
    expect(expense.cancelled).toBe(true);

    const txs = await Transaction().find({ referenceId: expenseRes.body._id }).sort({ createdAt: 1 });
    expect(txs).toHaveLength(2);
    expect(txs[1].amount).toBe(-300);
    expect(txs[1].type).toBe('fund_debit');
  });
});
