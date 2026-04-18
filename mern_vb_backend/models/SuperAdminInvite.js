const mongoose = require('mongoose');

const superAdminInviteSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  invitedBy: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  usedBy: { type: String, default: null },
}, { timestamps: true });

superAdminInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('SuperAdminInvite', superAdminInviteSchema);
