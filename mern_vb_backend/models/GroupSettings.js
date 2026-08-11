const mongoose = require('mongoose');

const groupSettingsSchema = new mongoose.Schema({
  groupName: { type: String, required: true },
  meetingDay: { type: String, default: null },
  lateFineType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },

  // Cycle configuration
  cycleLengthMonths: {
    type: Number,
    required: true,
    enum: [6, 12],
  },

  // Loan configuration
  interestRate: {
    type: Number,
    required: true,
    min: 1,
    max: 50,
  },
  interestMethod: {
    type: String,
    required: true,
    enum: ['reducing', 'flat'],
  },
  defaultLoanDuration: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  loanLimitMultiplier: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
  },

  // Penalty configuration
  latePenaltyRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  overdueFineAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  earlyPaymentCharge: {
    type: Number,
    required: true,
    min: 0,
  },
  partialPaymentFineAmount: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Savings configuration
  savingsInterestRate: {
    type: Number,
    required: true,
    min: 0,
    max: 50,
  },
  minimumSavingsMonth1: {
    type: Number,
    required: true,
    min: 0,
  },
  minimumSavingsMonthly: {
    type: Number,
    required: true,
    min: 0,
  },
  maximumSavingsFirst3Months: {
    type: Number,
    required: true,
    min: 0,
  },
  savingsShortfallFine: {
    type: Number,
    required: true,
    min: 0,
  },

  // Profit sharing
  profitSharingMethod: {
    type: String,
    required: true,
    enum: ['proportional', 'equal'],
  },

  // Configurable group rules (docs/plan_configurable_group_rules.md Phase 1) —
  // which archetype this group was created from, and the behavioural policy for
  // each seam. Defaults below match 'village_bank', so any group that predates
  // templates keeps its exact current behaviour once backfilled.
  templateKey: { type: String, default: 'village_bank' },
  policies: {
    loanAccrual:        { type: String, enum: ['scheduled_reducing', 'scheduled_flat', 'revolving_monthly', 'term_flat'], default: 'scheduled_reducing' },
    arrears:             { type: String, enum: ['none', 'capitalise'], default: 'none' },
    loanLimit:           { type: String, enum: ['none', 'fixed_cap', 'savings_multiple'], default: 'savings_multiple' },
    concurrentLoans:      { type: String, enum: ['unlimited', 'one_at_a_time'], default: 'unlimited' },
    interestObligation:   { type: String, enum: ['none', 'per_member_quota'], default: 'none' },
    cycleEnd:             { type: String, enum: ['pooled_external', 'shareout_equal', 'shareout_proportional'], default: 'shareout_proportional' },
    exit:                 { type: String, enum: ['settle_and_refund', 'forfeit'], default: 'settle_and_refund' },
  },
  interestObligationAmount: { type: Number, default: 0, min: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

groupSettingsSchema.index({ groupId: 1 }, { unique: true });

groupSettingsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('GroupSettings', groupSettingsSchema);
