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
  //
  // Revolving Payment Corrections (docs/build/revolving-payment-corrections/plan.md):
  // 'interest_charge' is an in-month interest entry raised inside applyPayment when a
  // payment allocates more to interest than is currently outstanding (before Month-End
  // accrual has run) and the caller opts in via ctx.chargeInterestShortfall. Reversal
  // entries are appended, never edited in place or deleted — reversalOf links a
  // negated entry back to the original it undoes; reversedAt/reversedBy/reverseReason
  // are stamped onto the original being reversed. amount stays required with no min
  // because a reversal entry's amount is negative.
  accrualMode: { type: String, enum: ['scheduled', 'revolving'], default: 'scheduled' },
  principalBalance: { type: Number },
  interestOutstanding: { type: Number, default: 0 },
  entries: [{
    date: { type: Date, default: Date.now },
    periodLabel: String, // e.g. '2026-07' — set on accrual/capitalisation entries only
    type: {
      type: String,
      enum: [
        'disbursement', 'accrual', 'capitalisation', 'interest_payment', 'principal_payment',
        'interest_charge',
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    principalAfter: Number,
    interestAfter: Number,
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember' },
    reversalOf: { type: mongoose.Schema.Types.ObjectId }, // original entry's _id, when this entry negates it
    reversedAt: Date, // stamped on the original entry once it has been reversed
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember' },
    reverseReason: String,
  }],
});

module.exports = mongoose.model('Loan', loanSchema);