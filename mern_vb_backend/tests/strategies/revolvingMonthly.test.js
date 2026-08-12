const revolvingMonthly = require('../../utils/strategies/loanAccrual/revolvingMonthly');

// Golden-file cases drawn from Grace Kalele's group workbook, per
// docs/plan_configurable_group_rules.md §5. A plain object with an `entries` array
// stands in for the Mongoose subdocument — the strategy only calls .push()/.some() on
// it, so no DB is needed for these tests.
function newLoan(overrides = {}) {
  return { principalBalance: 0, interestOutstanding: 0, entries: [], ...overrides };
}

describe('revolvingMonthly — Mwiza case (workbook regression fixture)', () => {
  test('February: disbursement then a same-month top-up merges into one balance (3,500 + 1,400 = 4,900)', () => {
    const fields = revolvingMonthly.onDisburse(null, 3500);
    const loan = newLoan(fields);
    expect(loan.principalBalance).toBe(3500);

    revolvingMonthly.onDisburse(loan, 1400);
    expect(loan.principalBalance).toBe(4900);
    expect(loan.entries.filter(e => e.type === 'disbursement')).toHaveLength(2);
  });

  test('March: accrues 490 on 4,900, then an interest-only cash payment leaves principal unmoved', () => {
    const loan = newLoan({ principalBalance: 4900 });

    const { interestCharge } = revolvingMonthly.accrue(loan, { periodLabel: '2026-03', rate: 10 });
    expect(interestCharge).toBe(490);
    expect(loan.interestOutstanding).toBe(490);
    expect(loan.principalBalance).toBe(4900);

    const result = revolvingMonthly.applyPayment(loan, 490, { toInterest: 490, toPrincipal: 0 });
    expect(result).toEqual({ toInterest: 490, toPrincipal: 0, fullyPaid: false });
    expect(loan.interestOutstanding).toBe(0);
    expect(loan.principalBalance).toBe(4900);
  });

  test('April: same pattern repeats — accrual then interest-only payment, balance still unmoved', () => {
    const loan = newLoan({ principalBalance: 4900 });

    revolvingMonthly.accrue(loan, { periodLabel: '2026-04', rate: 10 });
    expect(loan.interestOutstanding).toBe(490);

    revolvingMonthly.applyPayment(loan, 490, { toInterest: 490, toPrincipal: 0 });
    expect(loan.interestOutstanding).toBe(0);
    expect(loan.principalBalance).toBe(4900);
  });

  test('July: accrues 440 on an opening 4,400, then a 400 principal repayment drops it to 4,000', () => {
    const loan = newLoan({ principalBalance: 4400 });

    const { interestCharge } = revolvingMonthly.accrue(loan, { periodLabel: '2026-07', rate: 10 });
    expect(interestCharge).toBe(440);
    expect(loan.interestOutstanding).toBe(440);

    revolvingMonthly.applyPayment(loan, 400, { toInterest: 0, toPrincipal: 400 });
    expect(loan.principalBalance).toBe(4000);
    expect(loan.interestOutstanding).toBe(440); // unpaid interest carries
  });
});

describe('revolvingMonthly — capitalisation (confirmed real by Simon Peter, not synthetic)', () => {
  test('unpaid interest capitalises into principal before the new period is charged', () => {
    const loan = newLoan({ principalBalance: 1000, interestOutstanding: 100 });

    const { interestCharge } = revolvingMonthly.accrue(loan, {
      periodLabel: '2026-05', rate: 10, capitalise: true,
    });

    // 100 capitalises into principal first (1000 -> 1100), then 10% of the new,
    // larger balance is charged — not 10% of the original 1000.
    expect(interestCharge).toBe(110);
    expect(loan.principalBalance).toBe(1100);
    expect(loan.interestOutstanding).toBe(110);

    const types = loan.entries.map(e => e.type);
    expect(types).toEqual(['capitalisation', 'accrual']);
    expect(loan.entries[0].amount).toBe(100);
  });

  test('capitalisation does not fire when there is nothing outstanding to fold in', () => {
    const loan = newLoan({ principalBalance: 1000, interestOutstanding: 0 });
    revolvingMonthly.accrue(loan, { periodLabel: '2026-06', rate: 10, capitalise: true });
    expect(loan.entries.map(e => e.type)).toEqual(['accrual']);
    expect(loan.principalBalance).toBe(1000);
  });
});

describe('revolvingMonthly — member-directed allocation', () => {
  // Each case starts from the same balances so a fixed interest-first waterfall
  // would pass the first case here while silently being wrong for the other two.
  const opening = () => newLoan({ principalBalance: 1000, interestOutstanding: 100 });

  test('interest-only payment', () => {
    const loan = opening();
    const result = revolvingMonthly.applyPayment(loan, 100, { toInterest: 100, toPrincipal: 0 });
    expect(result).toEqual({ toInterest: 100, toPrincipal: 0, fullyPaid: false });
    expect(loan.interestOutstanding).toBe(0);
    expect(loan.principalBalance).toBe(1000);
  });

  test('principal-only payment leaves interest outstanding untouched', () => {
    const loan = opening();
    const result = revolvingMonthly.applyPayment(loan, 100, { toInterest: 0, toPrincipal: 100 });
    expect(result).toEqual({ toInterest: 0, toPrincipal: 100, fullyPaid: false });
    expect(loan.interestOutstanding).toBe(100);
    expect(loan.principalBalance).toBe(900);
  });

  test('a stated split applies to both sides', () => {
    const loan = opening();
    const result = revolvingMonthly.applyPayment(loan, 100, { toInterest: 50, toPrincipal: 50 });
    expect(result).toEqual({ toInterest: 50, toPrincipal: 50, fullyPaid: false });
    expect(loan.interestOutstanding).toBe(50);
    expect(loan.principalBalance).toBe(950);
  });

  test('no allocation supplied defaults to interest-first', () => {
    const loan = opening();
    const result = revolvingMonthly.applyPayment(loan, 150);
    expect(result).toEqual({ toInterest: 100, toPrincipal: 50, fullyPaid: false });
  });

  test('a payment that clears both balances marks the loan fully paid', () => {
    const loan = opening();
    const result = revolvingMonthly.applyPayment(loan, 1100, { toInterest: 100, toPrincipal: 1000 });
    expect(result.fullyPaid).toBe(true);
    expect(revolvingMonthly.outstanding(loan)).toBe(0);
  });
});

describe('revolvingMonthly — rejection paths', () => {
  test('overpayment beyond total outstanding is rejected, not absorbed', () => {
    const loan = newLoan({ principalBalance: 1000, interestOutstanding: 100 });
    expect(() => revolvingMonthly.applyPayment(loan, 5000)).toThrow(/exceeds outstanding balance/);
  });

  test('an allocation that does not sum to the payment amount is rejected', () => {
    const loan = newLoan({ principalBalance: 1000, interestOutstanding: 100 });
    expect(() => revolvingMonthly.applyPayment(loan, 100, { toInterest: 60, toPrincipal: 30 }))
      .toThrow(/must sum to the payment amount/);
  });

  test('directing more to interest than is actually outstanding is rejected', () => {
    const loan = newLoan({ principalBalance: 1000, interestOutstanding: 50 });
    expect(() => revolvingMonthly.applyPayment(loan, 100, { toInterest: 80, toPrincipal: 20 }))
      .toThrow(/only K50 is outstanding/);
  });
});

// Note: the projected_cycle_contribution loan-limit cap (§2.6) is not part of Phase 2
// (loanLimit stays 'none' for grocery_chilimba here) — it belongs with the loanLimit
// strategy work, tracked separately.
