const { getAuth } = require('@clerk/express');
const GroupMember = require('../models/GroupMember');
const Group = require('../models/Group');
const SuperAdmin = require('../models/SuperAdmin');
const { getMemberLimitStatus } = require('../utils/planLimits');

exports.me = async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

    // Check super admin first
    const superAdmin = await SuperAdmin.findOne({ clerkUserId });
    if (superAdmin) {
      return res.json({
        _id: null,
        name: 'Super Admin',
        role: 'admin',
        groupId: null,
        email: superAdmin.email,
        isSuperAdmin: true,
        trialActive: true,
        isPaid: true,
      });
    }

    const member = await GroupMember.findOne({ clerkUserId, active: true });
    if (!member) {
      return res.status(403).json({ error: 'No group membership', code: 'NO_GROUP' });
    }

    const group = await Group.findById(member.groupId);
    const paidActive = group?.isPaid && (!group?.paidUntil || group.paidUntil > new Date());
    const trialActive = paidActive || (group?.trialExpiresAt > new Date());
    const limitStatus = group ? await getMemberLimitStatus(group) : null;

    res.json({
      _id: member._id,
      name: member.name,
      role: member.role,
      groupId: member.groupId,
      groupName: group?.name || null,
      phone: member.phone,
      email: member.email,
      trialActive,
      trialExpiresAt: group?.trialExpiresAt,
      isPaid: group?.isPaid || false,
      plan: limitStatus?.plan.name || null,
      memberCount: limitStatus?.activeCount ?? null,
      memberLimit: limitStatus?.plan.memberLimit ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch membership', details: err.message });
  }
};
