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

// ─── GROUPS TO DELETE (by _id — never by slug/name) ───────────────────────────
// Derived from docs/plan_db_cutover_and_grace_migration.md READ FIRST inventory,
// 2026-09-09. Re-derive with `grep -l groupId models/*.js` before trusting this
// list if models have changed since.
const GROUPS_TO_DELETE = [
  { id: '69d641697236ea09109643e2', name: "William's Group" },
  { id: '69f391848dbc4c12889e5f9f', name: 'Test group 1' },
  { id: '6a7c48724a5ab60a09a37c67', name: 'ZZZ_TEST Demo Grocery Group' },
  { id: '69f0a127b9e11b33d7209973', name: 'Pamo Village Bank' },
  { id: '6a184f38269287ae9b38f919', name: 'Dev Chama' },
  { id: '6a90265e7de2d763a9fbf653', name: 'Mfinance Grocery Chilimba' },
];
// ─────────────────────────────────────────────────────────────────────────────

// Every model carrying a groupId, as of 2026-09-09 (16 — `Cycle` will be a 17th
// once feature/configurable-group-rules-phase2 merges). SuperAdmin is deliberately
// never touched — it has no groupId and is unrelated to any group's lifecycle.
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

async function processGroup({ id, name }) {
  const group = await Group.findById(id);
  const label = group ? `${group.name} (${id})` : `${name} (${id}) — Group document already gone`;

  console.log(`\n  ${APPLY ? 'Deleting' : 'Would delete'}: ${label}`);

  for (const { label: colLabel, model } of COLLECTIONS) {
    if (APPLY) {
      const result = await model.deleteMany({ groupId: id });
      console.log(`    ${colLabel}: ${result.deletedCount}`);
    } else {
      const count = await model.countDocuments({ groupId: id });
      console.log(`    ${colLabel}: ${count}`);
    }
  }

  if (group) {
    if (APPLY) {
      await Group.deleteOne({ _id: id });
      console.log(`    Group document: deleted`);
    } else {
      console.log(`    Group document: would delete`);
    }
  }
}

async function run() {
  const uri = process.env.MONGODB_URI;
  console.log('\n🗑️   Group cleanup script');
  console.log('─'.repeat(60));
  console.log(`\n  Mode: ${APPLY ? 'APPLY (writes will happen)' : 'DRY RUN (no writes — pass --apply to execute)'}`);
  console.log(`  Target database: ${maskUri(uri)}`);

  if (APPLY && isAtlasUri(uri)) {
    console.error(
      '\n❌  Refusing to --apply against an Atlas (mongodb+srv) URI.\n' +
      '    Atlas is the dev/staging database and holds these exact groups deliberately —\n' +
      '    this script is for pruning PRODUCTION down to Grace\'s group only.\n' +
      '    Run this against the Coolify production Mongo via docker exec instead.\n'
    );
    process.exit(1);
  }

  await mongoose.connect(uri);

  for (const g of GROUPS_TO_DELETE) {
    await processGroup(g);
  }

  const remaining = await Group.find({}).select('name slug deletedAt');
  console.log('\n' + '─'.repeat(60));
  console.log(`\n${APPLY ? 'Done' : 'Dry run complete'}. Remaining groups (${remaining.length}):`);
  remaining.forEach(g => console.log(`    • ${g.name}  (${g.slug})${g.deletedAt ? '  [soft-deleted]' : ''}`));
  console.log('');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('❌  Error:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
