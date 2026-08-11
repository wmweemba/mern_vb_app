const mongoose = require('mongoose');
const { Schema } = mongoose;

// Platform-wide catalogue of group archetypes (village bank, grocery chilimba, ...).
// Templates are copied into a group's own GroupSettings at creation — never referenced
// live. Editing a template here only affects groups created after the edit; it must
// never retroactively restate the arithmetic of an existing group.
const groupTemplateSchema = new Schema({
  key:         { type: String, required: true, trim: true, unique: true },
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },

  policies: {
    loanAccrual:        { type: String, enum: ['scheduled_reducing', 'scheduled_flat', 'revolving_monthly', 'term_flat'], required: true },
    arrears:             { type: String, enum: ['none', 'capitalise'], required: true },
    loanLimit:           { type: String, enum: ['none', 'fixed_cap', 'savings_multiple'], required: true },
    concurrentLoans:      { type: String, enum: ['unlimited', 'one_at_a_time'], required: true },
    interestObligation:   { type: String, enum: ['none', 'per_member_quota'], required: true },
    cycleEnd:             { type: String, enum: ['pooled_external', 'shareout_equal', 'shareout_proportional'], required: true },
    exit:                 { type: String, enum: ['settle_and_refund', 'forfeit'], required: true },
  },

  // Copied verbatim into GroupSettings at group creation — same field names.
  defaults: {
    cycleLengthMonths:          { type: Number, default: 6 },
    interestRate:               { type: Number, default: 10 },
    interestMethod:              { type: String, enum: ['reducing', 'flat'], default: 'reducing' },
    defaultLoanDuration:         { type: Number, default: 4 },
    loanLimitMultiplier:         { type: Number, default: 3 },
    latePenaltyRate:             { type: Number, default: 15 },
    overdueFineAmount:           { type: Number, default: 1000 },
    earlyPaymentCharge:          { type: Number, default: 200 },
    partialPaymentFineAmount:    { type: Number, default: 0 },
    savingsInterestRate:         { type: Number, default: 10 },
    minimumSavingsMonth1:        { type: Number, default: 3000 },
    minimumSavingsMonthly:       { type: Number, default: 1000 },
    maximumSavingsFirst3Months:  { type: Number, default: 5000 },
    savingsShortfallFine:        { type: Number, default: 500 },
    profitSharingMethod:         { type: String, enum: ['proportional', 'equal'], default: 'proportional' },
    interestObligationAmount:    { type: Number, default: 0 },
  },

  features: {
    fines:          { type: Boolean, default: true },
    shareOut:        { type: Boolean, default: true },
    socialFund:      { type: Boolean, default: true },
    savingsInterest: { type: Boolean, default: true },
  },

  // Optional label overrides for the UI — falls back to the platform default term when absent.
  vocabulary: { type: Schema.Types.Mixed, default: {} },

  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('GroupTemplate', groupTemplateSchema);
