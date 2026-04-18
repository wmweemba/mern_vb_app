const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema({
  actorClerkUserId: { type: String, required: true },
  actorEmail: { type: String, required: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true, enum: ['group', 'group_member', 'group_settings', 'super_admin', 'billing'] },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ groupId: 1, createdAt: -1 });
adminAuditLogSchema.index({ actorClerkUserId: 1, createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
