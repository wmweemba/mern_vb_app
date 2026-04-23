const express = require('express');
const router = express.Router();
const { Webhook } = require('svix');
const GroupMember = require('../models/GroupMember');
const PendingInvite = require('../models/PendingInvite');

router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Verify webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt;
  try {
    evt = wh.verify(req.body, {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const { type, data } = evt;

  if (type === 'user.created') {
    try {
      const email = data.email_addresses?.[0]?.email_address;
      const clerkUserId = data.id;

      if (!email) return res.status(200).json({ received: true });

      // Look for a PendingInvite matching this email
      const invite = await PendingInvite.findOne({
        email: email.toLowerCase().trim(),
      });

      if (invite) {
        const normalizedEmail = email.toLowerCase().trim();

        // Already linked to this Clerk user in this group — nothing to do
        const alreadyLinked = await GroupMember.findOne({
          clerkUserId,
          groupId: invite.groupId,
        });

        if (!alreadyLinked) {
          // Look for a legacy unverified record for this email in this group
          const legacy = await GroupMember.findOne({
            groupId: invite.groupId,
            email: normalizedEmail,
            isVerified: false,
          });

          if (legacy) {
            legacy.clerkUserId = clerkUserId;
            legacy.isVerified = true;
            if (invite.role && legacy.role !== invite.role) legacy.role = invite.role;
            if (invite.name && !legacy.name) legacy.name = invite.name;
            await legacy.save();
          } else {
            await GroupMember.create({
              clerkUserId,
              groupId: invite.groupId,
              role: invite.role,
              name: invite.name,
              email: normalizedEmail,
              isVerified: true,
            });
          }
        }

        await PendingInvite.deleteOne({ _id: invite._id });
      }
    } catch (err) {
      // Log but don't fail the webhook — Clerk will retry
      console.error('Webhook user.created error:', err.message);
    }
  }

  res.status(200).json({ received: true });
});

module.exports = router;
