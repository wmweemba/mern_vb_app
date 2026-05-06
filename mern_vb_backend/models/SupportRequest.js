const mongoose = require('mongoose');

const CATEGORIES = ['error', 'question', 'feature_request', 'billing', 'other'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

const supportRequestSchema = new mongoose.Schema({
  // Who
  clerkUserId: { type: String, required: true },
  groupMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember', default: null },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  role: { type: String, default: null },
  groupName: { type: String, default: null },

  // What
  category: { type: String, enum: CATEGORIES, required: true },
  description: { type: String, required: true, trim: true, maxlength: 4000 },

  // Context auto-captured by client + server
  pagePath: { type: String, default: null },
  userAgent: { type: String, default: null },

  // Lifecycle
  status: { type: String, enum: STATUSES, default: 'open', index: true },
  resolutionNote: { type: String, default: null, maxlength: 2000 },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: null },

  // Notification audit
  notifiedTelegramAt: { type: Date, default: null },
  notifiedEmailAt: { type: Date, default: null },
  notifyError: { type: String, default: null },
}, { timestamps: true });

supportRequestSchema.index({ createdAt: -1 });
supportRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SupportRequest', supportRequestSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUSES = STATUSES;
