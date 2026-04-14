require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');

// ─── EDIT THESE BEFORE RUNNING ───────────────────────────────────────────────
const GROUP_SLUG      = 'target-group-slug'; // lowercase slug from Group.slug
const PLAN_NAME       = 'Starter';           // 'Starter' or 'Standard'
const DURATION_MONTHS = 1;                   // how many months to activate
// ─────────────────────────────────────────────────────────────────────────────

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  const group = await Group.findOne({ slug: GROUP_SLUG });
  if (!group) {
    console.error(`❌  Group not found: "${GROUP_SLUG}"`);
    console.error('    Check the slug is correct (must match Group.slug in MongoDB exactly).');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Calculate paidUntil: today + DURATION_MONTHS calendar months
  const paidUntil = new Date();
  paidUntil.setMonth(paidUntil.getMonth() + DURATION_MONTHS);

  const trialExpiresAt = new Date('2099-12-31');

  await Group.updateOne(
    { _id: group._id },
    { $set: { isPaid: true, paidUntil, trialExpiresAt } }
  );

  const activePretty = paidUntil.toISOString().split('T')[0];

  console.log('');
  console.log('✅  Group activated successfully');
  console.log(`    Group:        ${group.name}  (${group.slug})`);
  console.log(`    Plan:         ${PLAN_NAME}`);
  console.log(`    Duration:     ${DURATION_MONTHS} month(s)`);
  console.log(`    Active until: ${activePretty}`);
  console.log(`    Fields set:   isPaid=true, paidUntil=${activePretty}, trialExpiresAt=2099-12-31`);
  console.log('');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('❌  Error:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
