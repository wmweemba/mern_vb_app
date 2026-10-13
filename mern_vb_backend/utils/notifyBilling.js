const { Resend } = require('resend');

// Same escaping discipline as supportController.js / billingController.js —
// user-supplied names (group name, payer name) are HTML-escaped before being
// dropped into a Telegram/Resend HTML message. Never log or send a full MSISDN;
// callers must pass an already-masked value.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Exact warning lines from source plan Step 5c.
const WARNING_LINES = {
  amount_mismatch: '⚠️ Amount mismatch',
  late_success: '⚠️ Late success (attempt had been marked failed)',
  already_paid_up: '⚠️ Group was already paid up, possible double payment after a manual activation',
  recent_success: '⚠️ Group already paid via Lipila in the last 24h',
  group_deleted_or_suspended: '⚠️ Group is deleted/suspended, money received anyway',
  group_missing: '⚠️ Group not found, money received with no group',
};

/**
 * Telegram + Resend admin notice on a Lipila-collected subscription payment.
 * Never throws — every channel is best-effort; failures are console.error only.
 * `maskedMsisdn` must already be masked by the caller (never the full number).
 */
async function notifyAdminSubscriptionCollected({
  groupName,
  payerName,
  plan,
  amount,
  currency,
  paidUntil,
  providerExternalId,
  maskedMsisdn,
  isTestAmount,
  warnings = [],
}) {
  const paidUntilStr = paidUntil ? new Date(paidUntil).toISOString().split('T')[0] : 'n/a';
  const title = '💰 Chama360 subscription paid automatically (Lipila)';
  const lines = [
    `<b>Group:</b> ${escapeHtml(groupName || 'Unknown')}`,
    `<b>Payer:</b> ${escapeHtml(payerName || 'Unknown')}`,
    `<b>Plan:</b> ${escapeHtml(plan)}${isTestAmount ? ' (TEST AMOUNT)' : ''}`,
    `<b>Amount:</b> ${currency || 'ZMW'} ${amount}`,
    `<b>Paid until:</b> ${paidUntilStr}`,
    `<b>MNO ref:</b> ${escapeHtml(providerExternalId || 'n/a')}`,
    `<b>Phone:</b> ${escapeHtml(maskedMsisdn || '')}`,
  ];
  for (const w of warnings) {
    if (WARNING_LINES[w]) lines.push(WARNING_LINES[w]);
  }
  const text = `${title}\n\n${lines.join('\n')}`;

  const tasks = [];

  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    tasks.push(
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
        signal: AbortSignal.timeout(10000),
      }).then((r) => {
        if (!r.ok) throw new Error(`Telegram ${r.status}`);
      }),
    );
  }

  const adminEmail = process.env.ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL;
  if (process.env.RESEND_API_KEY && adminEmail) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    tasks.push(
      resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Chama360 <noreply@mynexusgroup.com>',
        to: adminEmail,
        subject: `${title} — ${groupName || 'Unknown group'}`,
        html: text.replace(/\n/g, '<br>'),
      }),
    );
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((r) => {
    if (r.status === 'rejected') {
      console.error('[notifyBilling] notifyAdminSubscriptionCollected channel failed:', r.reason && r.reason.message);
    }
  });
}

/**
 * Receipt email to the payer. Skipped silently if `to` is empty or Resend isn't
 * configured. Never throws — failures are console.error only (Support note #5
 * precedent).
 */
async function sendPaymentReceipt({ to, groupName, plan, amount, currency, date, providerExternalId, paidUntil }) {
  if (!to) return;
  if (!process.env.RESEND_API_KEY) return;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const dateStr = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const paidUntilStr = paidUntil ? new Date(paidUntil).toISOString().split('T')[0] : 'n/a';
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Chama360 <noreply@mynexusgroup.com>',
      to,
      subject: `Chama360 payment received — ${groupName || 'your group'}`,
      html:
        `<p>Hi,</p>` +
        `<p>We received your payment for Chama360 (${escapeHtml(plan)}).</p>` +
        `<p><b>Amount:</b> ${currency || 'ZMW'} ${amount}<br>` +
        `<b>Date:</b> ${dateStr}<br>` +
        `<b>MNO ref:</b> ${escapeHtml(providerExternalId || 'n/a')}<br>` +
        `<b>Paid until:</b> ${paidUntilStr}</p>` +
        `<p>Keep this as your receipt.</p>`,
    });
  } catch (err) {
    console.error('[notifyBilling] sendPaymentReceipt failed:', err.message);
  }
}

module.exports = { notifyAdminSubscriptionCollected, sendPaymentReceipt };
