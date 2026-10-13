const mongoose = require('mongoose');
const Group = require('../models/Group');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { logAdminAction } = require('../utils/auditLog');
const PLANS = require('../config/plans');
const { extendGroupSubscription } = require('../utils/subscription');
const { maskMsisdn } = require('../utils/msisdn');

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

// GET /api/admin/groups/:groupId/billing/payments
// Read-only. Every Lipila subscription-payment attempt for this group, all
// statuses, newest first. Records outlive a soft-deleted group (§4.2
// retainOnGroupDelete), so this queries SubscriptionPayment by groupId only —
// it never re-checks Group.findById for existence/soft-delete state.
exports.listPayments = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const payments = await SubscriptionPayment.find({ groupId: req.params.groupId })
      .sort({ createdAt: -1 })
      .lean();

    const data = payments.map((p) => ({
      id: p._id,
      createdAt: p.createdAt,
      completedAt: p.completedAt || null,
      plan: p.plan,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      failureReason: p.failureReason || null,
      maskedMsisdn: maskMsisdn(p.msisdn),
      providerExternalId: p.providerExternalId || null,
      isTestAmount: !!p.isTestAmount,
      amountMismatch: !!p.amountMismatch,
      wasLateSuccess: !!p.wasLateSuccess,
      initiatedByName: p.initiatedByName || null,
      paidUntilAfter: p.paidUntilAfter || null,
    }));

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load payments', details: err.message });
  }
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
