const mongoose = require('mongoose');

const superAdminSchema = new mongoose.Schema({
  clerkUserId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  name: { type: String, default: null },
  invitedBy: { type: String, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('SuperAdmin', superAdminSchema);
