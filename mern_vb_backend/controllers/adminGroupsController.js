const mongoose = require('mongoose');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupSettings = require('../models/GroupSettings');
const BankBalance = require('../models/BankBalance');
const { logAdminAction } = require('../utils/auditLog');

// GET /api/admin/groups?includeDeleted=true|false
exports.listGroups = async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const filter = includeDeleted ? {} : { deletedAt: null };

  const groups = await Group.find(filter).sort({ createdAt: -1 }).lean();
  const groupIds = groups.map(g => g._id);
  const counts = await GroupMember.aggregate([
    { $match: { groupId: { $in: groupIds }, active: true, deletedAt: null } },
    { $group: { _id: '$groupId', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map(m => [m._id.toString(), m.count]));

  const now = new Date();
  const result = groups.map(g => {
    let status = 'trial_active';
    if (g.deletedAt) status = 'deleted';
    else if (g.suspendedAt) status = 'suspended';
    else if (g.isPaid && (!g.paidUntil || g.paidUntil > now)) status = 'paid';
    else if (g.trialExpiresAt && g.trialExpiresAt < now) status = 'expired';
    return {
      _id: g._id,
      name: g.name,
      slug: g.slug,
      memberCount: countMap[g._id.toString()] || 0,
      trialExpiresAt: g.trialExpiresAt,
      isPaid: g.isPaid,
      paidUntil: g.paidUntil,
      suspendedAt: g.suspendedAt,
      deletedAt: g.deletedAt,
      status,
      createdAt: g.createdAt,
    };
  });
  res.json(result);
};

// GET /api/admin/groups/:groupId
exports.getGroup = async (req, res) => {
  const group = await Group.findById(req.params.groupId).lean();
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const [members, settings, bankBalance] = await Promise.all([
    GroupMember.find({ groupId: group._id }).select('name role phone email active deletedAt createdAt clerkUserId').lean(),
    GroupSettings.findOne({ groupId: group._id }).lean(),
    BankBalance.findOne({ groupId: group._id }).lean(),
  ]);

  res.json({ ...group, members, settings, bankBalance });
};

// PATCH /api/admin/groups/:groupId
exports.updateGroup = async (req, res) => {
  const { name, slug, clerkAdminId } = req.body;
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const before = { name: group.name, slug: group.slug, clerkAdminId: group.clerkAdminId };

  if (name) group.name = name;
  if (slug) group.slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (clerkAdminId !== undefined) group.clerkAdminId = clerkAdminId;

  try {
    await group.save();
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug already taken' });
    throw err;
  }

  await logAdminAction({
    req, action: 'group.update', targetType: 'group', targetId: group._id, groupId: group._id,
    metadata: { before, after: { name: group.name, slug: group.slug, clerkAdminId: group.clerkAdminId } },
  });
  res.json(group);
};

// POST /api/admin/groups
exports.createGroup = async (req, res) => {
  const { name, slug: rawSlug, clerkAdminId, adminName, adminEmail, trialDays } = req.body;
  if (!name || !adminName) return res.status(400).json({ error: 'name and adminName are required' });

  const slug = (rawSlug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const trialExpiresAt = new Date(Date.now() + (trialDays || 15) * 24 * 60 * 60 * 1000);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existing = await Group.findOne({ slug }).session(session);
      if (existing) throw Object.assign(new Error('Slug already taken'), { status: 409 });

      const [group] = await Group.create([{ name, slug, clerkAdminId: clerkAdminId || null, trialExpiresAt }], { session });

      await GroupMember.create([{
        clerkUserId: clerkAdminId || null, groupId: group._id, role: 'admin',
        name: adminName, email: adminEmail || null,
      }], { session });

      await GroupSettings.create([{
        groupId: group._id, groupName: name,
        cycleLengthMonths: 6, interestRate: 10, interestMethod: 'reducing',
        defaultLoanDuration: 4, loanLimitMultiplier: 3,
        latePenaltyRate: 15, overdueFineAmount: 1000, earlyPaymentCharge: 200,
        savingsInterestRate: 10, minimumSavingsMonth1: 3000, minimumSavingsMonthly: 1000,
        maximumSavingsFirst3Months: 5000, savingsShortfallFine: 500,
        profitSharingMethod: 'proportional', lateFineType: 'fixed',
      }], { session });

      await BankBalance.create([{ balance: 0, groupId: group._id }], { session });

      result = group;
    });

    await logAdminAction({
      req, action: 'group.create', targetType: 'group', targetId: result._id, groupId: result._id,
      metadata: { name, slug, clerkAdminId, trialDays },
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

// POST /api/admin/groups/:groupId/suspend
exports.suspendGroup = async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  group.suspendedAt = new Date();
  group.suspendedReason = req.body.reason || null;
  await group.save();

  await logAdminAction({
    req, action: 'group.suspend', targetType: 'group', targetId: group._id, groupId: group._id,
    metadata: { reason: group.suspendedReason },
  });
  res.json(group);
};

// POST /api/admin/groups/:groupId/unsuspend
exports.unsuspendGroup = async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  group.suspendedAt = null;
  group.suspendedReason = null;
  await group.save();

  await logAdminAction({
    req, action: 'group.unsuspend', targetType: 'group', targetId: group._id, groupId: group._id,
  });
  res.json(group);
};

// DELETE /api/admin/groups/:groupId
exports.softDeleteGroup = async (req, res) => {
  const { confirmation } = req.body;
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (confirmation !== group.name) {
    return res.status(400).json({ error: 'Confirmation text does not match group name' });
  }

  group.deletedAt = new Date();
  await group.save();

  await logAdminAction({
    req, action: 'group.soft_delete', targetType: 'group', targetId: group._id, groupId: group._id,
    metadata: { groupName: group.name, memberCount: await GroupMember.countDocuments({ groupId: group._id }) },
  });
  res.json({ message: 'Group soft-deleted', group });
};

// POST /api/admin/groups/:groupId/restore
exports.restoreGroup = async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  group.deletedAt = null;
  await group.save();

  await logAdminAction({
    req, action: 'group.restore', targetType: 'group', targetId: group._id, groupId: group._id,
  });
  res.json(group);
};
