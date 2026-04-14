/**
 * diagnoseProd.js
 * Run this against the production database to verify all records needed for
 * William's account to work correctly.
 *
 * Usage (with MONGODB_URI and SUPER_ADMIN_CLERK_ID in environment):
 *   node scripts/diagnoseProd.js
 *
 * Or pass the Clerk user ID directly:
 *   CLERK_USER_ID=user_xxx node scripts/diagnoseProd.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const SuperAdmin = require('../models/SuperAdmin');
const GroupMember = require('../models/GroupMember');
const Group = require('../models/Group');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

const clerkUserId = process.env.CLERK_USER_ID || process.env.SUPER_ADMIN_CLERK_ID;

async function run() {
  if (!clerkUserId) {
    console.error('\n❌  Set CLERK_USER_ID or SUPER_ADMIN_CLERK_ID in your env before running this script.\n');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, clientOptions);
  console.log('\n🔍  Production DB Diagnostics');
  console.log('─'.repeat(60));
  console.log(`  Checking for Clerk user: ${clerkUserId}\n`);

  // 1 — SuperAdmin record
  const superAdmin = await SuperAdmin.findOne({ clerkUserId });
  if (superAdmin) {
    console.log(`  ✅  SuperAdmin record found`);
    console.log(`      email: ${superAdmin.email}`);
  } else {
    console.log(`  ❌  No SuperAdmin record found for this Clerk ID`);
    console.log(`      Fix: run  node scripts/seedSuperAdmin.js  after setting`);
    console.log(`           SUPER_ADMIN_CLERK_ID=${clerkUserId}`);
    console.log(`           SUPER_ADMIN_EMAIL=<your email>`);
  }

  // 2 — GroupMember record
  const member = await GroupMember.findOne({ clerkUserId, active: true });
  if (member) {
    console.log(`\n  ✅  GroupMember record found`);
    console.log(`      name:    ${member.name}`);
    console.log(`      role:    ${member.role}`);
    console.log(`      groupId: ${member.groupId}`);

    // 3 — Group record
    const group = await Group.findById(member.groupId);
    if (group) {
      const now = new Date();
      const trialDaysLeft = group.trialExpiresAt
        ? Math.ceil((group.trialExpiresAt - now) / (1000 * 60 * 60 * 24))
        : null;
      const paidStatus = group.isPaid
        ? (group.paidUntil
          ? `paid until ${group.paidUntil.toISOString().split('T')[0]}`
          : 'paid (no expiry)')
        : `trial — ${trialDaysLeft} day(s) remaining`;

      console.log(`\n  ✅  Group record found`);
      console.log(`      name:   ${group.name}`);
      console.log(`      slug:   ${group.slug}`);
      console.log(`      status: ${paidStatus}`);
    } else {
      console.log(`\n  ❌  Group document MISSING for groupId ${member.groupId}`);
      console.log(`      This would cause 404 "Group not found" on all protected routes.`);
    }
  } else {
    // Check if there's a record with clerkUserId: null (old JWT-era member)
    const nullMember = await GroupMember.findOne({ clerkUserId: null, active: true });
    if (nullMember) {
      console.log(`\n  ⚠️   No active GroupMember for this Clerk ID`);
      console.log(`      BUT there IS an active member with clerkUserId: null`);
      console.log(`      name:    ${nullMember.name}`);
      console.log(`      groupId: ${nullMember.groupId}`);
      console.log(`      _id:     ${nullMember._id}`);
      console.log(`\n      Fix: run this in Coolify terminal or mongo shell:`);
      console.log(`      db.groupmembers.updateOne(`);
      console.log(`        { _id: ObjectId("${nullMember._id}") },`);
      console.log(`        { $set: { clerkUserId: "${clerkUserId}" } }`);
      console.log(`      )`);
    } else {
      console.log(`\n  ❌  No active GroupMember record found (with or without Clerk ID)`);
      console.log(`      The user will be redirected to onboarding.`);
    }
  }

  // 4 — All groups summary
  const allGroups = await Group.find({}).select('name slug isPaid paidUntil trialExpiresAt');
  console.log(`\n  📋  All groups in DB (${allGroups.length} total):`);
  for (const g of allGroups) {
    const now = new Date();
    let status;
    if (g.isPaid) {
      status = g.paidUntil ? `paid until ${g.paidUntil.toISOString().split('T')[0]}` : 'paid';
    } else {
      const days = g.trialExpiresAt
        ? Math.ceil((g.trialExpiresAt - now) / (1000 * 60 * 60 * 24))
        : '?';
      status = `trial (${days} days left)`;
    }
    console.log(`      • ${g.name}  (${g.slug})  — ${status}`);
  }

  console.log('\n' + '─'.repeat(60) + '\n');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('❌  Error:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
