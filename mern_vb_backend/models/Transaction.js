const mongoose = require('mongoose');
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['loan', 'saving', 'fine', 'payment', 'loan_payment', 'cycle_reset'], required: true },
    amount: { type: Number, required: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    note: { type: String },
    cycleNumber: { type: Number },
    cycleEndDate: { type: Date },
    archived: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  });
  
  module.exports = mongoose.model('Transaction', transactionSchema);