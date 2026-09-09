/**
 * Deletes records whose `groupId` points at no existing Group document
 * (or is missing entirely).
 *
 * Why these exist: `deleteGroups.js` and `createThrowawayTestUser.js --delete`
 * both remove a Group and its records by groupId, but anything they missed —
 * or anything predating the multi-tenancy migration (`migrateAddGroupId.js`),
 * which has no groupId at all — is left behind with nothing pointing at it.
 * They are invisible in normal use because every query is group-scoped, and
 * surfaced on 2026-09-09 only because a super admin with no group membership
 * briefly made those queries unscoped (see middleware/resolveGroup.js).
 *
 * Orphans are computed at run time, never hardcoded, so this is safe to run
 * against either database.
 *
 * Usage:
 *   node scripts/cleanupOrphanedRecords.js              # dry run, no writes
 *   node scripts/cleanupOrphanedRecords.js --apply      # delete
 *   node scripts/cleanupOrphanedRecords.js --apply --force   # bypass the safety cap
 *
 * Production (database is private to the Coolify network):
 *   ssh -i ~/.ssh/hetzner_coolify root@<host> \
 *     "docker exec <backend-container> node scripts/cleanupOrphanedRecords.js"
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');

// Every model carrying a groupId. Keep in sync with:
//   grep -l groupId mern_vb_backend/models/*.js
const MODEL_NAMES = [
  'AdminAuditLog', 'BankBalance', 'Contribution', 'ContributionType',
  'Fine', 'GroupMember', 'GroupSettings', 'InviteToken', 'Loans',
  'PendingInvite', 'Savings', 'SocialFundBalance', 'SocialFundExpense',
  'SupportRequest', 'Threshold', 'Transaction',
];

// Refuse to delete more than this without --force. A run that suddenly wants to
// remove hundreds of records means the Group collection is wrong, not that there
// are suddenly hundreds of orphans.
const SAFETY_CAP = 100;

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

const clientOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };

function hostOf(uri) {
  try { return uri.replace(/\/\/[^@]*@/, '//<credentials>@').split('?')[0]; }
  catch { return '<unparseable>'; }
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI is not set.'); process.exit(1); }

  await mongoose.connect(uri, clientOptions);

  console.log('\n🔎 Orphaned-record cleanup');
  console.log(`   Target : ${hostOf(uri)}`);
  console.log(`   Mode   : ${APPLY ? 'APPLY (deletes will happen)' : 'DRY RUN (no writes — pass --apply to execute)'}\n`);

  const groupIds = new Set((await Group.find({}).select('_id').lean()).map(g => String(g._id)));
  console.log(`   ${groupIds.size} Group document(s) found — records pointing outside this set are orphans.\n`);

  const plan = [];
  for (const name of MODEL_NAMES) {
    const Model = require(`../models/${name}`);
    const docs = await Model.find({}).select('groupId').lean();
    const orphanIds = docs
      .filter(d => !d.groupId || !groupIds.has(String(d.groupId)))
      .map(d => d._id);
    if (orphanIds.length) plan.push({ name, Model, orphanIds, total: docs.length });
  }

  const totalOrphans = plan.reduce((n, p) => n + p.orphanIds.length, 0);

  if (totalOrphans === 0) {
    console.log('✅ No orphaned records found. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  plan.forEach(p => console.log(`   ${p.name.padEnd(20)} ${String(p.orphanIds.length).padStart(4)} orphan(s) of ${p.total}`));
  console.log(`\n   TOTAL: ${totalOrphans}`);

  if (totalOrphans > SAFETY_CAP && !FORCE) {
    console.error(
      `\n❌  ${totalOrphans} orphans exceeds the safety cap of ${SAFETY_CAP}.\n` +
      '    That usually means the Group collection is incomplete, not that there are\n' +
      '    genuinely this many orphans. Investigate before passing --force.\n'
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing deleted. Re-run with --apply to execute.\n');
    await mongoose.disconnect();
    return;
  }

  console.log('');
  for (const p of plan) {
    const res = await p.Model.deleteMany({ _id: { $in: p.orphanIds } });
    console.log(`   ✅ ${p.name.padEnd(20)} deleted ${res.deletedCount}`);
  }
  console.log('\n✅ Cleanup complete. Re-run without --apply to confirm zero remain.\n');

  await mongoose.disconnect();
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
