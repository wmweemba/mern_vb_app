require('dotenv').config();
const mongoose = require('mongoose');
const SuperAdmin = require('../models/SuperAdmin');
const GroupMember = require('../models/GroupMember');
const Group = require('../models/Group');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

async function audit() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  console.log('\n=== SuperAdmin for wmweemba@gmail.com ===');
  const superAdmin = await SuperAdmin.findOne({ email: 'wmweemba@gmail.com' });
  let superAdminStatus = 'MISSING';
  if (superAdmin) {
    superAdminStatus = superAdmin.revokedAt === null ? 'ACTIVE' : 'REVOKED';
    console.log(`  _id:        ${superAdmin._id}`);
    console.log(`  clerkUserId: ${superAdmin.clerkUserId}`);
    console.log(`  email:       ${superAdmin.email}`);
    console.log(`  revokedAt:   ${superAdmin.revokedAt}`);
    console.log(`  createdAt:   ${superAdmin.createdAt}`);
    console.log(`  Status:      ${superAdminStatus}`);
  } else {
    console.log('  SuperAdmin record MISSING for wmweemba@gmail.com');
  }

  console.log('\n=== GroupMember records for wmweemba@gmail.com ===');
  const williamMembers = await GroupMember.find({ email: 'wmweemba@gmail.com' });
  let williamRole = 'NOT FOUND';
  let williamDeletedAt = 'N/A';
  if (williamMembers.length === 0) {
    console.log('  None found');
  }
  for (const m of williamMembers) {
    console.log(`  _id:        ${m._id}`);
    console.log(`  groupId:    ${m.groupId}`);
    console.log(`  clerkUserId: ${m.clerkUserId}`);
    console.log(`  role:        ${m.role}`);
    console.log(`  name:        ${m.name}`);
    console.log(`  deletedAt:   ${m.deletedAt}`);
    console.log(`  active:      ${m.active}`);
    console.log('  ---');
    williamRole = m.role;
    williamDeletedAt = m.deletedAt;
  }

  console.log('\n=== GroupMember records for admin@vb.com ===');
  const adminMembers = await GroupMember.find({ email: 'admin@vb.com' });
  if (adminMembers.length === 0) {
    console.log('  No GroupMember records found for admin@vb.com — nothing to clean up');
  }
  for (const m of adminMembers) {
    console.log(`  _id:        ${m._id}`);
    console.log(`  groupId:    ${m.groupId}`);
    console.log(`  clerkUserId: ${m.clerkUserId}`);
    console.log(`  role:        ${m.role}`);
    console.log(`  name:        ${m.name}`);
    console.log(`  deletedAt:   ${m.deletedAt}`);
    console.log(`  active:      ${m.active}`);
    console.log('  ---');
  }

  console.log('\n=== Group documents matching "William" (case-insensitive) ===');
  const groups = await Group.find({ name: { $regex: /william/i } });
  let groupAdminEmail = 'unknown Clerk ID';
  if (groups.length === 0) {
    console.log('  None found');
  }
  for (const g of groups) {
    console.log(`  _id:         ${g._id}`);
    console.log(`  name:        ${g.name}`);
    console.log(`  slug:        ${g.slug}`);
    console.log(`  clerkAdminId: ${g.clerkAdminId}`);
    console.log(`  deletedAt:   ${g.deletedAt}`);
    if (g.clerkAdminId) {
      const adminMember = await GroupMember.findOne({
        clerkUserId: g.clerkAdminId,
        groupId: g._id,
      });
      if (adminMember) {
        groupAdminEmail = adminMember.email;
        console.log(`  clerkAdminId resolves to: ${adminMember.email} (${adminMember.name})`);
      } else {
        console.log(`  clerkAdminId resolves to: unknown (no GroupMember found in this group)`);
      }
    }
    console.log('  ---');
  }

  console.log('\n=== SUMMARY ===');
  console.log(`  SuperAdmin for William:          ${superAdminStatus}`);
  console.log(`  William's GroupMember role:      ${williamRole} (deletedAt: ${williamDeletedAt})`);
  console.log(`  admin@vb.com GroupMember records: ${adminMembers.length}`);
  console.log(`  Group.clerkAdminId points to:    ${groupAdminEmail}`);

  await mongoose.disconnect();
}

audit().catch(err => { console.error(err); process.exit(1); });
