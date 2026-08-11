const calculateLoanSchedule = require('../../loanCalculator');
const { applyPayment, outstanding, accrue } = require('./scheduledCommon');

// Wraps today's loanCalculator.js — no behaviour change from docs/plan_configurable_group_rules.md
// Phase 1. loanCalculator.js itself stays the single implementation of reducing-balance math.
module.exports = {
  key: 'scheduled_reducing',

  onDisburse(amount, duration, interestRate) {
    return calculateLoanSchedule(amount, duration, interestRate, 'reducing');
  },

  accrue,
  applyPayment,
  outstanding,
};
