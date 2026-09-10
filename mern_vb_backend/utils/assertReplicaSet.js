const mongoose = require('mongoose');

/**
 * Asserts at startup that the database is a replica set, and shouts if it is not.
 *
 * Seven controllers use `session.withTransaction()` — payments, contributions,
 * loans, funds, cycle resets, group creation, admin group actions. MongoDB
 * multi-document transactions require a replica set, so on a standalone every one
 * of those fails with "Transaction numbers are only allowed on a replica set
 * member or mongos": no repayments, no contributions, no new loans, no cycle
 * resets, and no new group can be onboarded at all.
 *
 * That is not hypothetical. The 2026-09-09 Atlas→Coolify cutover moved production
 * from Atlas (always a replica set) to a standalone and silently broke every write
 * path for a full day. Nothing caught it: the tests, the browser smoke tests and
 * the import rehearsals all run against Atlas, and read-only production audits
 * never open a transaction. See CLAUDE.md gotcha #12 and P-020 in the second brain.
 *
 * The flags that fix it live in a Coolify-*generated* docker-compose.yml, which a
 * database redeploy can regenerate — silently dropping `--replSet`. This check
 * exists so that becomes a message on someone's phone in seconds rather than a
 * customer discovering it days later.
 *
 * Deliberately does NOT stop the server. Reads still work on a standalone, and a
 * degraded app a treasurer can look at beats an app that will not boot. It fails
 * loud, not closed.
 */
async function assertReplicaSet() {
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (hello.setName) {
      console.log(`✅ MongoDB replica set "${hello.setName}" — transactions available`);
      return { ok: true, setName: hello.setName };
    }

    const message =
      'MongoDB is NOT a replica set. Every transactional write path is broken: ' +
      'loan repayments, contributions, new loans, fund expenses, cycle resets and ' +
      'new group onboarding will all fail. Check that the Coolify Mongo still runs ' +
      'with --replSet (a database redeploy can silently drop it) and re-run rs.initiate() ' +
      'if needed. See CLAUDE.md gotcha #12.';

    console.error(`\n${'='.repeat(72)}\n🚨 ${message}\n${'='.repeat(72)}\n`);
    await notifyOperator(message);
    return { ok: false, setName: null };
  } catch (err) {
    // Never let the check itself take the server down.
    console.error('⚠️  Could not determine replica-set status:', err.message);
    return { ok: null, error: err.message };
  }
}

// Best-effort Telegram ping, same pattern as supportController's notifications.
async function notifyOperator(message) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: `🚨 <b>Chama360: database is not a replica set</b>\n\n${message}`,
        parse_mode: 'HTML',
      }),
    });
    if (!r.ok) throw new Error(`Telegram ${r.status}`);
  } catch (err) {
    console.error('Failed to send replica-set alert:', err.message);
  }
}

module.exports = { assertReplicaSet };
