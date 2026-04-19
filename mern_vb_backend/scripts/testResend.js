/**
 * testResend.js
 * Diagnoses the Resend email configuration and attempts a test send.
 *
 * Usage from Coolify terminal (inside the backend container):
 *   node scripts/testResend.js
 *
 * Or with an explicit target:
 *   TEST_EMAIL=you@example.com node scripts/testResend.js
 */
require('dotenv').config();
const { Resend } = require('resend');

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.RESEND_FROM_EMAIL || 'Chama360 <noreply@chama360.nxhub.online>';
const toAddress = process.env.TEST_EMAIL || 'wmweemba@gmail.com';

console.log('\n🔍  Resend Email Diagnostics');
console.log('─'.repeat(60));

// 1 — Check API key
if (!apiKey) {
  console.error('  ❌  RESEND_API_KEY is NOT set in environment variables.');
  console.error('      Fix: add RESEND_API_KEY to your Coolify backend env vars.');
  process.exit(1);
}
console.log(`  ✅  RESEND_API_KEY is set (${apiKey.slice(0, 8)}...)`);

// 2 — Show config
console.log(`  📧  From: ${fromAddress}`);
console.log(`  📬  To:   ${toAddress}`);
console.log('─'.repeat(60));
console.log('  Attempting to send test email...\n');

async function run() {
  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: toAddress,
    subject: 'Chama360 — Resend diagnostic test',
    html: `
      <div style="font-family: sans-serif; padding: 24px;">
        <h2 style="color: #C8501A;">Resend is working ✓</h2>
        <p>This is a diagnostic test email from the Chama360 backend.</p>
        <p><strong>From:</strong> ${fromAddress}</p>
        <p><strong>API key prefix:</strong> ${apiKey.slice(0, 8)}...</p>
      </div>
    `,
  });

  if (error) {
    console.error('  ❌  Resend returned an error:');
    console.error(`      name:    ${error.name}`);
    console.error(`      message: ${error.message}`);
    console.error('\n  Common causes:');
    console.error('  • "You can only send testing emails to your own email address"');
    console.error('    → The FROM domain is not verified. Add and verify your domain');
    console.error('      at resend.com/domains, then set RESEND_FROM_EMAIL to use it.');
    console.error('  • "Invalid API key"');
    console.error('    → Check RESEND_API_KEY value in Coolify env vars.');
    console.error('  • "Domain not found"');
    console.error('    → The domain in RESEND_FROM_EMAIL is not registered in Resend.');
    process.exit(1);
  }

  console.log(`  ✅  Email sent successfully!`);
  console.log(`      Resend email ID: ${data.id}`);
  console.log(`      Check ${toAddress} inbox (and spam folder).`);
  console.log('─'.repeat(60) + '\n');
}

run().catch(err => {
  console.error('  ❌  Unexpected error:', err.message);
  process.exit(1);
});
