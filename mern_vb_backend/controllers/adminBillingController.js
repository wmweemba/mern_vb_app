const Group = require('../models/Group');
const { logAdminAction } = require('../utils/auditLog');

const PLANS = {
  Starter: { price: 150, currency: 'ZMW' },
  Standard: { price: 250, currency: 'ZMW' },
};

// GET /api/admin/billing/plans
exports.listPlans = (req, res) => res.json(PLANS);

// POST /api/admin/groups/:groupId/billing/activate
exports.activate = async (req, res) => {
  const { plan, durationMonths, customPaidUntil } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!customPaidUntil && (!durationMonths || durationMonths < 1)) {
    return res.status(400).json({ error: 'durationMonths must be >= 1 unless customPaidUntil is provided' });
  }

  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const before = { isPaid: group.isPaid, paidUntil: group.paidUntil, trialExpiresAt: group.trialExpiresAt };

  let newPaidUntil;
  if (customPaidUntil) {
    newPaidUntil = new Date(customPaidUntil);
    if (Number.isNaN(newPaidUntil.getTime())) return res.status(400).json({ error: 'Invalid customPaidUntil' });
  } else {
    const now = new Date();
    const base = (group.paidUntil && group.paidUntil > now) ? new Date(group.paidUntil) : new Date(now);
    base.setMonth(base.getMonth() + durationMonths);
    newPaidUntil = base;
  }

  group.isPaid = true;
  group.paidUntil = newPaidUntil;
  group.trialExpiresAt = new Date('2099-12-31');
  await group.save();

  await logAdminAction({
    req, action: 'billing.activate', targetType: 'billing', targetId: group._id, groupId: group._id,
    metadata: { plan, durationMonths, customPaidUntil, before, after: { isPaid: group.isPaid, paidUntil: group.paidUntil } },
  });
  res.json({ group, plan, paidUntil: newPaidUntil });
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
