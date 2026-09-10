/**
 * Idempotent backfill: seeds the social fund (GroupFund) and the two default ContributionTypes
 * for any existing group that was created before the contributions feature was added.
 *
 * Safe to re-run: uses existence checks / upsert — already-seeded groups are skipped.
 *
 * Usage: node scripts/seedContributionDefaults.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const GroupSettings = require('../models/GroupSettings');
const GroupFund = require('../models/GroupFund');
const ContributionType = require('../models/ContributionType');

const DEFAULT_TYPES = [
  { name: 'Admin Fee',   affectsMainBalance: true,  isDefault: true, active: true },
  { name: 'Social Fund', affectsMainBalance: false, isDefault: true, active: true },
];

// Phase 3 (docs/plan_configurable_group_rules.md) — only seeded for groups whose
// interest obligation policy is actually active; adding it unconditionally would give
// every village_bank group a meaningless type.
const INTEREST_TOPUP_TYPE = {
  name: 'Interest Top-Up', affectsMainBalance: true,
  countsTowardInterestObligation: true, isDefault: true, active: true,
};

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔗 Connected to MongoDB\n');

  const groups = await Group.find({ deletedAt: null });
  console.log(`Found ${groups.length} active group(s)\n`);

  let sfCreated = 0;
  let typesCreated = 0;

  for (const group of groups) {
    const gid = group._id;

    // SocialFundBalance — upsert (create only if missing)
    const sfExists = await GroupFund.findOne({ groupId: gid, key: 'social_fund' });
    if (!sfExists) {
      await GroupFund.create({ groupId: gid, key: 'social_fund', name: 'Social Fund', balance: 0, isDefault: true });
      sfCreated++;
      console.log(`  ✅ Created Social Fund for "${group.name}"`);
    }

    // ContributionTypes — insert only if the name doesn't already exist for this group
    const typesToSeed = [...DEFAULT_TYPES];
    const settings = await GroupSettings.findOne({ groupId: gid });
    if (settings?.policies?.interestObligation === 'per_member_quota') {
      typesToSeed.push(INTEREST_TOPUP_TYPE);
    }
    for (const def of typesToSeed) {
      const exists = await ContributionType.findOne({ groupId: gid, name: def.name })
        .collation({ locale: 'en', strength: 2 });
      if (!exists) {
        await ContributionType.create({ groupId: gid, ...def });
        typesCreated++;
        console.log(`  ✅ Created ContributionType "${def.name}" for "${group.name}"`);
      }
    }
  }

  console.log(`\n✅ Done. Social Fund docs created: ${sfCreated}, ContributionType docs created: ${typesCreated}`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
