const jwt = require('jsonwebtoken');
const { getAuth } = require('@clerk/express');
const InviteToken = require('../models/InviteToken');
const GroupMember = require('../models/GroupMember');

const INVITE_SECRET = process.env.INVITE_JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://villagebanking.netlify.app';

exports.createInvite = async (req, res) => {
  const { name, phone, role } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const allowedRoles = ['member', 'treasurer', 'loan_officer'];
  const inviteRole = allowedRoles.includes(role) ? role : 'member';

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const payload = {
    groupId: req.groupId.toString(),
    role: inviteRole,
    invitedBy: req.memberId.toString(),
    name,
  };
  const token = jwt.sign(payload, INVITE_SECRET, { expiresIn: '48h' });

  await InviteToken.create({
    token,
    groupId: req.groupId,
    role: inviteRole,
    name,
    phone: phone || null,
    invitedBy: req.memberId,
    expiresAt,
  });

  const inviteLink = `${FRONTEND_URL}/invite?token=${token}`;
  res.status(201).json({ inviteLink, token, expiresAt });
};

exports.getInvites = async (req, res) => {
  const invites = await InviteToken.find({
    ...req.groupScope,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  res.json(invites);
};

exports.acceptInvite = async (req, res) => {
  const { token: inviteToken } = req.body;
  if (!inviteToken) return res.status(400).json({ error: 'token is required' });

  let payload;
  try {
    payload = jwt.verify(inviteToken, INVITE_SECRET);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid or expired invite token' });
  }

  const invite = await InviteToken.findOne({ token: inviteToken });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.usedAt) return res.status(400).json({ error: 'Invite has already been used' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite has expired' });

  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

  const existing = await GroupMember.findOne({
    clerkUserId,
    groupId: payload.groupId,
  });
  if (existing) return res.status(409).json({ error: 'Already a member of this group' });

  const member = await GroupMember.create({
    clerkUserId,
    groupId: payload.groupId,
    role: payload.role,
    name: payload.name,
    phone: invite.phone || null,
  });

  invite.usedAt = new Date();
  invite.usedBy = clerkUserId;
  await invite.save();

  res.status(201).json({
    member: { id: member._id, name: member.name, role: member.role, groupId: member.groupId },
  });
};
