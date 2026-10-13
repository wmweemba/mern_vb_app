const mongoose = require('mongoose');
const Group = require('../models/Group');
const { logAdminAction } = require('../utils/auditLog');
const PLANS = require('../config/plans');
const { extendGroupSubscription } = require('../utils/subscription');

// GET /api/admin/billing/plans
exports.listPlans = (req, res) => res.json(PLANS);

// POST /api/admin/groups/:groupId/billing/activate
exports.activate = async (req, res) => {
  const { plan, durationMonths, customPaidUntil } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!customPaidUntil && (!durationMonths || durationMonths < 1)) {
    return res.status(400).json({ error: 'durationMonths must be >= 1 unless customPaidUntil is provided' });
  }
  if (customPaidUntil && Number.isNaN(new Date(customPaidUntil).getTime())) {
    return res.status(400).json({ error: 'Invalid customPaidUntil' });
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await extendGroupSubscription(session, { groupId: req.params.groupId, plan, durationMonths, customPaidUntil });
    });
  } finally {
    session.endSession();
  }
  if (!result) return res.status(404).json({ error: 'Group not found' });

  await logAdminAction({
    req, action: 'billing.activate', targetType: 'billing', targetId: result.group._id, groupId: result.group._id,
    metadata: { plan, durationMonths, customPaidUntil, before: result.before, after: { isPaid: true, paidUntil: result.paidUntil } },
  });
  res.json({ group: result.group, plan, paidUntil: result.paidUntil });
};

// POST /api/admin/groups/:groupId/billing/mark-unpaid
exports.markUnpaid = async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const before = { isPaid: group.isPaid, paidUntil: group.paidUntil };
  group.isPaid = false;
  group.paidUntil = null;
  await group.save();

  await logAdminAction({
    req, action: 'billing.mark_unpaid', targetType: 'billing', targetId: group._id, groupId: group._id,
    metadata: { before },
  });
  res.json(group);
};
