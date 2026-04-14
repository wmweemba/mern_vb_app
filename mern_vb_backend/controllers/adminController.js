const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');

exports.listGroups = async (req, res) => {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  const groups = await Group.find({}).sort({ createdAt: -1 }).lean();

  const groupIds = groups.map(g => g._id);
  const memberCounts = await GroupMember.aggregate([
    { $match: { groupId: { $in: groupIds }, active: true } },
    { $group: { _id: '$groupId', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(memberCounts.map(m => [m._id.toString(), m.count]));

  const result = groups.map(g => ({
    _id: g._id,
    name: g.name,
    slug: g.slug,
    memberCount: countMap[g._id.toString()] || 0,
    trialExpiresAt: g.trialExpiresAt,
    isPaid: g.isPaid,
    trialActive: g.isPaid || (g.trialExpiresAt > new Date()),
    createdAt: g.createdAt,
  }));

  res.json(result);
};

exports.getGroup = async (req, res) => {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  const group = await Group.findById(req.params.groupId).lean();
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const members = await GroupMember.find({ groupId: group._id, active: true })
    .select('name role phone email createdAt')
    .lean();

  res.json({ ...group, members });
};
