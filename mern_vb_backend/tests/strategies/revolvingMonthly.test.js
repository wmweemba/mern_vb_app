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
    expect(result).toEqual({ toInterest: 490, toPrincipal: 0, interestCharged: 0, fullyPaid: false });
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
    expect(result).toEqual({ toInterest: 100, toPrincipal: 0, interestCharged: 0, fullyPaid: false });
    expect(loan.interestOutstanding).toBe(0);
    expect(loan.principalBalance).toBe(1000);
  });

  test('principal-only payment leaves interest outstanding untouched', () => {
    const loan = opening();
    const result = revolvingMonthly.applyPayment(loan, 100, { toInterest: 0, toPrincipal: 100 });
    expect(result).toEqual({ toInterest: 0, toPrincipal: 100, interestCharged: 0, fullyPaid: false });
    expect(loan.interestOutstanding).toBe(100);
    expect(loan.principalBalance).toBe(900);
  });

  test('a stated split applies to both sides', () => {
    const loan = opening();
    const result = revolvingMonthly.applyPayment(loan, 100, { toInterest: 50, toPrincipal: 50 });
    expect(result).toEqual({ toInterest: 50, toPrincipal: 50, interestCharged: 0, fullyPaid: false });
    expect(loan.interestOutstanding).toBe(50);
    expect(loan.principalBalance).toBe(950);
  });

  test('no allocation supplied defaults to interest-first', () => {
    const loan = opening();
    const result = revolvingMonthly.applyPayment(loan, 150);
    expect(result).toEqual({ toInterest: 100, toPrincipal: 50, interestCharged: 0, fullyPaid: false });
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

// Revolving Payment Corrections (docs/build/revolving-payment-corrections/plan.md, U1):
// in-month interest charging and payment reversal. Fixtures mirror the Muya Daka
// production case read 2026-10-08 (§Context): K2,200 disbursed 03/10, repaid K2,420
// on 07/10 before October's Month-End accrual had run, so interestOutstanding was K0
// at payment time.
describe('revolvingMonthly — in-month interest charge (applyPayment ctx.chargeInterestShortfall)', () => {
  test('(a) Muya replay: charging the shortfall lets 220/2200 be recorded against 0 outstanding interest', () => {
    const loan = newLoan({ principalBalance: 4200, interestOutstanding: 0 });

    const result = revolvingMonthly.applyPayment(
      loan, 2420, { toInterest: 220, toPrincipal: 2200 }, { chargeInterestShortfall: true }
    );

    expect(result).toEqual({ toInterest: 220, toPrincipal: 2200, interestCharged: 220, fullyPaid: false });
    expect(loan.principalBalance).toBe(2000);
    expect(loan.interestOutstanding).toBe(0);

    const types = loan.entries.map(e => e.type);
    expect(types).toEqual(['interest_charge', 'interest_payment', 'principal_payment']);
    expect(loan.entries[0].amount).toBe(220);
    expect(loan.entries[1].amount).toBe(220);
    expect(loan.entries[2].amount).toBe(2200);

    const dates = loan.entries.map(e => e.date.getTime());
    expect(new Set(dates).size).toBe(1);
  });

  test('(b) the same payment without the flag is refused, mentioning in-month interest', () => {
    const loan = newLoan({ principalBalance: 4200, interestOutstanding: 0 });
    expect(() => revolvingMonthly.applyPayment(loan, 2420, { toInterest: 220, toPrincipal: 2200 }))
      .toThrow(/in-month interest/);
  });

  test('(c) flag set but toInterest does not exceed what is outstanding — no interest_charge entry', () => {
    const loan = newLoan({ principalBalance: 1000, interestOutstanding: 100 });

    const result = revolvingMonthly.applyPayment(
      loan, 100, { toInterest: 100, toPrincipal: 0 }, { chargeInterestShortfall: true }
    );

    expect(result.interestCharged).toBe(0);
    expect(loan.entries.map(e => e.type)).toEqual(['interest_payment']);
  });
});

describe('revolvingMonthly — reversePayment', () => {
  function withEntry(entryOverrides, loanOverrides = {}) {
    const loan = newLoan(loanOverrides);
    loan.entries.push({ _id: 'e1', ...entryOverrides });
    return loan;
  }

  test('(d) reverses a legacy single principal_payment with no transactionId', () => {
    const paymentDate = new Date('2026-10-07T10:54:41.578Z');
    const loan = withEntry(
      {
        type: 'principal_payment',
        amount: 2420,
        date: paymentDate,
        principalAfter: 1780,
        interestAfter: 0,
      },
      { principalBalance: 1780, interestOutstanding: 0 }
    );

    const result = revolvingMonthly.reversePayment(loan, 'e1', { reason: 'Recorded all as principal', reversedBy: 'treasurer1' });

    expect(loan.principalBalance).toBe(4200);
    expect(loan.interestOutstanding).toBe(0);
    expect(result).toEqual({
      toInterest: 0,
      toPrincipal: 2420,
      interestCharged: 0,
      totalPaid: 2420,
      setDate: paymentDate,
      transactionId: null,
    });

    const reversalEntry = loan.entries.find(e => e.reversalOf === 'e1');
    expect(reversalEntry.type).toBe('principal_payment');
    expect(reversalEntry.amount).toBe(-2420);

    const original = loan.entries.find(e => e._id === 'e1');
    expect(original.reversedAt).toBeTruthy();
    expect(original.reversedBy).toBe('treasurer1');
    expect(original.reverseReason).toBe('Recorded all as principal');
  });

  test('(e) reverses a whole payment set (charge + interest + principal) by passing the interest_payment id', () => {
    const loan = newLoan({ principalBalance: 4200, interestOutstanding: 0 });
    revolvingMonthly.applyPayment(
      loan, 2420, { toInterest: 220, toPrincipal: 2200 }, { chargeInterestShortfall: true }
    );
    // Real Mongoose subdocuments get an _id automatically; these plain-object fixtures
    // need one assigned so reversePayment can look the entry up by id.
    loan.entries.forEach((e, i) => { e._id = `entry${i}`; });
    const interestPaymentEntry = loan.entries.find(e => e.type === 'interest_payment');

    const result = revolvingMonthly.reversePayment(
      loan, interestPaymentEntry._id, { reason: 'wrong split', reversedBy: 'treasurer1' }
    );

    expect(loan.principalBalance).toBe(4200);
    expect(loan.interestOutstanding).toBe(0);
    expect(result.toInterest).toBe(220);
    expect(result.toPrincipal).toBe(2200);
    expect(result.interestCharged).toBe(220);
    expect(result.totalPaid).toBe(2420);

    const negated = loan.entries.filter(e => e.reversalOf);
    expect(negated).toHaveLength(3);
    expect(negated.map(e => e.amount).sort((a, b) => a - b)).toEqual([-2200, -220, -220]);
  });

  test('(f) reversing an already-reversed payment is refused', () => {
    const loan = withEntry(
      { type: 'principal_payment', amount: 2420, date: new Date('2026-10-07T10:54:41.578Z') },
      { principalBalance: 1780, interestOutstanding: 0 }
    );
    revolvingMonthly.reversePayment(loan, 'e1', { reason: 'first reversal', reversedBy: 'treasurer1' });

    expect(() => revolvingMonthly.reversePayment(loan, 'e1', { reason: 'again', reversedBy: 'treasurer1' }))
      .toThrow(/already been reversed/);
  });

  test('(g) an accrual dated after the payment blocks reversal', () => {
    const paymentDate = new Date('2026-10-07T10:54:41.578Z');
    const loan = withEntry(
      { type: 'principal_payment', amount: 2420, date: paymentDate },
      { principalBalance: 1780, interestOutstanding: 0 }
    );
    loan.entries.push({
      _id: 'accrual1',
      type: 'accrual',
      amount: 200,
      date: new Date('2026-10-25T13:00:00.000Z'),
      periodLabel: '2026-10',
    });

    expect(() => revolvingMonthly.reversePayment(loan, 'e1', { reason: 'late', reversedBy: 'treasurer1' }))
      .toThrow(/Month-End Interest has run/);
  });

  test('(h) a later disbursement (top-up) does not block reversal', () => {
    const paymentDate = new Date('2026-10-07T10:54:41.578Z');
    const loan = withEntry(
      { type: 'principal_payment', amount: 2420, date: paymentDate },
      { principalBalance: 1780, interestOutstanding: 0 }
    );
    loan.entries.push({
      _id: 'disb1',
      type: 'disbursement',
      amount: 500,
      date: new Date('2026-10-08T09:00:00.000Z'),
    });

    expect(() => revolvingMonthly.reversePayment(loan, 'e1', { reason: 'fine', reversedBy: 'treasurer1' }))
      .not.toThrow();
    // The manually-pushed disbursement entry is a fixture for the date-ordering check
    // only (reversePayment never calls onDisburse), so principalBalance restores to
    // the opening 1780 + the reversed 2420 payment, unaffected by it.
    expect(loan.principalBalance).toBe(1780 + 2420);
  });

  test('(i) the sum of amounts by type nets back to the pre-payment value after reversal', () => {
    const loan = newLoan({ principalBalance: 4200, interestOutstanding: 0 });
    revolvingMonthly.applyPayment(
      loan, 2420, { toInterest: 220, toPrincipal: 2200 }, { chargeInterestShortfall: true }
    );
    loan.entries.forEach((e, i) => { e._id = `entry${i}`; });
    const interestPaymentEntry = loan.entries.find(e => e.type === 'interest_payment');
    revolvingMonthly.reversePayment(loan, interestPaymentEntry._id, { reason: 'undo', reversedBy: 'treasurer1' });

    const sumByType = (type) => loan.entries.filter(e => e.type === type).reduce((s, e) => s + e.amount, 0);
    expect(sumByType('interest_charge')).toBe(0);
    expect(sumByType('interest_payment')).toBe(0);
    expect(sumByType('principal_payment')).toBe(0);
  });
});
