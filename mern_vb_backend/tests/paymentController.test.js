/**
 * paymentController — partial payment + auto-fine tests.
 *
 * Uses MongoMemoryReplSet (session.startTransaction requires replica set).
 *
 * Coverage:
 *  1. Interest-only payment fires auto-fine when partialPaymentFineAmount > 0
 *  2. Interest-only payment fires NO fine when partialPaymentFineAmount = 0
 *  3. Full installment payment fires no auto-fine
 *  4. Duplicate-fine guard — second sub-full payment on same installment produces only one fine
 *  5. Session rollback — Fine.create throws → payment, balance, transaction all rolled back
 *  6. Payment below interest → no auto-fine
 *  7. Overpayment spanning two installments: month-1 fully paid, month-2 partial → fine on month-2 only
 */

// --- Clerk mock (must be first) ---
jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: (req) => {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer valid-admin-token')) return { userId: 'user_admin' };
    return {};
  },
}));

// --- resolveGroup mock ---
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

const GROUP_A  = mongoose.Types.ObjectId.createFromHexString('aaaaaaaaaaaaaaaaaaaaaaaa');
const ADMIN_ID = mongoose.Types.ObjectId.createFromHexString('cccccccccccccccccccccccc');

const GroupMember    = () => require('../models/GroupMember');
const Loan           = () => require('../models/Loans');
const Fine           = () => require('../models/Fine');
const BankBalance    = () => require('../models/BankBalance');
const GroupSettings  = () => require('../models/GroupSettings');
const Transaction    = () => require('../models/Transaction');

// Installments for K10,000 loan at 10% reducing, 4 months
const installments = [
  { month: 1, principal: 2500, interest: 1000, total: 3500, paidAmount: 0, paid: false },
  { month: 2, principal: 2500, interest: 750,  total: 3250, paidAmount: 0, paid: false },
  { month: 3, principal: 2500, interest: 500,  total: 3000, paidAmount: 0, paid: false },
  { month: 4, principal: 2500, interest: 250,  total: 2750, paidAmount: 0, paid: false },
];

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/payments', require('../routes/payment'));
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
  jest.restoreAllMocks();
});

async function seedBase(partialPaymentFineAmount = 500) {
  await GroupMember().create({
    _id: ADMIN_ID, clerkUserId: 'user_admin', groupId: GROUP_A,
    role: 'admin', name: 'Alice Banda', active: true, deletedAt: null,
  });
  await BankBalance().create({ groupId: GROUP_A, balance: 0 });
  await GroupSettings().create({
    groupId: GROUP_A, groupName: 'Test Group',
    cycleLengthMonths: 6, interestRate: 10, interestMethod: 'reducing',
    defaultLoanDuration: 4, loanLimitMultiplier: 3,
    latePenaltyRate: 15, overdueFineAmount: 1000, earlyPaymentCharge: 200,
    savingsInterestRate: 10, minimumSavingsMonth1: 3000, minimumSavingsMonthly: 1000,
    maximumSavingsFirst3Months: 5000, savingsShortfallFine: 500,
    profitSharingMethod: 'proportional', lateFineType: 'fixed',
    partialPaymentFineAmount,
  });
}

async function seedLoan(overrides = {}) {
  const insts = (overrides.installments || installments).map(i => ({ ...i }));
  return Loan().create({
    userId: ADMIN_ID, groupId: GROUP_A,
    amount: 10000, durationMonths: 4,
    interestRate: 10, interestMethod: 'reducing',
    fullyPaid: false, archived: false,
    installments: insts,
    ...overrides,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('paymentController.repayment — auto-fine on partial payment', () => {

  test('1. interest-only payment fires auto-fine when partialPaymentFineAmount > 0', async () => {
    await seedBase(500);
    const loan = await seedLoan();

    const res = await request(app)
      .post('/api/payments/repayment')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', amount: 1000 }); // exactly month-1 interest

    expect(res.statusCode).toBe(200);

    const updated = await Loan().findById(loan._id);
    expect(updated.installments[0].paid).toBe(false);
    expect(updated.installments[0].paidAmount).toBe(1000);

    const fines = await Fine().find({ groupId: GROUP_A });
    expect(fines).toHaveLength(1);
    expect(fines[0].amount).toBe(500);
    expect(fines[0].note).toBe('Partial payment — Month 1 principal not paid');
    expect(fines[0].loanId.toString()).toBe(loan._id.toString());
    expect(fines[0].installmentMonth).toBe(1);
    expect(fines[0].paid).toBe(false);

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(1000); // only payment credited, fine is unpaid

    const tx = await Transaction().find({ groupId: GROUP_A });
    expect(tx).toHaveLength(1);
    expect(tx[0].type).toBe('loan_payment');
    expect(tx[0].amount).toBe(1000);
  });

  test('2. interest-only payment fires NO fine when partialPaymentFineAmount = 0', async () => {
    await seedBase(0);
    const loan = await seedLoan();

    const res = await request(app)
      .post('/api/payments/repayment')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', amount: 1000 });

    expect(res.statusCode).toBe(200);

    const updated = await Loan().findById(loan._id);
    expect(updated.installments[0].paid).toBe(false);
    expect(updated.installments[0].paidAmount).toBe(1000);

    const fines = await Fine().find({ groupId: GROUP_A });
    expect(fines).toHaveLength(0);
  });

  test('3. full installment payment fires no auto-fine', async () => {
    await seedBase(500);
    await seedLoan();

    const res = await request(app)
      .post('/api/payments/repayment')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', amount: 3500 }); // month-1 total

    expect(res.statusCode).toBe(200);

    const fines = await Fine().find({ groupId: GROUP_A });
    expect(fines).toHaveLength(0);
  });

  test('4. duplicate-fine guard — second sub-full payment on same installment produces only one fine', async () => {
    await seedBase(500);
    const loan = await seedLoan();

    // First sub-full payment — interest only
    await request(app)
      .post('/api/payments/repayment')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', amount: 1000, loanId: loan._id });

    // Second sub-full payment — some more principal but still not full
    await request(app)
      .post('/api/payments/repayment')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', amount: 500, loanId: loan._id });

    const fines = await Fine().find({ groupId: GROUP_A, loanId: loan._id, installmentMonth: 1 });
    expect(fines).toHaveLength(1); // still only one
  });

  test('5. session rollback — Fine.create throws → payment, balance, transaction all rolled back', async () => {
    await seedBase(500);
    const loan = await seedLoan();

    // Spy on Fine.create and make it throw
    jest.spyOn(Fine(), 'create').mockRejectedValueOnce(new Error('Simulated Fine.create failure'));

    const res = await request(app)
      .post('/api/payments/repayment')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', amount: 1000 });

    expect(res.statusCode).toBe(500);

    const updated = await Loan().findById(loan._id);
    expect(updated.installments[0].paidAmount).toBe(0); // rolled back

    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(0); // rolled back

    const txns = await Transaction().find({ groupId: GROUP_A });
    expect(txns).toHaveLength(0); // rolled back

    const fines = await Fine().find({ groupId: GROUP_A });
    expect(fines).toHaveLength(0); // no orphan fine
  });

  test('6. payment below interest fires no auto-fine', async () => {
    await seedBase(500);
    const loan = await seedLoan();

    const res = await request(app)
      .post('/api/payments/repayment')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', amount: 500 }); // below month-1 interest of 1000

    expect(res.statusCode).toBe(200);

    const updated = await Loan().findById(loan._id);
    expect(updated.installments[0].paidAmount).toBe(500);
    expect(updated.installments[0].paid).toBe(false);

    const fines = await Fine().find({ groupId: GROUP_A });
    expect(fines).toHaveLength(0); // interestCovered = false → no fine
  });

  test('7. overpayment spanning installments: month-1 fully paid, month-2 partial → fine on month-2 only', async () => {
    await seedBase(500);
    const loan = await seedLoan();

    // Pay month-1 total (3500) + month-2 interest (750) = 4250
    const res = await request(app)
      .post('/api/payments/repayment')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Alice Banda', amount: 4250 });

    expect(res.statusCode).toBe(200);

    const updated = await Loan().findById(loan._id);
    expect(updated.installments[0].paid).toBe(true);
    expect(updated.installments[1].paid).toBe(false);
    expect(updated.installments[1].paidAmount).toBe(750); // exactly interest

    const fines = await Fine().find({ groupId: GROUP_A });
    expect(fines).toHaveLength(1);
    expect(fines[0].installmentMonth).toBe(2); // fine on month 2, not month 1
    expect(fines[0].amount).toBe(500);
  });

});
