const { Resend } = require('resend');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const { getAuth } = require('@clerk/express');

exports.requestUpgrade = async (req, res) => {
  try {
    const { planName, planPrice, phone } = req.body;
    if (!planName || !planPrice || !phone) {
      return res.status(400).json({ error: 'planName, planPrice, and phone are required' });
    }

    const { userId: clerkUserId } = getAuth(req);

    const member = await GroupMember.findOne({ clerkUserId });
    if (!member) {
      return res.status(404).json({ error: 'No group membership found' });
    }

    const group = await Group.findById(member.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const trialExpiry = group.trialExpiresAt
      ? group.trialExpiresAt.toISOString().split('T')[0]
      : 'N/A';

    const messageText = `🔔 <b>New Upgrade Request</b>\n\n` +
      `<b>Group:</b> ${group.name}\n` +
      `<b>Plan:</b> ${planName} — ZMW ${planPrice}/month\n` +
      `<b>Admin:</b> ${member.name}\n` +
      `<b>Email:</b> ${member.email || 'Not provided'}\n` +
      `<b>Phone:</b> ${phone}\n` +
      `<b>Trial expires:</b> ${trialExpiry}\n\n` +
      `✅ Action: Log in to MongoDB Atlas and set:\nisPaid: true\npaidUntil: [today + 30 days]`;

    // Send Telegram message
    const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: messageText,
        parse_mode: 'HTML',
      }),
    });

    // Send email via Resend (optional — only if vars are set)
    if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Chama360 <onboarding@resend.dev>',
        to: process.env.ADMIN_EMAIL,
        subject: `Upgrade Request — ${group.name} (${planName})`,
        html: messageText.replace(/\n/g, '<br>'),
      });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process upgrade request', details: err.message });
  }
};
