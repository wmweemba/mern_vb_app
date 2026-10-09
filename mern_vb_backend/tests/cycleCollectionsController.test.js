const { summarizeLoans } = require('../controllers/cycleCollectionsController');

describe('summarizeLoans — revolving loans', () => {
  test('sums interest_payment and principal_payment entries separately, ignoring disbursement/accrual/capitalisation', () => {
    const loans = [{
      accrualMode: 'revolving',
      entries: [
        { type: 'disbursement', amount: 3500 },
        { type: 'accrual', amount: 350 },
        { type: 'interest_payment', amount: 350 },
        { type: 'principal_payment', amount: 400 },
        { type: 'capitalisation', amount: 350 },
        { type: 'interest_payment', amount: 440 },
      ],
    }];
    expect(summarizeLoans(loans)).toEqual({ monthlyInterest: 790, loanRepayment: 400 });
  });

  test('sums across multiple loans (multiple members)', () => {
    const loans = [
      { accrualMode: 'revolving', entries: [{ type: 'interest_payment', amount: 490 }] },
      { accrualMode: 'revolving', entries: [{ type: 'principal_payment', amount: 400 }, { type: 'interest_payment', amount: 100 }] },
    ];
    expect(summarizeLoans(loans)).toEqual({ monthlyInterest: 590, loanRepayment: 400 });
  });

  test('a loan with no payments yet contributes zero', () => {
    const loans = [{ accrualMode: 'revolving', entries: [{ type: 'disbursement', amount: 1000 }] }];
    expect(summarizeLoans(loans)).toEqual({ monthlyInterest: 0, loanRepayment: 0 });
  });

  test('an empty loan list contributes zero', () => {
    expect(summarizeLoans([])).toEqual({ monthlyInterest: 0, loanRepayment: 0 });
  });
});

describe('summarizeLoans — scheduled loans', () => {
  test('scheduled loans are ignored entirely (no entries[], nothing to sum)', () => {
    const loans = [{
      accrualMode: 'scheduled',
      installments: [{ paid: true, paidAmount: 1250, interest: 250, total: 1250 }],
    }];
    expect(summarizeLoans(loans)).toEqual({ monthlyInterest: 0, loanRepayment: 0 });
  });

  test('a mix of scheduled and revolving loans only credits the revolving one', () => {
    const loans = [
      { accrualMode: 'scheduled', installments: [{ paid: true, paidAmount: 1250, interest: 250, total: 1250 }] },
      { accrualMode: 'revolving', entries: [{ type: 'interest_payment', amount: 490 }, { type: 'principal_payment', amount: 400 }] },
    ];
    expect(summarizeLoans(loans)).toEqual({ monthlyInterest: 490, loanRepayment: 400 });
  });

  test('reversal entries (negative amount with reversalOf) net to zero with originals', () => {
    const paymentEntryId1 = '507f1f77bcf86cd799439011';
    const paymentEntryId2 = '507f1f77bcf86cd799439012';
    const loans = [{
      accrualMode: 'revolving',
      entries: [
        { _id: paymentEntryId1, type: 'interest_payment', amount: 220 },
        { _id: paymentEntryId2, type: 'principal_payment', amount: 2200 },
        { type: 'interest_payment', amount: -220, reversalOf: paymentEntryId1 },
        { type: 'principal_payment', amount: -2200, reversalOf: paymentEntryId2 },
      ],
    }];
    expect(summarizeLoans(loans)).toEqual({ monthlyInterest: 0, loanRepayment: 0 });
  });

  test('sanity: non-reversed interest_payment and principal_payment entries sum correctly', () => {
    const loans = [{
      accrualMode: 'revolving',
      entries: [
        { type: 'interest_payment', amount: 220 },
        { type: 'principal_payment', amount: 2200 },
      ],
    }];
    expect(summarizeLoans(loans)).toEqual({ monthlyInterest: 220, loanRepayment: 2200 });
  });
});

// Total arithmetic (mirrors buildSummary's reduction, without the DB round-trip —
// same style as interestObligationController.test.js's credited/shortfall block).
describe('cycle collections total arithmetic', () => {
  function round2(n) { return +Number(n).toFixed(2); }
  function total({ monthlyInterest, loanRepayment, addedInterest, membershipFee }) {
    return round2(monthlyInterest + loanRepayment + addedInterest + membershipFee);
  }

  test('Grace-style cycle: interest, repayment, top-up and membership fee all present', () => {
    expect(total({ monthlyInterest: 490, loanRepayment: 400, addedInterest: 1050, membershipFee: 250 })).toBe(2190);
  });

  test('a village_bank group with no revolving loans and no liability/quota types totals zero', () => {
    expect(total({ monthlyInterest: 0, loanRepayment: 0, addedInterest: 0, membershipFee: 0 })).toBe(0);
  });

  test('rounds to 2dp', () => {
    expect(total({ monthlyInterest: 100.006, loanRepayment: 0, addedInterest: 0, membershipFee: 0 })).toBe(100.01);
  });
});
