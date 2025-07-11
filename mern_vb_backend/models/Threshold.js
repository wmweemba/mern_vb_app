// models/Threshold.js
const mongoose = require('mongoose');

const thresholdSchema = new mongoose.Schema({
  cycle: { type: String, required: true },                 // e.g., "2025-H2"
  startMonth: { type: String, required: true },            // "January" or "July"
  totalBankBalance: { type: Number, required: true },
  retainedAmount: { type: Number, required: true },
  prepaidInterest: { type: Number, required: true },
  totalMembers: { type: Number, required: true },
  thresholdPerMember: { type: Number, required: true },    // auto-calculated
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Threshold', thresholdSchema);
