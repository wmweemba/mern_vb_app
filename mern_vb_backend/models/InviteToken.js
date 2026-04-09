const mongoose = require('mongoose');

const inviteTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  role: {
    type: String,
    enum: ['admin', 'treasurer', 'loan_officer', 'member'],
    default: 'member',
  },
  name: { type: String, required: true },
  phone: { type: String },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember', required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  usedBy: { type: String, default: null },
}, { timestamps: true });

// Auto-delete expired unused tokens after 7 days
inviteTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('InviteToken', inviteTokenSchema);
