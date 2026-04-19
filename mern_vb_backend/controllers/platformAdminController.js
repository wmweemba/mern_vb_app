const { Resend } = require('resend');
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

// POST /api/admin/test-email?to=email@example.com
exports.testEmail = async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Chama360 <noreply@mynexusgroup.com>';
  const toAddress = req.query.to || req.superAdmin?.email;

  const config = {
    apiKeySet: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 8) + '...' : null,
    fromAddress,
    toAddress,
  };

  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY is not set', config });
  }
  if (!toAddress) {
    return res.status(400).json({ error: 'Provide ?to=email@example.com', config });
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: toAddress,
    subject: 'Chama360 — email delivery test',
    html: `<p>Test email from Chama360 backend. From: <strong>${fromAddress}</strong></p>`,
  });

  if (error) {
    return res.status(500).json({ error: error.message, resendError: error, config });
  }
  res.json({ success: true, emailId: data.id, config });
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
