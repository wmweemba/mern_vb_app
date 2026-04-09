const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  clerkAdminId: { type: String },
  trialExpiresAt: { type: Date, required: true },
  isPaid: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
