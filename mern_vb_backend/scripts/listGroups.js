require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  const groups = await Group.find({}).sort({ createdAt: 1 });

  if (!groups.length) {
    console.log('\n⚠️  No groups found in the database.\n');
    await mongoose.disconnect();
    return;
  }

  console.log(`\n📋  Groups in database (${groups.length} total)\n`);
  console.log('─'.repeat(72));

  for (const g of groups) {
    const memberCount = await GroupMember.countDocuments({ groupId: g._id });
    const status = g.isPaid
      ? `paid (until ${g.paidUntil ? g.paidUntil.toISOString().split('T')[0] : 'no expiry'})`
      : `trial (expires ${g.trialExpiresAt ? g.trialExpiresAt.toISOString().split('T')[0] : 'unknown'})`;

    console.log(`  Name:     ${g.name}`);
    console.log(`  Slug:     ${g.slug}`);
    console.log(`  ID:       ${g._id}`);
    console.log(`  Status:   ${status}`);
    console.log(`  Members:  ${memberCount}`);
    console.log(`  Created:  ${g.createdAt.toISOString().split('T')[0]}`);
    console.log('─'.repeat(72));
  }

  console.log('');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('❌  Error:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
