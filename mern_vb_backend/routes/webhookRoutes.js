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
        // Check they're not already a member
        const existing = await GroupMember.findOne({
          clerkUserId,
          groupId: invite.groupId,
        });

        if (!existing) {
          await GroupMember.create({
            clerkUserId,
            groupId: invite.groupId,
            role: invite.role,
            name: invite.name,
            email: email.toLowerCase().trim(),
          });
        }

        // Delete the pending invite
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
