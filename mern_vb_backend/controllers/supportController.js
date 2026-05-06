const { Resend } = require('resend');
const { getAuth, clerkClient } = require('@clerk/express');
const Group = require('../models/Group');
const SupportRequest = require('../models/SupportRequest');

const CATEGORY_LABELS = {
  error: 'Error / Bug',
  question: 'Question',
  feature_request: 'Feature Request',
  billing: 'Billing',
  other: 'Other',
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

exports.createRequest = async (req, res) => {
  try {
    const { phone, category, description, pagePath, userAgent } = req.body;

    // Validate required fields
    if (!phone || String(phone).trim().length < 5 || String(phone).trim().length > 30) {
      return res.status(400).json({ error: 'A valid phone number (5–30 characters) is required.' });
    }
    if (!category || !SupportRequest.CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'A valid category is required.' });
    }
    const desc = description ? String(description).trim() : '';
    if (desc.length < 5) {
      return res.status(400).json({ error: 'Description must be at least 5 characters.' });
    }
    if (desc.length > 4000) {
      return res.status(400).json({ error: 'Description must be 4000 characters or fewer.' });
    }

    const { userId: clerkUserId } = getAuth(req);

    // Resolve identity
    let name, email, role, groupId, groupMemberId, groupName;

    if (req.member) {
      name = req.member.name;
      email = req.member.email;
      role = req.member.role || null;
      groupId = req.groupId || null;
      groupMemberId = req.member._id;

      if (groupId) {
        const group = await Group.findById(groupId).select('name');
        groupName = group ? group.name : null;
      }
    } else if (req.isSuperAdmin) {
      try {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        name = clerkUser.fullName || clerkUser.firstName || 'Super Admin';
        const primaryEmail = clerkUser.emailAddresses?.find(e => e.id === clerkUser.primaryEmailAddressId);
        email = primaryEmail?.emailAddress || '';
      } catch {
        return res.status(400).json({ error: 'Cannot resolve identity — please refresh and try again.' });
      }
      role = 'super_admin';
      groupId = null;
      groupMemberId = null;
      groupName = null;
    } else {
      return res.status(400).json({ error: 'Cannot resolve identity — please refresh and try again.' });
    }

    const ticket = new SupportRequest({
      clerkUserId,
      groupMemberId: groupMemberId || null,
      groupId: groupId || null,
      name,
      email,
      phone: phone.trim(),
      role,
      groupName,
      category,
      description: desc,
      pagePath: pagePath ? String(pagePath).slice(0, 500) : null,
      userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
    });

    await ticket.save();

    const categoryLabel = CATEGORY_LABELS[category] || category;
    const messageText =
      `🆘 <b>New Support Request</b>\n\n` +
      `<b>Group:</b> ${escapeHtml(groupName || '—')}\n` +
      `<b>From:</b> ${escapeHtml(name)}\n` +
      `<b>Email:</b> ${escapeHtml(email)}\n` +
      `<b>Phone:</b> ${escapeHtml(phone.trim())}\n` +
      `<b>Role:</b> ${escapeHtml(role || '—')}\n` +
      `<b>Category:</b> ${escapeHtml(categoryLabel)}\n` +
      `<b>Page:</b> ${escapeHtml(pagePath || '—')}\n` +
      `<b>Submitted:</b> ${ticket.createdAt.toISOString()}\n\n` +
      `<b>Description:</b>\n${escapeHtml(desc)}\n\n` +
      `<b>Ticket ID:</b> ${ticket._id}`;

    // Telegram send (best-effort)
    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        const r = await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: messageText,
            parse_mode: 'HTML',
          }),
        });
        if (!r.ok) throw new Error(`Telegram ${r.status}`);
        ticket.notifiedTelegramAt = new Date();
      } catch (err) {
        ticket.notifyError = `telegram: ${err.message}`;
      }
    } else {
      ticket.notifyError = 'telegram: TELEGRAM_BOT_TOKEN not set';
    }

    // Email send (best-effort, only if env vars set)
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL;
    if (process.env.RESEND_API_KEY && adminEmail) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Chama360 <noreply@mynexusgroup.com>',
          to: adminEmail,
          subject: `[Support] ${categoryLabel} — ${groupName || name}`,
          html: messageText.replace(/\n/g, '<br>'),
        });
        ticket.notifiedEmailAt = new Date();
      } catch (err) {
        ticket.notifyError = (ticket.notifyError ? ticket.notifyError + '; ' : '') + `email: ${err.message}`;
      }
    }

    await ticket.save();

    return res.status(201).json({ success: true, ticketId: ticket._id });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit support request', details: err.message });
  }
};

exports.listRequests = async (req, res) => {
  try {
    let { status, category, q, page = 1, limit = 25 } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit) || 25));

    const filter = {};
    if (status && status !== 'all' && SupportRequest.STATUSES.includes(status)) {
      filter.status = status;
    }
    if (category && SupportRequest.CATEGORIES.includes(category)) {
      filter.category = category;
    }
    if (q) {
      const safe = String(q).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safe, 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { groupName: regex },
        { description: regex },
      ];
    }

    const [requests, total] = await Promise.all([
      SupportRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SupportRequest.countDocuments(filter),
    ]);

    return res.json({ requests, total, page, limit });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to list support requests', details: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolutionNote } = req.body;

    if (!status && resolutionNote === undefined) {
      return res.status(400).json({ error: 'At least one of status or resolutionNote is required.' });
    }
    if (status && !SupportRequest.STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${SupportRequest.STATUSES.join(', ')}` });
    }

    const ticket = await SupportRequest.findById(id);
    if (!ticket) return res.status(404).json({ error: 'Support request not found.' });

    if (status) ticket.status = status;
    if (resolutionNote !== undefined) {
      ticket.resolutionNote = String(resolutionNote).trim().slice(0, 2000) || null;
    }

    // Set resolvedAt/resolvedBy only on first transition to resolved or closed
    if (status && ['resolved', 'closed'].includes(status) && !ticket.resolvedAt) {
      ticket.resolvedAt = new Date();
      ticket.resolvedBy = getAuth(req).userId || null;
    }

    await ticket.save();
    return res.json(ticket);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update support request', details: err.message });
  }
};
