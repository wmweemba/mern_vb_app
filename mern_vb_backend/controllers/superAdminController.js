const crypto = require('crypto');
const { Resend } = require('resend');
const SuperAdmin = require('../models/SuperAdmin');
const SuperAdminInvite = require('../models/SuperAdminInvite');
const { logAdminAction } = require('../utils/auditLog');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://chama360.nxhub.online';

// GET /api/admin/super-admins
exports.list = async (req, res) => {
  const admins = await SuperAdmin.find({ revokedAt: null }).sort({ createdAt: -1 });
  const pending = await SuperAdminInvite.find({ usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  res.json({ admins, pendingInvites: pending });
};

// POST /api/admin/super-admins/invite
exports.invite = async (req, res) => {
  const { email: rawEmail } = req.body;
  if (!rawEmail) return res.status(400).json({ error: 'email is required' });
  const email = rawEmail.toLowerCase().trim();

  const existing = await SuperAdmin.findOne({ email, revokedAt: null });
  if (existing) return res.status(409).json({ error: 'This email is already a super admin' });

  const pending = await SuperAdminInvite.findOne({ email, usedAt: null, expiresAt: { $gt: new Date() } });
  if (pending) return res.status(409).json({ error: 'An invite is already pending for this email' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await SuperAdminInvite.create({ token, email, invitedBy: req.superAdmin.clerkUserId, expiresAt });

  const inviteLink = `${FRONTEND_URL}/admin/accept-invite?token=${token}`;

  if (!process.env.RESEND_API_KEY) {
    return res.status(201).json({ inviteLink, token, expiresAt, warning: 'Resend not configured — share link manually' });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Chama360 <onboarding@resend.dev>',
    to: email,
    subject: 'You have been invited as a Chama360 Platform Super Admin',
    html: `
      <div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #F0EDE8;">
        <div style="background: #FFFFFF; border-radius: 16px; padding: 32px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 48px; height: 48px; background: #C8501A; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="color: white; font-weight: 700; font-size: 18px;">C</span>
            </div>
            <h1 style="color: #C8501A; font-size: 20px; font-weight: 700; margin: 12px 0 4px;">Chama360</h1>
          </div>
          <h2 style="color: #1C1510; font-size: 22px; font-weight: 700; margin: 0 0 8px;">Platform Admin Access</h2>
          <p style="color: #6B6560; font-size: 15px; margin: 0 0 24px;">
            You have been invited to become a <strong style="color: #1C1510;">Super Admin</strong> for the Chama360 platform.
            Super admins manage all groups, billing, and members across the platform.
          </p>
          <a href="${inviteLink}" style="display: block; background: #C8501A; color: white; text-align: center; padding: 14px 24px; border-radius: 9999px; font-weight: 600; font-size: 15px; text-decoration: none; margin-bottom: 24px;">
            Accept Super Admin Invite
          </a>
          <p style="color: #A09990; font-size: 12px; margin: 0;">
            Sign in with this email address (${email}). This invite expires in 48 hours.
          </p>
        </div>
      </div>
    `,
  });

  await logAdminAction({
    req, action: 'super_admin.invite', targetType: 'super_admin', metadata: { email },
  });
  res.status(201).json({ inviteLink, expiresAt });
};

// POST /api/admin/super-admins/accept-invite  (auth required; NOT requireSuperAdmin)
exports.acceptInvite = async (req, res) => {
  const { getAuth } = require('@clerk/express');
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });

  const invite = await SuperAdminInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.usedAt) return res.status(400).json({ error: 'Invite already used' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite expired' });

  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

  const existing = await SuperAdmin.findOne({ clerkUserId });
  if (existing && !existing.revokedAt) return res.status(409).json({ error: 'You are already a super admin' });

  if (existing?.revokedAt) {
    existing.revokedAt = null;
    existing.invitedBy = invite.invitedBy;
    await existing.save();
  } else {
    await SuperAdmin.create({
      clerkUserId, email: invite.email, invitedBy: invite.invitedBy,
    });
  }

  invite.usedAt = new Date();
  invite.usedBy = clerkUserId;
  await invite.save();

  res.status(201).json({ message: 'Super admin access granted' });
};

// DELETE /api/admin/super-admins/:id
exports.revoke = async (req, res) => {
  const target = await SuperAdmin.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Super admin not found' });
  if (target.clerkUserId === req.superAdmin.clerkUserId) {
    return res.status(400).json({ error: 'You cannot revoke your own super admin access' });
  }
  target.revokedAt = new Date();
  await target.save();

  await logAdminAction({
    req, action: 'super_admin.revoke', targetType: 'super_admin', targetId: target._id,
    metadata: { email: target.email },
  });
  res.json({ message: 'Super admin revoked', target });
};
