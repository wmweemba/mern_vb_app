require('dotenv').config();
const mongoose = require('mongoose');
const GroupMember = require('../models/GroupMember');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const members = await GroupMember.find({ isVerified: false, active: true, deletedAt: null })
    .select('name email groupId isVerified active')
    .sort({ name: 1 });
  console.log(`\nPending (isVerified=false) members: ${members.length}\n`);
  members.forEach(m => {
    console.log(`  name="${m.name}"  email="${m.email}"  groupId=${m.groupId}  _id=${m._id}`);
  });

  console.log('\n--- All Farai / Katongo records (any state) ---');
  const named = await GroupMember.find({ name: { $regex: /farai|katongo/i } })
    .select('name email groupId isVerified active deletedAt');
  named.forEach(m => {
    console.log(`  name="${m.name}"  email="${m.email}"  verified=${m.isVerified}  active=${m.active}  deleted=${m.deletedAt}  _id=${m._id}`);
  });

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
