// Revolving credit line (docs/plan_configurable_group_rules.md Phase 2), modelled on
// Grace Kalele's group: no term, no installment schedule. Interest accrues monthly on
// the outstanding principal; the member directs how each payment is split between
// interest and principal at payment time. Unpaid interest can capitalise into
// principal (gated on GroupSettings.policies.arrears === 'capitalise').
//
// Unlike the scheduled strategies, this one operates directly on the Loan document's
// principalBalance/interestOutstanding/entries[] rather than an installments[] array —
// there is no fixed schedule to generate.

const EPSILON = 0.01; // ZMW rounding tolerance

function round2(n) {
  return +Number(n).toFixed(2);
}

// loan === null/undefined → a brand new revolving loan's initial field values.
// loan present → top up (increase principalBalance on an existing open loan).
// Returns the field values to assign; caller is responsible for creating/saving the document.
function onDisburse(loan, amount, ctx = {}) {
  const disbursed = round2(amount);
  if (!loan) {
    return {
      accrualMode: 'revolving',
      principalBalance: disbursed,
      interestOutstanding: 0,
      entries: [{
        date: ctx.date || new Date(),
        type: 'disbursement',
        amount: disbursed,
        principalAfter: disbursed,
        interestAfter: 0,
        transactionId: ctx.transactionId,
        recordedBy: ctx.recordedBy,
      }],
    };
  }

  loan.principalBalance = round2((loan.principalBalance || 0) + disbursed);
  loan.entries.push({
    date: ctx.date || new Date(),
    type: 'disbursement',
    amount: disbursed,
    principalAfter: loan.principalBalance,
    interestAfter: loan.interestOutstanding || 0,
    transactionId: ctx.transactionId,
    recordedBy: ctx.recordedBy,
  });
  return loan;
}

// One period's interest charge. Creates NO Transaction and never touches BankBalance —
// accrual is not a cash movement, only a balance restatement. Idempotency (not
// double-charging a period) is the caller's responsibility (check entries for an
// existing 'accrual' with the same periodLabel before calling this).
function accrue(loan, ctx = {}) {
  const { periodLabel, rate, capitalise = false, recordedBy } = ctx;
  if (!periodLabel) throw new Error('accrue() requires a periodLabel');
  if (rate === undefined || rate === null) throw new Error('accrue() requires a rate');

  const date = ctx.date || new Date();

  if (capitalise && (loan.interestOutstanding || 0) > 0) {
    const capitalised = loan.interestOutstanding;
    loan.principalBalance = round2((loan.principalBalance || 0) + capitalised);
    loan.interestOutstanding = 0;
    loan.entries.push({
      date,
      periodLabel,
      type: 'capitalisation',
      amount: capitalised,
      principalAfter: loan.principalBalance,
      interestAfter: loan.interestOutstanding,
      recordedBy,
    });
  }

  const interestCharge = round2((loan.principalBalance || 0) * (rate / 100));
  loan.interestOutstanding = round2((loan.interestOutstanding || 0) + interestCharge);
  loan.entries.push({
    date,
    periodLabel,
    type: 'accrual',
    amount: interestCharge,
    principalAfter: loan.principalBalance,
    interestAfter: loan.interestOutstanding,
    recordedBy,
  });

  return { loan, interestCharge };
}

// allocation: { toInterest, toPrincipal } — member-directed at payment time. Omitted
// or partial → defaults to interest-first for the remainder (Simon's stated common
// case), but callers should always pass an explicit allocation when the member
// specified one; a fixed waterfall would silently misrecord any member who directs
// otherwise.
function applyPayment(loan, paymentAmount, allocation = {}, ctx = {}) {
  const amount = round2(paymentAmount);
  const principalBalance = loan.principalBalance || 0;
  const interestOutstanding = loan.interestOutstanding || 0;
  const totalOutstanding = round2(principalBalance + interestOutstanding);

  if (amount > totalOutstanding + EPSILON) {
    throw Object.assign(
      new Error(`Payment of K${amount} exceeds outstanding balance of K${totalOutstanding}`),
      { status: 400 }
    );
  }

  let toInterest = allocation.toInterest !== undefined ? round2(allocation.toInterest) : undefined;
  let toPrincipal = allocation.toPrincipal !== undefined ? round2(allocation.toPrincipal) : undefined;

  if (toInterest === undefined && toPrincipal === undefined) {
    toInterest = Math.min(amount, interestOutstanding);
    toPrincipal = round2(amount - toInterest);
  } else {
    toInterest = toInterest || 0;
    toPrincipal = toPrincipal || 0;
    if (Math.abs(toInterest + toPrincipal - amount) > EPSILON) {
      throw Object.assign(
        new Error(`Allocation (interest K${toInterest} + principal K${toPrincipal}) must sum to the payment amount K${amount}`),
        { status: 400 }
      );
    }
  }

  if (toInterest > interestOutstanding + EPSILON) {
    throw Object.assign(
      new Error(`Cannot allocate K${toInterest} to interest — only K${interestOutstanding} is outstanding`),
      { status: 400 }
    );
  }
  if (toPrincipal > principalBalance + EPSILON) {
    throw Object.assign(
      new Error(`Cannot allocate K${toPrincipal} to principal — only K${principalBalance} is outstanding`),
      { status: 400 }
    );
  }

  loan.interestOutstanding = round2(interestOutstanding - toInterest);
  loan.principalBalance = round2(principalBalance - toPrincipal);

  const date = ctx.date || new Date();
  if (toInterest > 0) {
    loan.entries.push({
      date,
      type: 'interest_payment',
      amount: toInterest,
      principalAfter: loan.principalBalance,
      interestAfter: loan.interestOutstanding,
      transactionId: ctx.transactionId,
      recordedBy: ctx.recordedBy,
    });
  }
  if (toPrincipal > 0) {
    loan.entries.push({
      date,
      type: 'principal_payment',
      amount: toPrincipal,
      principalAfter: loan.principalBalance,
      interestAfter: loan.interestOutstanding,
      transactionId: ctx.transactionId,
      recordedBy: ctx.recordedBy,
    });
  }

  return {
    toInterest,
    toPrincipal,
    fullyPaid: loan.principalBalance <= EPSILON && loan.interestOutstanding <= EPSILON,
  };
}

function outstanding(loan) {
  return round2((loan.principalBalance || 0) + (loan.interestOutstanding || 0));
}

module.exports = {
  key: 'revolving_monthly',
  onDisburse,
  accrue,
  applyPayment,
  outstanding,
};
