const scheduledReducing = require('./scheduledReducing');
const scheduledFlat = require('./scheduledFlat');

const REGISTRY = {
  [scheduledReducing.key]: scheduledReducing,
  [scheduledFlat.key]: scheduledFlat,
  // revolving_monthly (Phase 2) and term_flat (parked) are added when built.
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

module.exports = { resolveLoanAccrualStrategy, resolveLoanAccrualKey, REGISTRY };
