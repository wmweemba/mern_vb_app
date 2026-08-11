/**
 * Idempotent backfill: persists `templateKey` + `policies` on every existing
 * GroupSettings document, derived from that group's own existing field values so
 * behaviour after this script is bit-identical to behaviour before it.
 *
 * Mongoose already applies the schema's `policies` defaults ('village_bank' shape)
 * to any document loaded without the field, so reads were already safe before this
 * runs — this script exists to (a) persist the real per-group values where a schema
 * default alone would be wrong (`cycleEnd` from `profitSharingMethod`), and (b) make
 * `templateKey` queryable for reporting.
 *
 * Safe to re-run: skips any document that already has `templateKey` set.
 *
 * Usage: node scripts/backfillGroupSettingsPolicies.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const GroupSettings = require('../models/GroupSettings');

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔗 Connected to MongoDB\n');

  const candidates = await GroupSettings.find({
    $or: [{ templateKey: { $exists: false } }, { templateKey: null }],
  });
  console.log(`Found ${candidates.length} GroupSettings document(s) to backfill\n`);

  let updated = 0;
  for (const settings of candidates) {
    settings.templateKey = 'village_bank';
    settings.policies = {
      loanAccrual: settings.interestMethod === 'flat' ? 'scheduled_flat' : 'scheduled_reducing',
      arrears: 'none',
      loanLimit: 'savings_multiple',
      concurrentLoans: 'unlimited',
      interestObligation: 'none',
      cycleEnd: settings.profitSharingMethod === 'equal' ? 'shareout_equal' : 'shareout_proportional',
      exit: 'settle_and_refund',
    };
    await settings.save();
    updated++;
    console.log(`  ✅ Backfilled "${settings.groupName}" (loanAccrual=${settings.policies.loanAccrual}, cycleEnd=${settings.policies.cycleEnd})`);
  }

  console.log(`\n✅ Done. GroupSettings backfilled: ${updated}`);
  await mongoose.disconnect();
}

backfill().catch(err => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
