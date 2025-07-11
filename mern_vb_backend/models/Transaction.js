const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['loan', 'saving', 'fine'], required: true },
    amount: { type: Number, required: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    note: { type: String },
    createdAt: { type: Date, default: Date.now }
  });
  
  module.exports = mongoose.model('Transaction', transactionSchema);