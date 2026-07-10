/**
 * One-time backfill: assigns a `plan` (starter/standard) to every existing
 * paid group that predates the plan/member-limit feature.
 *
 * Assignment rule: active member count <= starter's memberLimit -> starter,
 * otherwise -> standard. This guarantees no existing group is immediately
 * capped by a default it never chose.
 *
 * Dry-run by default — prints the group -> member count -> assigned plan
 * table without writing anything.
 * Set DRY_RUN=false to commit: DRY_RUN=false node scripts/backfillGroupPlans.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const PLANS = require('../config/plans');

const DRY_RUN = process.env.DRY_RUN !== 'false';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔗 Connected to MongoDB\n');

  const groups = await Group.find({ isPaid: true, plan: null, deletedAt: null });
  console.log(`Found ${groups.length} paid group(s) with no plan assigned\n`);

  let updated = 0;

  for (const group of groups) {
    const activeCount = await GroupMember.countDocuments({
      groupId: group._id,
      active: true,
      deletedAt: null,
    });

    const plan = activeCount <= PLANS.starter.memberLimit ? 'starter' : 'standard';

    console.log(`  ${group.name} — ${activeCount} active member(s) -> ${plan}`);

    if (!DRY_RUN) {
      group.plan = plan;
      await group.save();
      updated++;
    }
  }

  console.log(DRY_RUN
    ? '\n⚠️  DRY RUN — no data was changed. Set DRY_RUN=false to commit.\n'
    : `\n✅ Done. ${updated} group(s) updated.\n`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
