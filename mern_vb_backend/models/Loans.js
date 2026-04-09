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
  archived: { type: Boolean, default: false }
});

module.exports = mongoose.model('Loan', loanSchema);