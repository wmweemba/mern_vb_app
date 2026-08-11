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

  // Two-way thread. The original ticket description (above) is not duplicated
  // in here — this holds only the back-and-forth after creation.
  messages: [{
    authorType: { type: String, enum: ['user', 'admin'], required: true },
    authorId: { type: String, required: true }, // clerkUserId of the author
    authorName: { type: String, required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    createdAt: { type: Date, default: Date.now },
  }],
  // Set to now() whenever the ticket's own user views the thread. An admin
  // message with createdAt after this is what "unread" means — derived, not stored.
  userLastViewedAt: { type: Date, default: null },

  // Lifecycle
  status: { type: String, enum: STATUSES, default: 'open', index: true },
  // Deprecated 2026-08-11 — replaced by messages[]. Retained for historical
  // reads only; do not write new values here. See docs/plan_configurable_group_rules.md Phase 0.5.
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
