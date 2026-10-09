/**
 * Reverse a wrongly recorded revolving-loan payment.
 * docs/build/revolving-payment-corrections/plan.md — Unit U3.
 *
 * Replays the production ticket: Muyapekwa E Daka's 07/10/2026 repayment of K2,420 was
 * recorded as all-principal (should be K220 interest + K2,200 principal). Her entries
 * carry no transactionId (legacy, pre-U2), so the reversal must find the matching
 * Transaction by a ±10s window match, not by id.
 *
 * Coverage:
 *  1. Legacy replay: reverse → principal back to 4200, BankBalance -2420, offsetting
 *     Transaction logged; then re-record correctly via POST /api/payments/repayment with
 *     chargeInterestShortfall → principal 2000, BankBalance back to pre-reversal value.
 *  2. Two candidate Transactions in the ±10s window → 409, nothing changed.
 *  3. An accrual entry dated after the payment → 400, nothing changed.
 *  4. Already-reversed entry → 400.
 *  5. Blank cancelReason → 400.
 *  6. Member role → 403.
 *  7. Loan in another group → 404.
 *  8. Reversing a payment that made the loan fullyPaid → fullyPaid reset to false.
 *  9. Paid-off loan while the member has a newer open revolving loan → 409, nothing changed.
 * 10. Paid-off loan whose member has only closed/archived other loans → still reversible.
 * 11. Malformed loanId → 404 (was a 500 CastError).
 * 12. createLoan top-up posts to the member's newest open revolving loan.
 */

jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: (req) => {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer valid-admin-token')) return { userId: 'user_admin' };
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

const GROUP_A    = mongoose.Types.ObjectId.createFromHexString('aaaaaaaaaaaaaaaaaaaaaaaa');
const GROUP_B    = mongoose.Types.ObjectId.createFromHexString('bbbbbbbbbbbbbbbbbbbbbbbb');
const ADMIN_A    = mongoose.Types.ObjectId.createFromHexString('cccccccccccccccccccccccc');
const MUYA       = mongoose.Types.ObjectId.createFromHexString('eeeeeeeeeeeeeeeeeeeeeeee');

const GroupMember   = () => require('../models/GroupMember');
const Loan          = () => require('../models/Loans');
const BankBalance   = () => require('../models/BankBalance');
const GroupSettings = () => require('../models/GroupSettings');
const Transaction   = () => require('../models/Transaction');

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/payments', require('../routes/payment'));
  app.use('/api/loans', require('../routes/loans'));
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

async function seedBase() {
  await GroupMember().create({
    _id: ADMIN_A, clerkUserId: 'user_admin', groupId: GROUP_A,
    role: 'admin', name: 'Admin A', active: true, deletedAt: null,
  });
  await GroupMember().create({
    clerkUserId: 'user_member', groupId: GROUP_A,
    role: 'member', name: 'Member A', active: true, deletedAt: null,
  });
  await GroupMember().create({
    _id: MUYA, groupId: GROUP_A,
    role: 'member', name: 'Muyapekwa E Daka', active: true, deletedAt: null,
  });
  await BankBalance().create({ groupId: GROUP_A, balance: 10000 });
  await GroupSettings().create({
    groupId: GROUP_A, groupName: 'Grocery Savings Group',
    cycleLengthMonths: 6, interestRate: 10, interestMethod: 'reducing',
    defaultLoanDuration: 4, loanLimitMultiplier: 3,
    latePenaltyRate: 15, overdueFineAmount: 1000, earlyPaymentCharge: 200,
    savingsInterestRate: 0, minimumSavingsMonth1: 0, minimumSavingsMonthly: 0,
    maximumSavingsFirst3Months: 999999, savingsShortfallFine: 0,
    profitSharingMethod: 'proportional', lateFineType: 'fixed', partialPaymentFineAmount: 0,
    policies: { arrears: 'capitalise', interestObligation: 'per_member_quota' },
  });
}

// Replays the production read table (§Context) for Muya's loan: disbursement on 03/10,
// the mis-recorded all-principal payment of 2420 on 07/10, no transactionId on the entry.
async function seedMuyaLoan() {
  const paymentDate = new Date('2026-10-07T10:54:41.578Z');
  return Loan().create({
    userId: MUYA, groupId: GROUP_A,
    amount: 4200, durationMonths: 1, interestRate: 10, interestMethod: 'reducing',
    accrualMode: 'revolving',
    principalBalance: 1780,
    interestOutstanding: 0,
    fullyPaid: false, archived: false,
    installments: [],
    entries: [
      {
        date: new Date('2026-10-03T07:31:00.470Z'),
        type: 'disbursement', amount: 2200, principalAfter: 4200, interestAfter: 0,
      },
      {
        _id: mongoose.Types.ObjectId.createFromHexString('6ac624f15a6d213606539aea'),
        date: paymentDate,
        type: 'principal_payment', amount: 2420, principalAfter: 1780, interestAfter: 0,
      },
    ],
  });
}

async function seedMuyaTransaction(loanId, overrides = {}) {
  return Transaction().create({
    _id: mongoose.Types.ObjectId.createFromHexString('6ac624f15a6d213606539aee'),
    userId: MUYA, groupId: GROUP_A,
    type: 'loan_payment', amount: 2420, referenceId: loanId,
    note: 'Payment — interest K0, principal K2420',
    createdAt: new Date('2026-10-07T10:54:41.613Z'), // 35ms after the entry date
    ...overrides,
  });
}

describe('Revolving payment reversal', () => {
  test('1. legacy Muya replay: reverse, then re-record correctly', async () => {
    await seedBase();
    const loan = await seedMuyaLoan();
    await seedMuyaTransaction(loan._id);

    const entryId = loan.entries[1]._id;
    const reverseRes = await request(app)
      .put(`/api/loans/${loan._id}/entries/${entryId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Recorded all as principal — should be K220 interest + K2,200 principal' });

    expect(reverseRes.statusCode).toBe(200);
    expect(reverseRes.body.reversed.totalPaid).toBe(2420);

    const afterReverse = await Loan().findById(loan._id);
    expect(afterReverse.principalBalance).toBe(4200);
    expect(afterReverse.interestOutstanding).toBe(0);

    let bb = await BankBalance().findOne({ groupId: GROUP_A });
    const preReversalBalance = 10000; // seeded base balance
    expect(bb.balance).toBe(preReversalBalance - 2420);

    const reversalTxs = await Transaction().find({ referenceId: loan._id, amount: -2420 });
    expect(reversalTxs).toHaveLength(1);
    expect(reversalTxs[0].type).toBe('loan_payment');

    const negatedEntry = afterReverse.entries.find((e) => e.reversalOf && String(e.reversalOf) === String(entryId));
    expect(negatedEntry).toBeDefined();
    expect(negatedEntry.amount).toBe(-2420);
    expect(negatedEntry.transactionId.toString()).toBe(reversalTxs[0]._id.toString());

    const originalEntry = afterReverse.entries.find((e) => String(e._id) === String(entryId));
    expect(originalEntry.reversedAt).toBeTruthy();

    // Re-record correctly: 220 interest + 2200 principal, with the in-month charge flag.
    const repayRes = await request(app)
      .post('/api/payments/repayment')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({
        username: 'Muyapekwa E Daka', amount: 2420, loanId: loan._id.toString(),
        allocation: { toInterest: 220, toPrincipal: 2200 },
        chargeInterestShortfall: true,
      });

    expect(repayRes.statusCode).toBe(200);
    const finalLoan = await Loan().findById(loan._id);
    expect(finalLoan.principalBalance).toBe(2000);

    bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(preReversalBalance); // back to the pre-reversal value
  });

  test('2. two candidate Transactions in the window → 409, nothing changed', async () => {
    await seedBase();
    const loan = await seedMuyaLoan();
    await seedMuyaTransaction(loan._id);
    await Transaction().create({
      userId: MUYA, groupId: GROUP_A, type: 'loan_payment', amount: 2420,
      referenceId: loan._id, note: 'Duplicate candidate',
      createdAt: new Date('2026-10-07T10:54:45.000Z'), // within the ±10s window
    });

    const entryId = loan.entries[1]._id;
    const res = await request(app)
      .put(`/api/loans/${loan._id}/entries/${entryId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Fixing it' });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/2/);

    const unchanged = await Loan().findById(loan._id);
    expect(unchanged.principalBalance).toBe(1780);
    const bb = await BankBalance().findOne({ groupId: GROUP_A });
    expect(bb.balance).toBe(10000);
  });

  test('3. accrual dated after the payment → 400, nothing changed', async () => {
    await seedBase();
    const loan = await seedMuyaLoan();
    await seedMuyaTransaction(loan._id);
    loan.entries.push({
      date: new Date('2026-10-25T13:00:00.000Z'),
      periodLabel: '2026-10',
      type: 'accrual', amount: 178, principalAfter: 1780, interestAfter: 178,
    });
    await loan.save();

    const entryId = loan.entries[1]._id;
    const res = await request(app)
      .put(`/api/loans/${loan._id}/entries/${entryId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Too late now' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/month-end/i);

    const unchanged = await Loan().findById(loan._id);
    expect(unchanged.principalBalance).toBe(1780);
  });

  test('4. already reversed → 400', async () => {
    await seedBase();
    const loan = await seedMuyaLoan();
    await seedMuyaTransaction(loan._id);
    const entryId = loan.entries[1]._id;

    const first = await request(app)
      .put(`/api/loans/${loan._id}/entries/${entryId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'First reversal' });
    expect(first.statusCode).toBe(200);

    const second = await request(app)
      .put(`/api/loans/${loan._id}/entries/${entryId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Second reversal' });

    expect(second.statusCode).toBe(400);
    expect(second.body.error).toMatch(/already.*reversed/i);
  });

  test('5. blank cancelReason → 400', async () => {
    await seedBase();
    const loan = await seedMuyaLoan();
    await seedMuyaTransaction(loan._id);
    const entryId = loan.entries[1]._id;

    const res = await request(app)
      .put(`/api/loans/${loan._id}/entries/${entryId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: '   ' });

    expect(res.statusCode).toBe(400);

    const unchanged = await Loan().findById(loan._id);
    expect(unchanged.principalBalance).toBe(1780);
  });

  test('6. member role → 403', async () => {
    await seedBase();
    const loan = await seedMuyaLoan();
    await seedMuyaTransaction(loan._id);
    const entryId = loan.entries[1]._id;

    const res = await request(app)
      .put(`/api/loans/${loan._id}/entries/${entryId}/reverse`)
      .set('Authorization', 'Bearer valid-member-token')
      .send({ cancelReason: 'Trying to reverse' });

    expect(res.statusCode).toBe(403);
  });

  test('7. loan in another group → 404', async () => {
    await seedBase();
    const loan = await Loan().create({
      userId: MUYA, groupId: GROUP_B,
      amount: 4200, durationMonths: 1, interestRate: 10, interestMethod: 'reducing',
      accrualMode: 'revolving', principalBalance: 1780, interestOutstanding: 0,
      fullyPaid: false, archived: false, installments: [],
      entries: [{
        date: new Date('2026-10-07T10:54:41.578Z'),
        type: 'principal_payment', amount: 2420, principalAfter: 1780, interestAfter: 0,
      }],
    });
    const entryId = loan.entries[0]._id;

    const res = await request(app)
      .put(`/api/loans/${loan._id}/entries/${entryId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Wrong group' });

    expect(res.statusCode).toBe(404);
  });

  test('8. reversing a payment that made the loan fullyPaid sets fullyPaid: false', async () => {
    await seedBase();
    const paymentDate = new Date('2026-10-07T10:54:41.578Z');
    const loan = await Loan().create({
      userId: MUYA, groupId: GROUP_A,
      amount: 2200, durationMonths: 1, interestRate: 10, interestMethod: 'reducing',
      accrualMode: 'revolving', principalBalance: 0, interestOutstanding: 0,
      fullyPaid: true, archived: false, installments: [],
      entries: [
        { date: new Date('2026-10-03T07:31:00.470Z'), type: 'disbursement', amount: 2200, principalAfter: 2200, interestAfter: 0 },
        { date: paymentDate, type: 'principal_payment', amount: 2200, principalAfter: 0, interestAfter: 0 },
      ],
    });
    await Transaction().create({
      userId: MUYA, groupId: GROUP_A, type: 'loan_payment', amount: 2200,
      referenceId: loan._id, note: 'Payment — interest K0, principal K2200',
      createdAt: new Date('2026-10-07T10:54:41.600Z'),
    });

    const entryId = loan.entries[1]._id;
    const res = await request(app)
      .put(`/api/loans/${loan._id}/entries/${entryId}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Recorded in error' });

    expect(res.statusCode).toBe(200);
    expect(res.body.loan.fullyPaid).toBe(false);

    const updated = await Loan().findById(loan._id);
    expect(updated.fullyPaid).toBe(false);
    expect(updated.principalBalance).toBe(2200);
  });

  test('9. paid-off loan while the member has a newer open loan → 409, nothing changed', async () => {
    await seedBase();
    const paymentDate = new Date('2026-10-07T10:54:41.578Z');
    const paidOff = await Loan().create({
      userId: MUYA, groupId: GROUP_A,
      amount: 2200, durationMonths: 1, interestRate: 10, interestMethod: 'reducing',
      accrualMode: 'revolving', principalBalance: 0, interestOutstanding: 0,
      fullyPaid: true, archived: false, installments: [],
      createdAt: new Date('2026-10-03T07:31:00.470Z'),
      entries: [
        { date: new Date('2026-10-03T07:31:00.470Z'), type: 'disbursement', amount: 2200, principalAfter: 2200, interestAfter: 0 },
        { date: paymentDate, type: 'principal_payment', amount: 2200, principalAfter: 0, interestAfter: 0 },
      ],
    });
    await Loan().create({
      userId: MUYA, groupId: GROUP_A,
      amount: 1000, durationMonths: 1, interestRate: 10, interestMethod: 'reducing',
      accrualMode: 'revolving', principalBalance: 1000, interestOutstanding: 0,
      fullyPaid: false, archived: false, installments: [],
      createdAt: new Date('2026-10-08T09:00:00.000Z'),
      entries: [
        { date: new Date('2026-10-08T09:00:00.000Z'), type: 'disbursement', amount: 1000, principalAfter: 1000, interestAfter: 0 },
      ],
    });
    await Transaction().create({
      userId: MUYA, groupId: GROUP_A, type: 'loan_payment', amount: 2200,
      referenceId: paidOff._id, note: 'Payment — interest K0, principal K2200',
      createdAt: new Date('2026-10-07T10:54:41.600Z'),
    });
    const txCountBefore = await Transaction().countDocuments({});

    const res = await request(app)
      .put(`/api/loans/${paidOff._id}/entries/${paidOff.entries[1]._id}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Recorded in error' });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/newer open loan/);

    const unchanged = await Loan().findById(paidOff._id);
    expect(unchanged.fullyPaid).toBe(true);
    expect(unchanged.principalBalance).toBe(0);
    expect(unchanged.entries[1].reversedAt).toBeFalsy();
    expect(unchanged.entries).toHaveLength(2);
    expect((await BankBalance().findOne({ groupId: GROUP_A })).balance).toBe(10000);
    expect(await Transaction().countDocuments({})).toBe(txCountBefore);
  });

  test('10. paid-off loan with no other open loan is still reversible (guard is narrow)', async () => {
    // Same as test 8, plus a closed (fullyPaid) and an archived loan for the member —
    // neither is "open", so neither should block.
    await seedBase();
    const loan = await Loan().create({
      userId: MUYA, groupId: GROUP_A,
      amount: 2200, durationMonths: 1, interestRate: 10, interestMethod: 'reducing',
      accrualMode: 'revolving', principalBalance: 0, interestOutstanding: 0,
      fullyPaid: true, archived: false, installments: [],
      entries: [
        { date: new Date('2026-10-03T07:31:00.470Z'), type: 'disbursement', amount: 2200, principalAfter: 2200, interestAfter: 0 },
        { date: new Date('2026-10-07T10:54:41.578Z'), type: 'principal_payment', amount: 2200, principalAfter: 0, interestAfter: 0 },
      ],
    });
    const closedLoanBase = {
      userId: MUYA, groupId: GROUP_A,
      amount: 500, durationMonths: 1, interestRate: 10, interestMethod: 'reducing',
      accrualMode: 'revolving', interestOutstanding: 0, installments: [], entries: [],
    };
    await Loan().create({ ...closedLoanBase, principalBalance: 0, fullyPaid: true, archived: false });
    await Loan().create({ ...closedLoanBase, principalBalance: 500, fullyPaid: false, archived: true });
    await Transaction().create({
      userId: MUYA, groupId: GROUP_A, type: 'loan_payment', amount: 2200,
      referenceId: loan._id, note: 'Payment — interest K0, principal K2200',
      createdAt: new Date('2026-10-07T10:54:41.600Z'),
    });

    const res = await request(app)
      .put(`/api/loans/${loan._id}/entries/${loan.entries[1]._id}/reverse`)
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Recorded in error' });

    expect(res.statusCode).toBe(200);
    expect(res.body.loan.fullyPaid).toBe(false);
  });

  test('11. malformed loanId → 404, not a 500 CastError', async () => {
    await seedBase();
    const res = await request(app)
      .put('/api/loans/not-an-object-id/entries/6ac624f15a6d213606539aea/reverse')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ cancelReason: 'Recorded in error' });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Loan not found');
    expect(JSON.stringify(res.body)).not.toMatch(/Cast to ObjectId/);
  });
});

describe('Revolving top-up target', () => {
  test('12. with two open revolving loans (legacy state), a top-up posts to the newest', async () => {
    await seedBase();
    await GroupSettings().updateOne(
      { groupId: GROUP_A },
      { $set: { 'policies.loanAccrual': 'revolving_monthly', 'policies.loanLimit': 'none' } }
    );
    const openLoanBase = {
      userId: MUYA, groupId: GROUP_A,
      durationMonths: 1, interestRate: 10, interestMethod: 'reducing',
      accrualMode: 'revolving', interestOutstanding: 0,
      fullyPaid: false, archived: false, installments: [],
    };
    // Inserted oldest-first, so an unsorted findOne would return the older loan.
    const older = await Loan().create({
      ...openLoanBase, amount: 1000, principalBalance: 1000,
      createdAt: new Date('2026-09-01T09:00:00.000Z'),
      entries: [{ date: new Date('2026-09-01T09:00:00.000Z'), type: 'disbursement', amount: 1000, principalAfter: 1000, interestAfter: 0 }],
    });
    const newer = await Loan().create({
      ...openLoanBase, amount: 3000, principalBalance: 3000,
      createdAt: new Date('2026-10-01T09:00:00.000Z'),
      entries: [{ date: new Date('2026-10-01T09:00:00.000Z'), type: 'disbursement', amount: 3000, principalAfter: 3000, interestAfter: 0 }],
    });

    const res = await request(app)
      .post('/api/loans')
      .set('Authorization', 'Bearer valid-admin-token')
      .send({ username: 'Muyapekwa E Daka', amount: 500 });

    expect([200, 201]).toContain(res.statusCode);
    expect((await Loan().findById(newer._id)).principalBalance).toBe(3500);
    expect((await Loan().findById(older._id)).principalBalance).toBe(1000);
    expect(await Loan().countDocuments({ userId: MUYA })).toBe(2);
  });
});
