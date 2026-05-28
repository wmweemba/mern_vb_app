/**
 * Idempotent backfill: seeds SocialFundBalance and the two default ContributionTypes
 * for any existing group that was created before the contributions feature was added.
 *
 * Safe to re-run: uses existence checks / upsert — already-seeded groups are skipped.
 *
 * Usage: node scripts/seedContributionDefaults.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const SocialFundBalance = require('../models/SocialFundBalance');
const ContributionType = require('../models/ContributionType');

const DEFAULT_TYPES = [
  { name: 'Admin Fee',   affectsMainBalance: true,  isDefault: true, active: true },
  { name: 'Social Fund', affectsMainBalance: false, isDefault: true, active: true },
];

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
    const sfExists = await SocialFundBalance.findOne({ groupId: gid });
    if (!sfExists) {
      await SocialFundBalance.create({ balance: 0, groupId: gid });
      sfCreated++;
      console.log(`  ✅ Created SocialFundBalance for "${group.name}"`);
    }

    // ContributionTypes — insert only if the name doesn't already exist for this group
    for (const def of DEFAULT_TYPES) {
      const exists = await ContributionType.findOne({ groupId: gid, name: def.name })
        .collation({ locale: 'en', strength: 2 });
      if (!exists) {
        await ContributionType.create({ groupId: gid, ...def });
        typesCreated++;
        console.log(`  ✅ Created ContributionType "${def.name}" for "${group.name}"`);
      }
    }
  }

  console.log(`\n✅ Done. SocialFundBalance docs created: ${sfCreated}, ContributionType docs created: ${typesCreated}`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
