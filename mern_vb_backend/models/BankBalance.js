const mongoose = require('mongoose');

const bankBalanceSchema = new mongoose.Schema({
  balance: { type: Number, required: true, default: 0 }
});

module.exports = mongoose.model('BankBalance', bankBalanceSchema); 