const mongoose = require('mongoose');

const groupMemberSchema = new mongoose.Schema({
  clerkUserId: {
    type: String,
    default: null,
    sparse: true,
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'treasurer', 'loan_officer', 'member'],
    default: 'member',
    required: true,
  },
  name: { type: String, required: true },
  phone: { type: String },
  email: { type: String },
  active: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null },
  isVerified: { type: Boolean, default: false },
}, { timestamps: true });

// A Clerk user can only be in a group once
groupMemberSchema.index({ clerkUserId: 1, groupId: 1 }, {
  unique: true,
  partialFilterExpression: { clerkUserId: { $ne: null } }
});

// Fast lookup by Clerk ID is covered by the compound index above

module.exports = mongoose.model('GroupMember', groupMemberSchema);
