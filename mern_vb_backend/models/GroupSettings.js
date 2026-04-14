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

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

groupSettingsSchema.index({ groupId: 1 }, { unique: true });

groupSettingsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('GroupSettings', groupSettingsSchema);
