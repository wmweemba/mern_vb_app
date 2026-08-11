const calculateLoanSchedule = require('../../loanCalculator');
const { applyPayment, outstanding, accrue } = require('./scheduledCommon');

// Wraps today's loanCalculator.js flat-rate branch — no behaviour change from
// docs/plan_configurable_group_rules.md Phase 1. Note (per the plan, §2.1): the
// `flat` branch charges amount × rate on *every* installment, which double-charges
// a group like Champions (25% over 2 payments). That defect belongs to `term_flat`
// (Phase 2+, parked) and is intentionally not touched here — this strategy exists so
// existing groups already using `interestMethod: 'flat'` keep their exact current
// (buggy-for-Champions-shaped-groups, correct-for-existing-groups) behaviour.
module.exports = {
  key: 'scheduled_flat',

  onDisburse(amount, duration, interestRate) {
    return calculateLoanSchedule(amount, duration, interestRate, 'flat');
  },

  accrue,
  applyPayment,
  outstanding,
};
