const mongoose = require('mongoose');

const fineSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  amount: { type: Number, required: true },
  note: { type: String },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  issuedAt: { type: Date, default: Date.now },
  paid: { type: Boolean, default: false },
  paidAt: { type: Date },
  paymentTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
});

module.exports = mongoose.model('Fine', fineSchema); 