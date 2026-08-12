const { interestPaidOnLoan } = require('../controllers/interestObligationController');

describe('interestPaidOnLoan — revolving loans', () => {
  test('sums only interest_payment entries, ignores principal/disbursement/accrual', () => {
    const loan = {
      accrualMode: 'revolving',
      entries: [
        { type: 'disbursement', amount: 3500 },
        { type: 'accrual', amount: 350 },
        { type: 'interest_payment', amount: 350 },
        { type: 'principal_payment', amount: 200 },
        { type: 'interest_payment', amount: 100 },
      ],
    };
    expect(interestPaidOnLoan(loan)).toBe(450);
  });

  test('a loan with no interest payments yet credits zero', () => {
    const loan = { accrualMode: 'revolving', entries: [{ type: 'disbursement', amount: 1000 }] };
    expect(interestPaidOnLoan(loan)).toBe(0);
  });
});

describe('interestPaidOnLoan — scheduled loans', () => {
  test('a fully paid installment credits its full interest portion', () => {
    const loan = {
      accrualMode: 'scheduled',
      installments: [
        { paid: true, paidAmount: 1250, interest: 250, total: 1250 },
      ],
    };
    expect(interestPaidOnLoan(loan)).toBe(250);
  });

  test('a partial payment credits interest first, up to the interest portion', () => {
    // Interest is 250; member paid 150 so far — all of it counts as interest credit.
    const loan = {
      accrualMode: 'scheduled',
      installments: [
        { paid: false, paidAmount: 150, interest: 250, total: 1250 },
      ],
    };
    expect(interestPaidOnLoan(loan)).toBe(150);
  });

  test('a partial payment exceeding the interest portion caps credit at the interest amount', () => {
    // Paid 300 of a 250-interest / 1250-total installment (principal partially covered too).
    const loan = {
      accrualMode: 'scheduled',
      installments: [
        { paid: false, paidAmount: 300, interest: 250, total: 1250 },
      ],
    };
    expect(interestPaidOnLoan(loan)).toBe(250);
  });

  test('an untouched installment credits nothing', () => {
    const loan = {
      accrualMode: 'scheduled',
      installments: [{ paid: false, paidAmount: 0, interest: 250, total: 1250 }],
    };
    expect(interestPaidOnLoan(loan)).toBe(0);
  });

  test('sums across multiple installments', () => {
    const loan = {
      accrualMode: 'scheduled',
      installments: [
        { paid: true, paidAmount: 1250, interest: 250, total: 1250 },
        { paid: false, paidAmount: 100, interest: 187.5, total: 1187.5 },
        { paid: false, paidAmount: 0, interest: 125, total: 1125 },
      ],
    };
    expect(interestPaidOnLoan(loan)).toBe(350); // 250 + 100 + 0
  });
});

// Credited/shortfall arithmetic (mirrors buildReport's per-member reduction, without
// the DB round-trip — the aggregation logic itself is what's worth locking down).
describe('interest obligation credited/shortfall arithmetic', () => {
  function round2(n) { return +Number(n).toFixed(2); }
  function shortfallFor(target, creditedFromLoans, creditedFromContributions) {
    const credited = round2(creditedFromLoans + creditedFromContributions);
    return round2(Math.max(0, target - credited));
  }

  test('Grace-style quota: K1,050 target, fully met by loan interest alone', () => {
    expect(shortfallFor(1050, 1050, 0)).toBe(0);
  });

  test('quota met via a mix of loan interest and a cash top-up', () => {
    expect(shortfallFor(1050, 600, 450)).toBe(0);
  });

  test('over-delivering produces zero shortfall, not a negative one (no credit-back)', () => {
    expect(shortfallFor(1050, 1080, 0)).toBe(0);
  });

  test('a member who paid nothing owes the full target as shortfall', () => {
    expect(shortfallFor(1050, 0, 0)).toBe(1050);
  });

  test('target of 0 (quota not configured) never produces a shortfall', () => {
    expect(shortfallFor(0, 0, 0)).toBe(0);
  });
});
