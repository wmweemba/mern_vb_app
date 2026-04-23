require('dotenv').config();
const mongoose = require('mongoose');
const GroupMember = require('../models/GroupMember');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  const members = await GroupMember.find({});
  let verifiedCount = 0;
  let unverifiedCount = 0;
  const verifiedEmails = [];

  for (const member of members) {
    const target = !!(member.clerkUserId && member.clerkUserId.trim() !== '');
    if (member.isVerified !== target) {
      member.isVerified = target;
      await member.save();
    }
    if (target) {
      verifiedCount++;
      verifiedEmails.push(member.email || `(no email) _id=${member._id}`);
    } else {
      unverifiedCount++;
    }
  }

  console.log(`\nTotal records processed: ${members.length}`);
  console.log(`Set to isVerified: true:  ${verifiedCount}`);
  for (const e of verifiedEmails) console.log(`  - ${e}`);
  console.log(`Set to isVerified: false: ${unverifiedCount}`);

  await mongoose.disconnect();
}

backfill().catch(err => { console.error(err); process.exit(1); });
