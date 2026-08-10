require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupSettings = require('../models/GroupSettings');
const BankBalance = require('../models/BankBalance');
const Loans = require('../models/Loans');
const Savings = require('../models/Savings');
const Transaction = require('../models/Transaction');
const Fine = require('../models/Fine');
const Threshold = require('../models/Threshold');
const InviteToken = require('../models/InviteToken');
const PendingInvite = require('../models/PendingInvite');

// ─── GROUPS TO DELETE ─────────────────────────────────────────────────────────
const SLUGS_TO_DELETE = [
  'pamodzi-savings-group',
  'together-savings-group',
];
// ─────────────────────────────────────────────────────────────────────────────

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

async function deleteGroup(group) {
  const id = group._id;
  const label = `${group.name} (${group.slug})`;

  console.log(`\n  Deleting: ${label}`);

  const results = await Promise.all([
    GroupMember.deleteMany({ groupId: id }),
    GroupSettings.deleteMany({ groupId: id }),
    BankBalance.deleteMany({ groupId: id }),
    Loans.deleteMany({ groupId: id }),
    Savings.deleteMany({ groupId: id }),
    Transaction.deleteMany({ groupId: id }),
    Fine.deleteMany({ groupId: id }),
    Threshold.deleteMany({ groupId: id }),
    InviteToken.deleteMany({ groupId: id }),
    PendingInvite.deleteMany({ groupId: id }),
  ]);

  const [members, settings, balance, loans, savings, transactions, fines, thresholds, invites, pending] = results;

  console.log(`    GroupMembers:   ${members.deletedCount}`);
  console.log(`    GroupSettings:  ${settings.deletedCount}`);
  console.log(`    BankBalance:    ${balance.deletedCount}`);
  console.log(`    Loans:          ${loans.deletedCount}`);
  console.log(`    Savings:        ${savings.deletedCount}`);
  console.log(`    Transactions:   ${transactions.deletedCount}`);
  console.log(`    Fines:          ${fines.deletedCount}`);
  console.log(`    Thresholds:     ${thresholds.deletedCount}`);
  console.log(`    InviteTokens:   ${invites.deletedCount}`);
  console.log(`    PendingInvites: ${pending.deletedCount}`);

  await Group.deleteOne({ _id: id });
  console.log(`    ✅  Group document deleted`);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  console.log('\n🗑️   Group cleanup script');
  console.log('─'.repeat(52));

  for (const slug of SLUGS_TO_DELETE) {
    const group = await Group.findOne({ slug });
    if (!group) {
      console.log(`\n  ⚠️  Group not found: "${slug}" — skipping`);
      continue;
    }
    await deleteGroup(group);
  }

  // Confirm what remains
  const remaining = await Group.find({}).select('name slug');
  console.log('\n─'.repeat(52));
  console.log(`\n✅  Done. Remaining groups (${remaining.length}):`);
  remaining.forEach(g => console.log(`    • ${g.name}  (${g.slug})`));
  console.log('');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('❌  Error:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
