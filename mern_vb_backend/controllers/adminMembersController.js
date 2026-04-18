const GroupMember = require('../models/GroupMember');
const { logAdminAction } = require('../utils/auditLog');

// GET /api/admin/groups/:groupId/members?includeDeleted=true|false
exports.listMembers = async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const filter = { groupId: req.params.groupId };
  if (!includeDeleted) filter.deletedAt = null;
  const members = await GroupMember.find(filter).sort({ createdAt: -1 });
  res.json(members);
};

// PATCH /api/admin/groups/:groupId/members/:memberId
exports.updateMember = async (req, res) => {
  const member = await GroupMember.findOne({ _id: req.params.memberId, groupId: req.params.groupId });
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const before = { name: member.name, role: member.role, phone: member.phone, email: member.email, active: member.active };

  const allowed = ['name', 'role', 'phone', 'email', 'active'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) member[key] = req.body[key];
  }
  await member.save();

  await logAdminAction({
    req, action: 'member.update', targetType: 'group_member', targetId: member._id, groupId: member.groupId,
    metadata: { before, after: { name: member.name, role: member.role, phone: member.phone, email: member.email, active: member.active } },
  });
  res.json(member);
};

// DELETE /api/admin/groups/:groupId/members/:memberId
exports.softDeleteMember = async (req, res) => {
  const { confirmation } = req.body;
  const member = await GroupMember.findOne({ _id: req.params.memberId, groupId: req.params.groupId });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (confirmation !== member.name) {
    return res.status(400).json({ error: 'Confirmation text does not match member name' });
  }
  member.deletedAt = new Date();
  member.active = false;
  await member.save();

  await logAdminAction({
    req, action: 'member.soft_delete', targetType: 'group_member', targetId: member._id, groupId: member.groupId,
    metadata: { memberName: member.name },
  });
  res.json({ message: 'Member removed', member });
};

// POST /api/admin/groups/:groupId/members/:memberId/restore
exports.restoreMember = async (req, res) => {
  const member = await GroupMember.findOne({ _id: req.params.memberId, groupId: req.params.groupId });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  member.deletedAt = null;
  member.active = true;
  await member.save();

  await logAdminAction({
    req, action: 'member.restore', targetType: 'group_member', targetId: member._id, groupId: member.groupId,
  });
  res.json(member);
};
