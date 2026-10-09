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
//
// In-month interest (docs/build/revolving-payment-corrections/plan.md): Month-End
// accrual only charges interest on the principal outstanding when it runs, so money
// borrowed and repaid within the same month (before that month's accrual) escapes
// interest entirely unless the treasurer opts in here. When the requested
// toInterest exceeds what's currently outstanding AND ctx.chargeInterestShortfall
// === true, the shortfall is raised onto interestOutstanding via a new
// 'interest_charge' entry before the payment itself is applied — this is never
// automatic, the caller must explicitly opt in. Without the flag, the allocation is
// refused exactly as before.
function applyPayment(loan, paymentAmount, allocation = {}, ctx = {}) {
  // One date for every entry this call may push (charge + interest_payment +
  // principal_payment) — callers and consumers treat "same date" as "same payment".
  const date = ctx.date || new Date();

  const amount = round2(paymentAmount);
  const principalBalance = loan.principalBalance || 0;
  const interestOutstanding = loan.interestOutstanding || 0;

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

  let interestCharged = 0;
  let effectiveInterestOutstanding = interestOutstanding;

  if (toInterest > interestOutstanding + EPSILON) {
    if (ctx.chargeInterestShortfall === true) {
      interestCharged = round2(toInterest - interestOutstanding);
      effectiveInterestOutstanding = round2(interestOutstanding + interestCharged);
    } else {
      throw Object.assign(
        new Error(
          `Cannot allocate K${toInterest} to interest — only K${interestOutstanding} is outstanding`
          + ' — confirm an in-month interest charge to record interest before Month-End'
        ),
        { status: 400 }
      );
    }
  }

  // The outstanding-balance check runs after any in-month charge has been folded in,
  // so a payment covering newly-charged interest (not yet reflected in
  // interestOutstanding before this call) is correctly allowed. It still runs before
  // the per-component principal check below, so a bulk overpayment reports the
  // general "exceeds outstanding balance" error rather than a confusing
  // principal-only one.
  const totalOutstanding = round2(principalBalance + effectiveInterestOutstanding);
  if (amount > totalOutstanding + EPSILON) {
    throw Object.assign(
      new Error(`Payment of K${amount} exceeds outstanding balance of K${totalOutstanding}`),
      { status: 400 }
    );
  }

  if (toPrincipal > principalBalance + EPSILON) {
    throw Object.assign(
      new Error(`Cannot allocate K${toPrincipal} to principal — only K${principalBalance} is outstanding`),
      { status: 400 }
    );
  }

  if (interestCharged > 0) {
    loan.entries.push({
      date,
      type: 'interest_charge',
      amount: interestCharged,
      principalAfter: principalBalance,
      interestAfter: effectiveInterestOutstanding,
      transactionId: ctx.transactionId,
      recordedBy: ctx.recordedBy,
    });
  }

  loan.interestOutstanding = round2(effectiveInterestOutstanding - toInterest);
  loan.principalBalance = round2(principalBalance - toPrincipal);

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
    interestCharged,
    fullyPaid: loan.principalBalance <= EPSILON && loan.interestOutstanding <= EPSILON,
  };
}

// Reverses one previously-recorded payment "set" — every entry an applyPayment call
// pushed, identified by sharing the same date (the "same date = one payment"
// invariant applyPayment maintains). Reversal never deletes or edits the original
// entries; it appends negated entries (reversalOf linking back) and stamps the
// originals with reversedAt/reversedBy/reverseReason. Pure: the caller owns
// persistence, BankBalance and Transaction logging.
//
// entryId may be any one entry in the set (interest_charge / interest_payment /
// principal_payment, amount > 0, not already a reversal and not already reversed) —
// reversing any one reverses the whole set it belongs to.
function reversePayment(loan, entryId, ctx = {}) {
  const REVERSIBLE_TYPES = ['interest_charge', 'interest_payment', 'principal_payment'];

  const entry = (loan.entries || []).find((e) => String(e._id) === String(entryId));
  if (
    !entry
    || !REVERSIBLE_TYPES.includes(entry.type)
    || !(entry.amount > 0)
    || entry.reversalOf
  ) {
    throw Object.assign(new Error('No reversible payment entry found for that id'), { status: 400 });
  }

  const setDate = entry.date;
  const setTime = setDate.getTime();
  const set = loan.entries.filter((e) => (
    REVERSIBLE_TYPES.includes(e.type)
    && e.amount > 0
    && !e.reversalOf
    && e.date.getTime() === setTime
  ));

  if (set.some((e) => e.reversedAt)) {
    throw Object.assign(new Error('This payment has already been reversed'), { status: 400 });
  }

  const laterAccrualOrCapitalisation = (loan.entries || []).some((e) => (
    (e.type === 'accrual' || e.type === 'capitalisation')
    && e.date.getTime() > setTime
  ));
  if (laterAccrualOrCapitalisation) {
    throw Object.assign(
      new Error('Month-End Interest has run since this payment; it can no longer be reversed'),
      { status: 400 }
    );
  }

  const sumByType = (type) => round2(
    set.filter((e) => e.type === type).reduce((sum, e) => sum + e.amount, 0)
  );
  const toPrincipal = sumByType('principal_payment');
  const toInterest = sumByType('interest_payment');
  const interestCharged = sumByType('interest_charge');

  const restoredPrincipal = round2((loan.principalBalance || 0) + toPrincipal);
  const restoredInterest = round2((loan.interestOutstanding || 0) + toInterest - interestCharged);

  if (restoredInterest < -EPSILON) {
    throw Object.assign(
      new Error('Reversal would drive interestOutstanding negative — data corruption suspected'),
      { status: 500 }
    );
  }

  loan.principalBalance = restoredPrincipal;
  loan.interestOutstanding = Math.max(0, restoredInterest);

  const reversalDate = ctx.date || new Date();
  let transactionId = null;
  for (const e of set) {
    if (e.transactionId) {
      transactionId = e.transactionId;
      break;
    }
  }

  for (const e of set) {
    loan.entries.push({
      date: reversalDate,
      type: e.type,
      amount: -e.amount,
      principalAfter: loan.principalBalance,
      interestAfter: loan.interestOutstanding,
      reversalOf: e._id,
      recordedBy: ctx.reversedBy,
    });
    e.reversedAt = reversalDate;
    e.reversedBy = ctx.reversedBy;
    e.reverseReason = ctx.reason;
  }

  return {
    toInterest,
    toPrincipal,
    interestCharged,
    totalPaid: round2(toInterest + toPrincipal),
    setDate,
    transactionId,
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
  reversePayment,
  outstanding,
};
