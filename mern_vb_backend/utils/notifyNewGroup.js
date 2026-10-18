// Signup source tracking — fire-and-forget Telegram alert on self-serve group
// creation. Modelled on utils/notifyBilling.js's Telegram shape. Never throws
// (D10 — must never block or fail group creation); never includes a phone
// number or email.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyNewGroup({ groupName, treasurerName, templateKey, ref }) {
  try {
    if (!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)) {
      console.error('[notifyNewGroup] Telegram not configured; skipping new-group alert');
      return;
    }

    const trialEndsStr = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Telegram caps messages at 4096 chars. Truncate untrusted free-text
    // fields before escaping so a pathological input can't blow the limit.
    const safeGroupName = String(groupName ?? '').slice(0, 200);
    const safeTreasurerName = String(treasurerName ?? '').slice(0, 200);

    const envTag = process.env.NODE_ENV !== 'production'
      ? ` [${process.env.NODE_ENV || 'dev'}]`
      : '';

    const lines = [
      `🆕 <b>New Chama360 group</b>${envTag}`,
      '',
      `<b>Group:</b> ${escapeHtml(safeGroupName)}`,
      `<b>Created by:</b> ${escapeHtml(safeTreasurerName)}`,
      `<b>Template:</b> ${escapeHtml(templateKey)}`,
      `<b>Source:</b> ${escapeHtml(ref || 'direct')}`,
      `<b>Trial ends:</b> ${trialEndsStr}`,
    ];
    const text = lines.join('\n');

    // AbortSignal.timeout(8000) leaves its internal timer running for the
    // full 8s even after fetch settles early (every test mocks fetch to
    // resolve instantly) — across many tests those dangling timers pile up
    // in the shared jest worker process and starve later test files. Use a
    // controller + setTimeout we can clearTimeout() as soon as fetch
    // settles, same request semantics, no leaked handle.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let r;
    try {
      r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!r.ok) throw new Error(`Telegram ${r.status}`);
  } catch (err) {
    console.error('[notifyNewGroup] failed:', err && err.message);
  }
}

module.exports = { notifyNewGroup };
