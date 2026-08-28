const mongoose = require('mongoose');

const pendingInviteSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  role: { type: String, enum: ['member', 'treasurer', 'loan_officer'], required: true },
  invitedBy: { type: String, required: true }, // clerkUserId of sender
  clerkInvitationId: { type: String },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
}, { timestamps: true });

// Prevent duplicate pending invites for same email+group
pendingInviteSchema.index({ email: 1, groupId: 1 }, { unique: true });

// Auto-delete expired invites, but not immediately — an expired invite stays
// visible (as "Expired") in the Pending Invites list for 30 days so an admin
// has a window to hit Resend before the record disappears for good.
pendingInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('PendingInvite', pendingInviteSchema);
