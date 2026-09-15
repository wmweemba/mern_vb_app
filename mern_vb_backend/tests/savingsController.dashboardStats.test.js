/**
 * savingsController.getDashboardStats — totalLoaned for revolving vs scheduled loans.
 *
 * Regression coverage for the bug found while diagnosing Grace's group dashboard:
 * revolving loans are topped up on their single Loan document (loanController.createLoan),
 * so loan.amount only ever reflects the member's first disbursement. totalLoaned must use
 * principalBalance + interestOutstanding for revolving loans instead.
 */

jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: (req) => {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer valid-admin-token')) return { userId: 'user_admin' };
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
    return res.status(401).json({ error: 'Unauthenticated' });
  },
}));

jest.mock('../middleware/checkTrial', () => ({
  checkTrial: (req, res, next) => next(),
}));

jest.setTimeout(60000);

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');

let mongoServer;
let app;

const GROUP_A  = mongoose.Types.ObjectId.createFromHexString('aaaaaaaaaaaaaaaaaaaaaaaa');
const ADMIN_ID = mongoose.Types.ObjectId.createFromHexString('cccccccccccccccccccccccc');

const GroupMember = () => require('../models/GroupMember');
const Loan        = () => require('../models/Loans');

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/savings', require('../routes/savings'));
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

describe('savingsController.getDashboardStats — totalLoaned', () => {
  test('scheduled loan: totalLoaned uses loan.amount', async () => {
    await GroupMember().create({
      _id: ADMIN_ID, clerkUserId: 'user_admin', groupId: GROUP_A,
      role: 'admin', name: 'Alice Banda', active: true, deletedAt: null,
    });
    await Loan().create({
      userId: ADMIN_ID, groupId: GROUP_A,
      amount: 10000, durationMonths: 4, interestRate: 10, interestMethod: 'reducing',
      fullyPaid: false, archived: false, installments: [],
    });

    const res = await request(app)
      .get('/api/savings/dashboard')
      .set('Authorization', 'Bearer valid-admin-token');

    expect(res.statusCode).toBe(200);
    expect(res.body.totalLoaned).toBe(10000);
  });

  test('scheduled loan: totalInterestLoans sums installments[].interest regardless of paid status', async () => {
    await GroupMember().create({
      _id: ADMIN_ID, clerkUserId: 'user_admin', groupId: GROUP_A,
      role: 'admin', name: 'Alice Banda', active: true, deletedAt: null,
    });
    await Loan().create({
      userId: ADMIN_ID, groupId: GROUP_A,
      amount: 10000, durationMonths: 2, interestRate: 10, interestMethod: 'reducing',
      fullyPaid: false, archived: false,
      installments: [
        { month: 1, principal: 5000, interest: 1000, total: 6000, paidAmount: 6000, paid: true },
        { month: 2, principal: 5000, interest: 500, total: 5500, paidAmount: 0, paid: false },
      ],
    });

    const res = await request(app)
      .get('/api/savings/dashboard')
      .set('Authorization', 'Bearer valid-admin-token');

    expect(res.statusCode).toBe(200);
    expect(res.body.totalInterestLoans).toBe(1500);
  });

  test('revolving loan: totalLoaned uses principalBalance + interestOutstanding, not the frozen loan.amount', async () => {
    await GroupMember().create({
      _id: ADMIN_ID, clerkUserId: 'user_admin', groupId: GROUP_A,
      role: 'admin', name: 'Grace Kalele', active: true, deletedAt: null,
    });
    // First disbursement was K5,000 (loan.amount); a later top-up (loanController's
    // revolving branch) raised principalBalance to K10,000 without ever touching
    // loan.amount — that's the exact shape of the bug this test guards against.
    await Loan().create({
      userId: ADMIN_ID, groupId: GROUP_A,
      amount: 5000, durationMonths: 0, interestRate: 10, interestMethod: 'reducing',
      fullyPaid: false, archived: false, installments: [],
      accrualMode: 'revolving', principalBalance: 10000, interestOutstanding: 250,
      entries: [{ date: new Date(), type: 'disbursement', amount: 5000, principalAfter: 5000, interestAfter: 0 }],
    });

    const res = await request(app)
      .get('/api/savings/dashboard')
      .set('Authorization', 'Bearer valid-admin-token');

    expect(res.statusCode).toBe(200);
    expect(res.body.totalLoaned).toBe(10250);
  });

  test('revolving loan: totalInterestLoans sums accrual entries, not interest_payment entries', async () => {
    await GroupMember().create({
      _id: ADMIN_ID, clerkUserId: 'user_admin', groupId: GROUP_A,
      role: 'admin', name: 'Grace Kalele', active: true, deletedAt: null,
    });
    // Two months accrued (K500 + K450 = K950 charged); member paid K500 of it in cash.
    // totalInterestLoans should reflect what was CHARGED (950), matching the scheduled
    // branch's semantics (interest due across the whole schedule, not just collected).
    await Loan().create({
      userId: ADMIN_ID, groupId: GROUP_A,
      amount: 5000, durationMonths: 0, interestRate: 10, interestMethod: 'reducing',
      fullyPaid: false, archived: false, installments: [],
      accrualMode: 'revolving', principalBalance: 5000, interestOutstanding: 450,
      entries: [
        { date: new Date(), type: 'disbursement', amount: 5000, principalAfter: 5000, interestAfter: 0 },
        { date: new Date(), type: 'accrual', periodLabel: '2026-06', amount: 500, principalAfter: 5000, interestAfter: 500 },
        { date: new Date(), type: 'interest_payment', amount: 500, principalAfter: 5000, interestAfter: 0 },
        { date: new Date(), type: 'accrual', periodLabel: '2026-07', amount: 450, principalAfter: 5000, interestAfter: 450 },
      ],
    });

    const res = await request(app)
      .get('/api/savings/dashboard')
      .set('Authorization', 'Bearer valid-admin-token');

    expect(res.statusCode).toBe(200);
    expect(res.body.totalInterestLoans).toBe(950);
  });

  test('mixed group: totalLoaned sums scheduled loan.amount and revolving outstanding correctly', async () => {
    const MEMBER_B = mongoose.Types.ObjectId.createFromHexString('dddddddddddddddddddddddd');
    await GroupMember().create([
      { _id: ADMIN_ID, clerkUserId: 'user_admin', groupId: GROUP_A, role: 'admin', name: 'Alice Banda', active: true, deletedAt: null },
      { _id: MEMBER_B, clerkUserId: 'user_b', groupId: GROUP_A, role: 'member', name: 'Grace Kalele', active: true, deletedAt: null },
    ]);
    await Loan().create([
      {
        userId: ADMIN_ID, groupId: GROUP_A,
        amount: 10000, durationMonths: 4, interestRate: 10, interestMethod: 'reducing',
        fullyPaid: false, archived: false, installments: [],
      },
      {
        userId: MEMBER_B, groupId: GROUP_A,
        amount: 5000, durationMonths: 0, interestRate: 10, interestMethod: 'reducing',
        fullyPaid: false, archived: false, installments: [],
        accrualMode: 'revolving', principalBalance: 10000, interestOutstanding: 0,
        entries: [{ date: new Date(), type: 'disbursement', amount: 5000, principalAfter: 5000, interestAfter: 0 }],
      },
    ]);

    const res = await request(app)
      .get('/api/savings/dashboard')
      .set('Authorization', 'Bearer valid-admin-token');

    expect(res.statusCode).toBe(200);
    expect(res.body.totalLoaned).toBe(20000); // 10000 (scheduled) + 10000 (revolving outstanding)
  });
});
