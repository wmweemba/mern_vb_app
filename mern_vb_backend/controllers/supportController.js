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

// A ticket is unread (from the customer's side) when the most recent admin
// message postdates the last time the customer opened the thread. Derived,
// never stored, so it can't drift from the messages that feed it.
function hasUnreadAdminReply(ticket) {
  if (!ticket.messages || ticket.messages.length === 0) return false;
  const lastAdminMessage = [...ticket.messages].reverse().find(m => m.authorType === 'admin');
  if (!lastAdminMessage) return false;
  if (!ticket.userLastViewedAt) return true;
  return new Date(lastAdminMessage.createdAt) > new Date(ticket.userLastViewedAt);
}

// Best-effort Telegram ping to the operator when a customer replies.
// Never throws — a notification failure must not fail the reply itself.
async function notifyAdminOfReply(ticket, body) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const text =
      `💬 <b>New reply on support ticket</b>\n\n` +
      `<b>From:</b> ${escapeHtml(ticket.name)}\n` +
      `<b>Group:</b> ${escapeHtml(ticket.groupName || '—')}\n\n` +
      `${escapeHtml(body)}\n\n` +
      `<b>Ticket ID:</b> ${ticket._id}`;
    const r = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
    });
    if (!r.ok) throw new Error(`Telegram ${r.status}`);
  } catch (err) {
    console.error('Failed to notify admin of support reply:', err.message);
  }
}

// Best-effort email to the customer when an admin replies. Closes the loop
// for users who aren't in the app daily — see NS-005 §2a in the second brain.
async function notifyUserOfReply(ticket, body) {
  if (!process.env.RESEND_API_KEY || !ticket.email) return;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Chama360 <noreply@mynexusgroup.com>',
      to: ticket.email,
      subject: 'Reply to your Chama360 support request',
      html:
        `<p>Hi ${escapeHtml(ticket.name)},</p>` +
        `<p>Support replied to your ticket:</p>` +
        `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>` +
        `<p>Open the app → Help &amp; Support → My Requests to reply.</p>`,
    });
  } catch (err) {
    console.error('Failed to email user about support reply:', err.message);
  }
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

      if (!email) {
        // GroupMember.email is optional, so fall back to the Clerk-verified
        // email for this user rather than letting the ticket fail Mongoose
        // validation (SupportRequest.email is required).
        try {
          const clerkUser = await clerkClient.users.getUser(clerkUserId);
          const primaryEmail = clerkUser.emailAddresses?.find(e => e.id === clerkUser.primaryEmailAddressId);
          email = primaryEmail?.emailAddress || '';
        } catch {
          // leave email blank; caught by the check below
        }
      }
      if (!email) {
        return res.status(400).json({ error: 'Your account is missing an email address. Add one from the banner at the top of the app, then try again.', code: 'MISSING_EMAIL' });
      }

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

// The authenticated user's own tickets. Identity resolved server-side from
// the session — never from a client-supplied id. Not gated by trial/
// subscription middleware, per NS-005 §2: an expired user must still be
// able to reach support.
exports.listMyRequests = async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);
    const tickets = await SupportRequest.find({ clerkUserId })
      .sort({ updatedAt: -1 })
      .lean();

    const withUnread = tickets.map(t => ({ ...t, hasUnread: hasUnreadAdminReply(t) }));
    return res.json({ requests: withUnread });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load your support requests', details: err.message });
  }
};

// A single ticket with its full thread, scoped so a user can only fetch
// their own ticket — the query filters on clerkUserId, not just _id.
// Viewing marks the thread read for the unread-badge calculation.
exports.getMyRequest = async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);
    const { id } = req.params;

    const ticket = await SupportRequest.findOne({ _id: id, clerkUserId });
    if (!ticket) return res.status(404).json({ error: 'Support request not found.' });

    ticket.userLastViewedAt = new Date();
    await ticket.save();

    return res.json(ticket);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load support request', details: err.message });
  }
};

// A user reply, scoped so a user can only post to their own ticket.
exports.addUserMessage = async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);
    const { id } = req.params;
    const body = req.body?.body ? String(req.body.body).trim() : '';

    if (body.length < 1) return res.status(400).json({ error: 'Message cannot be empty.' });
    if (body.length > 4000) return res.status(400).json({ error: 'Message must be 4000 characters or fewer.' });

    const ticket = await SupportRequest.findOne({ _id: id, clerkUserId });
    if (!ticket) return res.status(404).json({ error: 'Support request not found.' });

    ticket.messages.push({ authorType: 'user', authorId: clerkUserId, authorName: ticket.name, body });

    // A reply means the issue isn't settled from the customer's side — reopen it.
    if (['resolved', 'closed'].includes(ticket.status)) {
      ticket.status = 'in_progress';
    }
    // They just wrote in the thread, so they've necessarily seen everything in it.
    ticket.userLastViewedAt = new Date();

    await ticket.save();
    await notifyAdminOfReply(ticket, body);

    return res.status(201).json(ticket);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send message', details: err.message });
  }
};

// Admin reply — appends a message rather than overwriting resolutionNote.
// Mounted under /api/admin, already behind requireSuperAdmin.
exports.addAdminMessage = async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);
    const { id } = req.params;
    const body = req.body?.body ? String(req.body.body).trim() : '';

    if (body.length < 1) return res.status(400).json({ error: 'Message cannot be empty.' });
    if (body.length > 4000) return res.status(400).json({ error: 'Message must be 4000 characters or fewer.' });

    const ticket = await SupportRequest.findById(id);
    if (!ticket) return res.status(404).json({ error: 'Support request not found.' });

    let authorName = 'Support Team';
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      authorName = clerkUser.fullName || clerkUser.firstName || authorName;
    } catch {
      // fall back to the generic label above
    }

    ticket.messages.push({ authorType: 'admin', authorId: clerkUserId, authorName, body });
    if (ticket.status === 'open') ticket.status = 'in_progress';

    await ticket.save();
    await notifyUserOfReply(ticket, body);

    return res.status(201).json(ticket);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send reply', details: err.message });
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
