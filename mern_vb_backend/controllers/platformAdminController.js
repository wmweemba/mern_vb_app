const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const AdminAuditLog = require('../models/AdminAuditLog');

// GET /api/admin/overview
exports.overview = async (req, res) => {
  const now = new Date();
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [totalGroups, paidGroups, trialGroups, expiringThisWeek, totalMembers] = await Promise.all([
    Group.countDocuments({ deletedAt: null }),
    Group.countDocuments({ deletedAt: null, isPaid: true, $or: [{ paidUntil: null }, { paidUntil: { $gt: now } }] }),
    Group.countDocuments({ deletedAt: null, $or: [{ isPaid: false }, { paidUntil: { $lte: now } }], trialExpiresAt: { $gt: now } }),
    Group.countDocuments({ deletedAt: null, trialExpiresAt: { $gt: now, $lte: weekFromNow }, isPaid: { $ne: true } }),
    GroupMember.countDocuments({ deletedAt: null, active: true }),
  ]);

  const starterPrice = 150;
  const mrrEstimate = paidGroups * starterPrice;

  res.json({
    totalGroups, paidGroups, trialGroups, expiringThisWeek, totalMembers, mrrEstimate, currency: 'ZMW',
  });
};

// GET /api/admin/audit-log?groupId=&actor=&limit=50&page=1
exports.auditLog = async (req, res) => {
  const { groupId, actor, limit = 50, page = 1 } = req.query;
  const filter = {};
  if (groupId) filter.groupId = groupId;
  if (actor) filter.actorClerkUserId = actor;

  const logs = await AdminAuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));
  const total = await AdminAuditLog.countDocuments(filter);
  res.json({ logs, total, page: Number(page), limit: Number(limit) });
};
