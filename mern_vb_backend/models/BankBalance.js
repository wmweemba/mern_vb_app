const mongoose = require('mongoose');

const bankBalanceSchema = new mongoose.Schema({
  balance: { type: Number, required: true, default: 0 },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
});

bankBalanceSchema.index({ groupId: 1 }, { unique: true });

module.exports = mongoose.model('BankBalance', bankBalanceSchema); 