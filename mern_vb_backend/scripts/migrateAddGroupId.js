require('dotenv').config();
const mongoose = require('mongoose');

// Models
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupSettings = require('../models/GroupSettings');
const Loan = require('../models/Loans');
const Saving = require('../models/Savings');
const Transaction = require('../models/Transaction');
const Fine = require('../models/Fine');
const BankBalance = require('../models/BankBalance');
const Threshold = require('../models/Threshold');

// Old model — read-only during migration
const User = mongoose.model('LegacyUser', new mongoose.Schema({}, { strict: false }), 'users');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true }
};

const DRY_RUN = process.argv.includes('--dry-run');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);
  console.log(`Connected to MongoDB ${DRY_RUN ? '(DRY RUN — no writes)' : ''}`);

  // Step 1: Find or create Group for William's group
  let group = await Group.findOne({ slug: 'williams-group' });
  if (!group) {
    if (DRY_RUN) {
      console.log('[DRY] Would create Group: "William\'s Group" (slug: williams-group)');
      // Use a fake ObjectId for dry-run logging
      group = { _id: new mongoose.Types.ObjectId(), name: "William's Group" };
    } else {
      group = await Group.create({ name: "William's Group", slug: 'williams-group' });
      console.log('Created Group:', group._id);
    }
  } else {
    console.log('Group already exists:', group._id);
  }
  const groupId = group._id;

  // Step 2: Create GroupMember records from existing User records
  // Use the SAME _id so existing userId references in Loans/Savings/etc. still work
  const legacyUsers = await User.find({});
  console.log(`Found ${legacyUsers.length} legacy User records`);

  for (const user of legacyUsers) {
    const exists = await GroupMember.findById(user._id);
    if (exists) {
      console.log(`  GroupMember already exists for ${user.name || user.username} — skip`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`[DRY] Would create GroupMember: _id=${user._id}, name=${user.name || user.username}, role=${user.role}`);
    } else {
      await GroupMember.create({
        _id: user._id,
        clerkUserId: null,  // Set later when user links Clerk account
        groupId,
        role: user.role || 'member',
        name: user.name || user.username,
        phone: user.phone || null,
        email: user.email || null,
      });
      console.log(`  Created GroupMember: ${user.name || user.username} (${user.role})`);
    }
  }

  // Step 3: Stamp all data documents that lack groupId
  const filter = { groupId: { $exists: false } };
  const collections = [
    { model: Loan, name: 'Loan' },
    { model: Saving, name: 'Saving' },
    { model: Transaction, name: 'Transaction' },
    { model: Fine, name: 'Fine' },
    { model: BankBalance, name: 'BankBalance' },
    { model: Threshold, name: 'Threshold' },
    { model: GroupSettings, name: 'GroupSettings' },
  ];

  for (const { model, name } of collections) {
    const count = await model.countDocuments(filter);
    if (DRY_RUN) {
      console.log(`[DRY] Would stamp ${count} ${name} documents with groupId`);
    } else {
      const result = await model.updateMany(filter, { $set: { groupId } });
      console.log(`${name}: stamped ${result.modifiedCount} documents`);
    }
  }

  // Step 4: Link group to first admin member
  const adminMember = await GroupMember.findOne({ role: 'admin', groupId });
  if (adminMember && !DRY_RUN) {
    await Group.findByIdAndUpdate(groupId, { clerkAdminId: null }); // Set when William links Clerk
    console.log('Admin member found:', adminMember.name);
  }

  console.log(DRY_RUN ? '\nDry run complete. No data was modified.' : '\nMigration complete.');
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
