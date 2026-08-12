const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember', required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  amount: { type: Number, required: true },
  durationMonths: { type: Number, required: true },
  interestRate: { type: Number, required: true },
  interestMethod: { type: String, enum: ['reducing', 'flat'], default: 'reducing' },
  installments: [{
    month: Number,
    principal: Number,
    interest: Number,
    total: Number,
    paidAmount: { type: Number, default: 0 },
    paid: { type: Boolean, default: false },
    paymentDate: Date,
    penalties: {
      lateInterest: { type: Number, default: 0 },
      overdueFine: { type: Number, default: 0 },
      earlyPaymentCharge: { type: Number, default: 0 }
    }
  }],
  createdAt: { type: Date, default: Date.now },
  fullyPaid: { type: Boolean, default: false },
  cycleNumber: { type: Number },
  cycleEndDate: { type: Date },
  archived: { type: Boolean, default: false },

  // Revolving accrual (docs/plan_configurable_group_rules.md Phase 2). All optional —
  // scheduled loans (the default) never populate these; installments[] stays their
  // single source of truth.
  accrualMode: { type: String, enum: ['scheduled', 'revolving'], default: 'scheduled' },
  principalBalance: { type: Number },
  interestOutstanding: { type: Number, default: 0 },
  entries: [{
    date: { type: Date, default: Date.now },
    periodLabel: String, // e.g. '2026-07' — set on accrual/capitalisation entries only
    type: {
      type: String,
      enum: ['disbursement', 'accrual', 'capitalisation', 'interest_payment', 'principal_payment'],
      required: true,
    },
    amount: { type: Number, required: true },
    principalAfter: Number,
    interestAfter: Number,
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember' },
  }],
});

module.exports = mongoose.model('Loan', loanSchema);