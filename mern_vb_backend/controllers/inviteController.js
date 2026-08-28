const jwt = require('jsonwebtoken');
const { getAuth, clerkClient } = require('@clerk/express');
const { Resend } = require('resend');
const InviteToken = require('../models/InviteToken');
const GroupMember = require('../models/GroupMember');
const Group = require('../models/Group');
const PendingInvite = require('../models/PendingInvite');
const { getMemberLimitStatus } = require('../utils/planLimits');

const INVITE_SECRET = process.env.INVITE_JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://chama360.nxhub.online';
const ROLE_LABELS = { member: 'Member', treasurer: 'Treasurer', loan_officer: 'Loan Officer' };

// Shared by inviteByEmail and resendInvite so both send the identical template.
// RESEND_FROM_EMAIL must be a verified sender in your Resend account.
// onboarding@resend.dev only delivers to the Resend account owner — unusable for production.
async function sendInviteEmail({ to, name, groupName, role, inviteUrl }) {
  if (!process.env.RESEND_API_KEY) {
    return { skipped: true };
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Chama360 <noreply@mynexusgroup.com>';
  const roleLabel = ROLE_LABELS[role] || role;
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: fromAddress,
    to,
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
          <a href="${inviteUrl}" style="display: block; background: #C8501A; color: white; text-align: center; padding: 14px 24px; border-radius: 9999px; font-weight: 600; font-size: 15px; text-decoration: none; margin-bottom: 24px;">
            Activate Your Account
          </a>
          <p style="color: #A09990; font-size: 12px; margin: 0;">
            Use this email address (${to}) — whether you're creating an account for the first time
            or already have one — so you're automatically added to ${groupName}.
            This invite expires in 7 days.
          </p>
        </div>
      </div>
    `,
  });

  return { error };
}

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

  // Email-bound invites (sent via inviteByEmail) must be accepted by the same
  // email address they were sent to — otherwise anyone who gets hold of the
  // link could join under a different identity.
  if (invite.email) {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const acceptingEmail = clerkUser.emailAddresses
      ?.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress
      ?.toLowerCase().trim();
    if (acceptingEmail !== invite.email) {
      return res.status(403).json({
        error: `This invite was sent to ${invite.email}. Please sign in with that email address to accept it.`,
      });
    }
  }

  const existing = await GroupMember.findOne({
    clerkUserId,
    groupId: payload.groupId,
  });
  if (existing) return res.status(409).json({ error: 'Already a member of this group' });

  const group = await Group.findById(payload.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const { plan, atLimit } = await getMemberLimitStatus(group);
  if (atLimit) {
    return res.status(403).json({
      error: 'member_limit_reached',
      message: `Your ${plan.name} plan allows up to ${plan.memberLimit} members. Remove a member or upgrade to add more.`,
    });
  }

  // If this is an email-bound invite re-inviting a legacy unverified member
  // (a profile Simon/the treasurer created ahead of the member signing up),
  // link the Clerk account to that existing record instead of creating a
  // duplicate — same pattern as the Clerk-webhook path in webhookRoutes.js.
  let member;
  const legacy = invite.email
    ? await GroupMember.findOne({ groupId: payload.groupId, email: invite.email, isVerified: false })
    : null;

  if (legacy) {
    legacy.clerkUserId = clerkUserId;
    legacy.isVerified = true;
    legacy.role = payload.role;
    if (payload.name) legacy.name = payload.name;
    await legacy.save();
    member = legacy;
  } else {
    member = await GroupMember.create({
      clerkUserId,
      groupId: payload.groupId,
      role: payload.role,
      name: payload.name,
      phone: invite.phone || null,
      email: invite.email || null,
      isVerified: true,
    });
  }

  invite.usedAt = new Date();
  invite.usedBy = clerkUserId;
  await invite.save();

  if (invite.email) {
    await PendingInvite.deleteOne({ email: invite.email, groupId: payload.groupId });
  }

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

    const normalizedEmail = email.toLowerCase().trim();

    // Check no existing pending invite for this email+group
    const existingInvite = await PendingInvite.findOne({
      email: normalizedEmail,
      groupId: req.groupId,
    });
    if (existingInvite) {
      return res.status(409).json({
        error: 'An invite is already pending for this email. Use Resend on the Pending Invites list to send it again.',
      });
    }

    // Check email is not already a GroupMember of this group
    const existingMember = await GroupMember.findOne({
      email: normalizedEmail,
      groupId: req.groupId,
    });
    if (existingMember && existingMember.isVerified) {
      return res.status(409).json({ error: 'This member already has an active account.' });
    }
    // If existingMember exists but isVerified is false, this is a re-invite of a
    // legacy member — proceed. The webhook handler links the Clerk signup back to
    // this existing record on user.created.

    // Look up group name for the email
    const group = await Group.findById(req.groupId);
    const groupName = group?.name || 'your group';

    if (group) {
      const { plan, atLimit } = await getMemberLimitStatus(group);
      if (atLimit) {
        return res.status(403).json({
          error: 'member_limit_reached',
          message: `Your ${plan.name} plan allows up to ${plan.memberLimit} members. Remove a member or upgrade to add more.`,
        });
      }
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://chama360.nxhub.online';

    // Store PendingInvite first (kept for the Clerk-webhook fallback path and
    // for the "pending invites" list in the UI).
    const { userId: clerkUserId } = getAuth(req);
    await PendingInvite.create({
      email: normalizedEmail,
      groupId: req.groupId,
      role: inviteRole,
      invitedBy: clerkUserId,
      name,
    });

    // Also mint an email-bound InviteToken and route the emailed CTA through
    // the same /invite?token= flow already used for shared (WhatsApp-style)
    // invite links — it offers BOTH "sign up" and "sign in" and completes the
    // join immediately via /invites/accept, instead of dropping straight onto
    // /sign-up. A member who (re-invited, or invited under an email they'd
    // already used elsewhere) already has a Clerk account was landing on the
    // sign-up screen with no way to sign in instead.
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitePayload = {
      groupId: req.groupId.toString(),
      role: inviteRole,
      invitedBy: req.memberId.toString(),
      name,
    };
    const inviteToken = jwt.sign(invitePayload, INVITE_SECRET, { expiresIn: '7d' });
    await InviteToken.create({
      token: inviteToken,
      groupId: req.groupId,
      role: inviteRole,
      name,
      email: normalizedEmail,
      invitedBy: req.memberId,
      expiresAt: inviteExpiresAt,
    });
    const inviteUrl = `${frontendUrl}/invite?token=${inviteToken}`;

    // If a legacy unverified member exists with a different name, align the name
    // on the existing record so the re-invite doesn't create a mismatch.
    if (existingMember && !existingMember.isVerified && name && existingMember.name !== name) {
      existingMember.name = name;
      await existingMember.save();
    }

    const { skipped, error: resendError } = await sendInviteEmail({
      to: normalizedEmail,
      name,
      groupName,
      role: inviteRole,
      inviteUrl,
    });

    if (skipped) {
      return res.status(201).json({
        message: `Invite saved but email not sent — RESEND_API_KEY is not configured.`,
        warning: 'RESEND_API_KEY missing',
        signUpUrl: inviteUrl,
      });
    }

    if (resendError) {
      // Invite is already saved — return 201 but flag the email failure so the
      // frontend can show a copy-link fallback instead of a generic error.
      return res.status(201).json({
        message: `Invite saved but email delivery failed: ${resendError.message}`,
        warning: resendError.message,
        signUpUrl: inviteUrl,
      });
    }

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
    // No expiresAt filter: an expired invite stays visible (frontend flags it
    // as "Expired") until Resend is used or the 30-day grace TTL purges it —
    // otherwise there'd be nothing left for an admin to click Resend on.
    const invites = await PendingInvite.find({ groupId: req.groupId }).sort({ createdAt: -1 });
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending invites', details: err.message });
  }
};

exports.resendInvite = async (req, res) => {
  try {
    if (req.role === 'member') {
      return res.status(403).json({ error: 'Members cannot resend invites' });
    }

    const invite = await PendingInvite.findOne({ _id: req.params.id, groupId: req.groupId });
    if (!invite) return res.status(404).json({ error: 'Pending invite not found' });

    // Keep the original clock unless it has already run out — an expired
    // invite gets a fresh 7 days starting now, everything else is untouched.
    const wasExpired = invite.expiresAt <= new Date();
    if (wasExpired) {
      invite.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await invite.save();
    }

    const group = await Group.findById(req.groupId);
    const groupName = group?.name || 'your group';

    // Retire any unused token(s) from the previous send(s) so there's only
    // ever one live link for this invite at a time.
    await InviteToken.deleteMany({ groupId: req.groupId, email: invite.email, usedAt: null });

    const frontendUrl = process.env.FRONTEND_URL || 'https://chama360.nxhub.online';
    const invitePayload = {
      groupId: req.groupId.toString(),
      role: invite.role,
      invitedBy: req.memberId.toString(),
      name: invite.name,
    };
    const inviteToken = jwt.sign(invitePayload, INVITE_SECRET, {
      expiresIn: Math.max(1, Math.round((invite.expiresAt.getTime() - Date.now()) / 1000)),
    });
    await InviteToken.create({
      token: inviteToken,
      groupId: req.groupId,
      role: invite.role,
      name: invite.name,
      email: invite.email,
      invitedBy: req.memberId,
      expiresAt: invite.expiresAt,
    });
    const inviteUrl = `${frontendUrl}/invite?token=${inviteToken}`;

    const { skipped, error: resendError } = await sendInviteEmail({
      to: invite.email,
      name: invite.name,
      groupName,
      role: invite.role,
      inviteUrl,
    });

    if (skipped) {
      return res.status(200).json({
        message: 'Invite refreshed but email not sent — RESEND_API_KEY is not configured.',
        warning: 'RESEND_API_KEY missing',
        signUpUrl: inviteUrl,
      });
    }

    if (resendError) {
      return res.status(200).json({
        message: `Invite refreshed but email delivery failed: ${resendError.message}`,
        warning: resendError.message,
        signUpUrl: inviteUrl,
      });
    }

    res.status(200).json({ message: `Invite resent to ${invite.email}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resend invite', details: err.message });
  }
};

exports.cancelInvite = async (req, res) => {
  try {
    if (req.role === 'member') {
      return res.status(403).json({ error: 'Members cannot cancel invites' });
    }

    const invite = await PendingInvite.findOne({ _id: req.params.id, groupId: req.groupId });
    if (!invite) return res.status(404).json({ error: 'Pending invite not found' });

    await InviteToken.deleteMany({ groupId: req.groupId, email: invite.email, usedAt: null });
    await PendingInvite.deleteOne({ _id: invite._id });

    res.status(200).json({ message: `Invite to ${invite.email} cancelled` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel invite', details: err.message });
  }
};
