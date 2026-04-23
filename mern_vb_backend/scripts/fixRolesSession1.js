require('dotenv').config();
const mongoose = require('mongoose');
const SuperAdmin = require('../models/SuperAdmin');
const GroupMember = require('../models/GroupMember');
const Group = require('../models/Group');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  // Step 1: Resolve William's Clerk user ID — prefer SuperAdmin (production ID)
  let williamClerkId = null;
  const superAdminRecord = await SuperAdmin.findOne({ email: 'wmweemba@gmail.com' });
  if (superAdminRecord) {
    williamClerkId = superAdminRecord.clerkUserId;
  } else {
    const gm = await GroupMember.findOne({
      email: 'wmweemba@gmail.com',
      clerkUserId: { $ne: null },
    });
    if (gm) williamClerkId = gm.clerkUserId;
  }
  if (!williamClerkId) {
    console.error('ERROR: Could not resolve William\'s Clerk user ID. Create a Clerk account first.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`William's Clerk user ID resolved: ${williamClerkId}`);

  // Step 2: Load William's GroupMember record
  const williamMember = await GroupMember.findOne({ email: 'wmweemba@gmail.com' });
  if (!williamMember) {
    console.error('ERROR: No GroupMember record found for wmweemba@gmail.com. William must already exist as a GroupMember.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Step 3: Hard-delete admin@vb.com GroupMember records FIRST
  // (must happen before updating William's clerkUserId to avoid the compound
  // unique index conflict — admin@vb.com holds the prod Clerk ID in this group)
  const adminMembers = await GroupMember.find({ email: 'admin@vb.com' });
  if (adminMembers.length === 0) {
    console.log('No admin@vb.com records to delete');
  }
  for (const m of adminMembers) {
    console.log(`Deleting admin@vb.com GroupMember: _id=${m._id}, groupId=${m.groupId}, role=${m.role}`);
    await GroupMember.deleteOne({ _id: m._id });
  }

  // Step 4: Ensure William's GroupMember has the correct clerkUserId and role='admin'
  let changed = false;
  if (String(williamMember.clerkUserId) !== String(williamClerkId)) {
    console.log(`Updating William's clerkUserId from ${williamMember.clerkUserId} to ${williamClerkId}`);
    williamMember.clerkUserId = williamClerkId;
    changed = true;
  } else {
    console.log('William\'s clerkUserId already correct — no change');
  }

  if (williamMember.role === 'admin') {
    console.log('William is already admin — no change');
  } else {
    const oldRole = williamMember.role;
    williamMember.role = 'admin';
    changed = true;
    console.log(`Promoting William from ${oldRole} to admin`);
  }

  if (changed) await williamMember.save();

  // Step 5: Ensure William's SuperAdmin record is active
  const superAdmin = await SuperAdmin.findOne({ clerkUserId: williamClerkId });
  if (!superAdmin) {
    await SuperAdmin.create({
      clerkUserId: williamClerkId,
      email: 'wmweemba@gmail.com',
      name: williamMember.name,
    });
    console.log('Created SuperAdmin for William');
  } else if (superAdmin.revokedAt !== null) {
    superAdmin.revokedAt = null;
    await superAdmin.save();
    console.log('Reactivated SuperAdmin for William');
  } else {
    console.log('SuperAdmin for William already active — no change');
  }

  // Step 6: Update Group.clerkAdminId for groups William is in
  const williamMemberRecords = await GroupMember.find({ email: 'wmweemba@gmail.com' });
  const williamGroupIds = williamMemberRecords.map(m => m.groupId);

  for (const groupId of williamGroupIds) {
    const group = await Group.findById(groupId);
    if (!group) continue;
    if (String(group.clerkAdminId) !== String(williamClerkId)) {
      const oldAdminId = group.clerkAdminId;
      group.clerkAdminId = williamClerkId;
      await group.save();
      console.log(`Updated Group "${group.name}" clerkAdminId from ${oldAdminId} to ${williamClerkId}`);
    } else {
      console.log(`Group "${group.name}" clerkAdminId already correct — no change`);
    }
  }

  // Final summary (re-query to confirm end state)
  const finalSuperAdmin = await SuperAdmin.findOne({ email: 'wmweemba@gmail.com' });
  const finalSuperAdminStatus = !finalSuperAdmin ? 'MISSING' : finalSuperAdmin.revokedAt === null ? 'ACTIVE' : 'REVOKED';

  const finalWilliam = await GroupMember.findOne({ email: 'wmweemba@gmail.com' });
  const finalRole = finalWilliam ? finalWilliam.role : 'NOT FOUND';
  const finalDeletedAt = finalWilliam ? finalWilliam.deletedAt : 'N/A';

  const finalAdminCount = await GroupMember.countDocuments({ email: 'admin@vb.com' });

  const finalGroups = await Group.find({ name: { $regex: /william/i } });
  let finalGroupAdminEmail = 'unknown Clerk ID';
  for (const g of finalGroups) {
    if (g.clerkAdminId) {
      const m = await GroupMember.findOne({ clerkUserId: g.clerkAdminId, groupId: g._id });
      if (m) finalGroupAdminEmail = m.email;
    }
  }

  console.log('\n=== FINAL SUMMARY ===');
  console.log(`  SuperAdmin for William:           ${finalSuperAdminStatus}`);
  console.log(`  William's GroupMember role:       ${finalRole} (deletedAt: ${finalDeletedAt})`);
  console.log(`  admin@vb.com GroupMember records: ${finalAdminCount}`);
  console.log(`  Group.clerkAdminId points to:     ${finalGroupAdminEmail}`);

  await mongoose.disconnect();
}

fix().catch(err => { console.error(err); process.exit(1); });
