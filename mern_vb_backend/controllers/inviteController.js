const jwt = require('jsonwebtoken');
const { getAuth } = require('@clerk/express');
const InviteToken = require('../models/InviteToken');
const GroupMember = require('../models/GroupMember');
const PendingInvite = require('../models/PendingInvite');

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

exports.inviteByEmail = async (req, res) => {
  try {
    const { email, name, role } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'email and name are required' });
    }

    const allowedRoles = ['member', 'treasurer', 'loan_officer'];
    const inviteRole = allowedRoles.includes(role) ? role : 'member';

    // Only admin, treasurer, loan_officer can invite
    if (req.role === 'member') {
      return res.status(403).json({ error: 'Members cannot send invites' });
    }

    // Check no existing pending invite for this email+group
    const existingInvite = await PendingInvite.findOne({
      email: email.toLowerCase().trim(),
      groupId: req.groupId,
    });
    if (existingInvite) {
      return res.status(409).json({ error: 'An invite is already pending for this email' });
    }

    // Check email is not already a GroupMember of this group
    const existingMember = await GroupMember.findOne({
      email: email.toLowerCase().trim(),
      groupId: req.groupId,
    });
    if (existingMember) {
      return res.status(409).json({ error: 'This email is already a member of your group' });
    }

    // Call Clerk Invitation API
    const frontendUrl = process.env.FRONTEND_URL || 'https://villagebanking.netlify.app';
    const clerkResponse = await fetch('https://api.clerk.com/v1/invitations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_address: email.toLowerCase().trim(),
        redirect_url: `${frontendUrl}/sign-up`,
        public_metadata: {
          groupId: req.groupId.toString(),
          role: inviteRole,
          name,
        },
      }),
    });

    if (!clerkResponse.ok) {
      const errData = await clerkResponse.json();
      return res.status(400).json({
        error: 'Failed to send Clerk invitation',
        details: errData.errors?.[0]?.message || 'Unknown Clerk error',
      });
    }

    const clerkData = await clerkResponse.json();

    const { userId: clerkUserId } = getAuth(req);
    await PendingInvite.create({
      email: email.toLowerCase().trim(),
      groupId: req.groupId,
      role: inviteRole,
      invitedBy: clerkUserId,
      name,
      clerkInvitationId: clerkData.id,
    });

    res.status(201).json({ message: `Invite sent to ${email}` });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An invite is already pending for this email' });
    }
    res.status(500).json({ error: 'Failed to send invite', details: err.message });
  }
};

exports.getPendingInvites = async (req, res) => {
  try {
    const invites = await PendingInvite.find({
      groupId: req.groupId,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending invites', details: err.message });
  }
};
