const jwt = require('jsonwebtoken');
const { getAuth } = require('@clerk/express');
const { Resend } = require('resend');
const InviteToken = require('../models/InviteToken');
const GroupMember = require('../models/GroupMember');
const Group = require('../models/Group');
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

    // Look up group name for the email
    const group = await Group.findById(req.groupId);
    const groupName = group?.name || 'your group';

    const frontendUrl = process.env.FRONTEND_URL || 'https://villagebanking.netlify.app';
    const signUpUrl = `${frontendUrl}/sign-up`;
    const roleLabel = { member: 'Member', treasurer: 'Treasurer', loan_officer: 'Loan Officer' }[inviteRole] || inviteRole;

    // Store PendingInvite first
    const { userId: clerkUserId } = getAuth(req);
    await PendingInvite.create({
      email: email.toLowerCase().trim(),
      groupId: req.groupId,
      role: inviteRole,
      invitedBy: clerkUserId,
      name,
    });

    // Send invite email via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Chama360 <onboarding@resend.dev>',
      to: email.toLowerCase().trim(),
      subject: `You've been invited to join ${groupName} on Chama360`,
      html: `
        <div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #F0EDE8;">
          <div style="background: #FFFFFF; border-radius: 16px; padding: 32px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="width: 48px; height: 48px; background: #C8501A; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
                <span style="color: white; font-weight: 700; font-size: 18px;">C</span>
              </div>
              <h1 style="color: #C8501A; font-size: 20px; font-weight: 700; margin: 12px 0 4px;">Chama360</h1>
            </div>
            <h2 style="color: #1C1510; font-size: 22px; font-weight: 700; margin: 0 0 8px;">You've been invited!</h2>
            <p style="color: #6B6560; font-size: 15px; margin: 0 0 24px;">
              Hi ${name}, you have been invited to join <strong style="color: #1C1510;">${groupName}</strong>
              on Chama360 as a <strong style="color: #1C1510;">${roleLabel}</strong>.
            </p>
            <a href="${signUpUrl}" style="display: block; background: #C8501A; color: white; text-align: center; padding: 14px 24px; border-radius: 9999px; font-weight: 600; font-size: 15px; text-decoration: none; margin-bottom: 24px;">
              Create Your Account
            </a>
            <p style="color: #A09990; font-size: 12px; margin: 0;">
              Sign up using this email address (${email}) so you are automatically added to ${groupName}.
              This invite expires in 7 days.
            </p>
          </div>
        </div>
      `,
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
