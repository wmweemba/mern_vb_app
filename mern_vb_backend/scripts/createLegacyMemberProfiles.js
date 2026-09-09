/**
 * Creates unverified GroupMember profiles for members who haven't signed up
 * yet, so migration/data-import work isn't blocked on every member having
 * completed Clerk onboarding. Same pattern as the 8 legacy profiles Simon
 * Peter had created directly in the DB for Grocery Savings Group (Grace's
 * group) while collecting emails — see second-brain
 * ventures/saas/chama360/_overview.md item 17.
 *
 * clerkUserId is left null and isVerified false. When each member later
 * completes a real Clerk sign-up via a "Send Invite"/resend email using the
 * same address, acceptInvite/the Clerk webhook will find this record by
 * email+group and upgrade it in place (sets clerkUserId, isVerified: true)
 * instead of creating a duplicate — no manual password/credential handling
 * needed.
 *
 * Usage:
 *   node scripts/createLegacyMemberProfiles.js
 *
 * Edit the MEMBERS array below before running. Refuses to create a
 * duplicate if a GroupMember with the same email already exists in the group.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const GroupMember = require('../models/GroupMember');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

const GROUP_ID = '6a75a334ba20ae75b763e2cb'; // Grocery Savings Group (Grace's group)

// Fill this in before running. Left empty deliberately — real member names and
// email addresses are customer PII and must not be committed to the repo.
//   { name: 'Jane Banda', email: 'jane@example.com', role: 'member' },
const MEMBERS = [];

async function run() {
  if (MEMBERS.length === 0) {
    console.error('MEMBERS is empty — edit the array at the top of this script before running.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  for (const m of MEMBERS) {
    const normalizedEmail = m.email.toLowerCase().trim();
    const existing = await GroupMember.findOne({ groupId: GROUP_ID, email: normalizedEmail });
    if (existing) {
      console.log(`⚠️  Skipped ${m.name} <${normalizedEmail}> — GroupMember already exists (_id=${existing._id}, isVerified=${existing.isVerified})`);
      continue;
    }

    const member = await GroupMember.create({
      groupId: GROUP_ID,
      name: m.name,
      email: normalizedEmail,
      role: m.role,
      clerkUserId: null,
      isVerified: false,
      active: true,
    });
    console.log(`✅ Created legacy profile: ${member.name} <${member.email}> (_id=${member._id}, role=${member.role})`);
  }

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
