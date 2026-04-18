const AdminAuditLog = require('../models/AdminAuditLog');

async function logAdminAction({ req, action, targetType, targetId = null, groupId = null, metadata = {} }) {
  try {
    await AdminAuditLog.create({
      actorClerkUserId: req.superAdmin?.clerkUserId || req.auth?.userId,
      actorEmail: req.superAdmin?.email || 'unknown',
      action,
      targetType,
      targetId,
      groupId,
      metadata,
    });
  } catch (err) {
    console.error('[auditLog] failed to write entry:', err.message);
  }
}

module.exports = { logAdminAction };
