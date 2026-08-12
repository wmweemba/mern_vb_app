const scheduledReducing = require('./scheduledReducing');
const scheduledFlat = require('./scheduledFlat');
const revolvingMonthly = require('./revolvingMonthly');

const REGISTRY = {
  [scheduledReducing.key]: scheduledReducing,
  [scheduledFlat.key]: scheduledFlat,
  [revolvingMonthly.key]: revolvingMonthly,
  // term_flat (Champions, parked) is added when built.
};

// GroupSettings.interestMethod ('reducing' | 'flat') predates policies.loanAccrual and
// is still the field the Settings UI edits directly (Phase 1 doesn't add a policy
// editor). So for the two "scheduled" families, interestMethod stays authoritative —
// this keeps every existing group's behaviour identical even if its stored
// policies.loanAccrual is stale relative to a later interestMethod edit. A genuinely
// different accrual family (revolving, term-flat) is chosen by policy alone, since
// interestMethod has no meaning there.
function resolveLoanAccrualKey(settings) {
  const policyKey = settings?.policies?.loanAccrual || 'scheduled_reducing';
  if (policyKey === 'scheduled_reducing' || policyKey === 'scheduled_flat') {
    return settings.interestMethod === 'flat' ? 'scheduled_flat' : 'scheduled_reducing';
  }
  return policyKey;
}

function resolveLoanAccrualStrategy(settings) {
  const key = resolveLoanAccrualKey(settings);
  const strategy = REGISTRY[key];
  if (!strategy) {
    throw new Error(`No loanAccrual strategy registered for key "${key}"`);
  }
  return strategy;
}

// Once a loan exists, its own accrualMode is authoritative — settings can change
// after creation (a group could in principle re-template), but an open loan must
// keep using the strategy it was created under until it's settled.
function resolveLoanAccrualKeyForLoan(loan) {
  if (loan.accrualMode === 'revolving') return 'revolving_monthly';
  return loan.interestMethod === 'flat' ? 'scheduled_flat' : 'scheduled_reducing';
}

function resolveLoanAccrualStrategyForLoan(loan) {
  const key = resolveLoanAccrualKeyForLoan(loan);
  const strategy = REGISTRY[key];
  if (!strategy) {
    throw new Error(`No loanAccrual strategy registered for key "${key}"`);
  }
  return strategy;
}

module.exports = {
  resolveLoanAccrualStrategy,
  resolveLoanAccrualKey,
  resolveLoanAccrualStrategyForLoan,
  resolveLoanAccrualKeyForLoan,
  REGISTRY,
};
