/**
 * One-off cleanup for Session 2b of docs/plan_db_cutover_and_grace_migration.md.
 *
 * After the Atlas -> Coolify cutover, Grace's group (Grocery Savings Group)
 * exists in both databases — production (where it belongs, the one real
 * live customer) and Atlas (an inert leftover from the full-copy cutover).
 * Keeping her real members' data sitting in a database that throwaway test
 * accounts get created against daily is exactly what the dev/prod split
 * exists to stop. Her 25 members carry Production-instance Clerk IDs, so
 * this copy is already inert — the Development Clerk instance can't
 * authenticate any of them.
 *
 * Deliberately the OPPOSITE guard direction from deleteGroups.js: this
 * script must NEVER run against production, since that's the one place
 * her group actually belongs.
 */
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
const SocialFundBalance = require('../models/SocialFundBalance');
const SocialFundExpense = require('../models/SocialFundExpense');
const ContributionType = require('../models/ContributionType');
const Contribution = require('../models/Contribution');
const SupportRequest = require('../models/SupportRequest');
const AdminAuditLog = require('../models/AdminAuditLog');
const { isAtlasUri, maskUri } = require('./utils/productionGuard');

const GRACE_GROUP_ID = '6a75a334ba20ae75b763e2cb'; // Grocery Savings Group

const COLLECTIONS = [
  { label: 'GroupMembers', model: GroupMember },
  { label: 'GroupSettings', model: GroupSettings },
  { label: 'BankBalance', model: BankBalance },
  { label: 'Loans', model: Loans },
  { label: 'Savings', model: Savings },
  { label: 'Transactions', model: Transaction },
  { label: 'Fines', model: Fine },
  { label: 'Thresholds', model: Threshold },
  { label: 'InviteTokens', model: InviteToken },
  { label: 'PendingInvites', model: PendingInvite },
  { label: 'SocialFundBalance', model: SocialFundBalance },
  { label: 'SocialFundExpenses', model: SocialFundExpense },
  { label: 'ContributionTypes', model: ContributionType },
  { label: 'Contributions', model: Contribution },
  { label: 'SupportRequests', model: SupportRequest },
  { label: 'AdminAuditLogs', model: AdminAuditLog },
];

const APPLY = process.argv.includes('--apply');

async function run() {
  const uri = process.env.MONGODB_URI;
  console.log('\n🗑️   Remove Grace\'s inert Atlas copy');
  console.log('─'.repeat(60));
  console.log(`\n  Mode: ${APPLY ? 'APPLY (writes will happen)' : 'DRY RUN (no writes — pass --apply to execute)'}`);
  console.log(`  Target database: ${maskUri(uri)}`);

  if (!isAtlasUri(uri)) {
    console.error(
      '\n❌  Refusing to run against a non-Atlas URI.\n' +
      '    This script only ever removes Grace\'s group from Atlas (the dev\n' +
      '    database) — it must never touch production, where her group is\n' +
      '    the one real live customer.\n'
    );
    process.exit(1);
  }

  await mongoose.connect(uri);

  const group = await Group.findById(GRACE_GROUP_ID);
  const label = group ? `${group.name} (${GRACE_GROUP_ID})` : `Grocery Savings Group (${GRACE_GROUP_ID}) — already gone`;
  console.log(`\n  ${APPLY ? 'Deleting' : 'Would delete'}: ${label}`);

  for (const { label: colLabel, model } of COLLECTIONS) {
    if (APPLY) {
      const result = await model.deleteMany({ groupId: GRACE_GROUP_ID });
      console.log(`    ${colLabel}: ${result.deletedCount}`);
    } else {
      const count = await model.countDocuments({ groupId: GRACE_GROUP_ID });
      console.log(`    ${colLabel}: ${count}`);
    }
  }

  if (group) {
    if (APPLY) {
      await Group.deleteOne({ _id: GRACE_GROUP_ID });
      console.log('    Group document: deleted');
    } else {
      console.log('    Group document: would delete');
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(APPLY ? '\nDone.\n' : '\nDry run complete.\n');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('❌  Error:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
