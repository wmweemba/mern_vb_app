/**
 * Audits every named fund (GroupFund) by recomputing its balance from the
 * contributions credited to it and the expenses debited from it, and comparing
 * that to the stored balance. Strictly read-only.
 *
 * Replaces `auditSocialFund.js`, which carried the SAME multi-tenancy defect
 * `auditBankBalance.js` was fixed for in August 2026 and which was never fixed
 * alongside it: it called `SocialFundBalance.findOne()` with no groupId — an
 * arbitrary document — and summed social_fund_credit/debit transactions across
 * every group pooled together. Its output was meaningless on a multi-group
 * database.
 *
 * Funds that reset each cycle are scoped to the current cycle
 * (`archived: { $ne: true }`), matching auditBankBalance.js — cycleController
 * zeroes them and archives their contributions and expenses together. Funds with
 * `resetsOnCycle: false` (the app subscription pot) keep their balance across a
 * reset, so they are audited against lifetime credits and debits instead.
 *
 *   node scripts/auditFunds.js                 # list groups and exit
 *   node scripts/auditFunds.js --group <id>
 *   node scripts/auditFunds.js --all           # non-zero exit above K1 drift
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { printTarget, maskUri } = require('./utils/productionGuard');

const Group = require('../models/Group');
const GroupFund = require('../models/GroupFund');
const Contribution = require('../models/Contribution');
const FundExpense = require('../models/FundExpense');

const DISCREPANCY_THRESHOLD = 1;
const clientOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

async function sum(Model, filter) {
  const [row] = await Model.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  return row ? row.total : 0;
}

async function auditGroup(group) {
  const funds = await GroupFund.find({ groupId: group._id }).sort({ createdAt: 1 });
  console.log(`\n${'='.repeat(70)}\nGROUP: ${group.name} (${group._id})\n${'='.repeat(70)}`);
  if (!funds.length) {
    console.log('  No funds — run scripts/backfillGroupFunds.js');
    return [];
  }

  const results = [];
  for (const fund of funds) {
    // A fund that resets each cycle is audited against the current cycle only,
    // matching auditBankBalance.js. A fund that persists across cycles (the app
    // subscription pot) keeps its balance while its contributions are archived, so
    // it must be audited against LIFETIME credits and debits — scoping it to the
    // current cycle would report a false discrepancy the moment a cycle turns over.
    const cycleScope = fund.resetsOnCycle === false ? {} : { archived: { $ne: true } };
    const credits = await sum(Contribution, { groupId: group._id, fundId: fund._id, ...cycleScope });
    const debits = await sum(FundExpense, { groupId: group._id, fundId: fund._id, ...cycleScope });
    const expected = credits - debits;
    const diff = fund.balance - expected;
    const clean = Math.abs(diff) <= DISCREPANCY_THRESHOLD;
    console.log(
      `  ${clean ? '✅' : '❌'} ${fund.name.padEnd(24)} ${fund.active ? '        ' : '(inactive)'}${fund.resetsOnCycle === false ? ' [persists]' : '           '} ` +
      `recorded K${fund.balance.toFixed(2).padStart(10)} | expected K${expected.toFixed(2).padStart(10)} | diff K${diff.toFixed(2).padStart(8)}` +
      `   (credits K${credits} − expenses K${debits})`
    );
    results.push({ group: group.name, fund: fund.name, clean, diff });
  }
  return results;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI is not set.'); process.exit(1); }
  await mongoose.connect(uri, clientOptions);

  console.log('\n🔍 Fund Audit (multi-tenant, read-only)');
  printTarget(maskUri(uri));

  const groupArg = arg('--group');
  const all = process.argv.includes('--all');

  let groups;
  if (groupArg) {
    const g = await Group.findById(groupArg);
    if (!g) { console.error(`❌ No group found with id ${groupArg}`); process.exitCode = 1; await mongoose.disconnect(); return; }
    groups = [g];
  } else if (all) {
    groups = await Group.find({ deletedAt: null }).sort({ createdAt: 1 });
    console.log(`\nAuditing ${groups.length} active group(s)...`);
  } else {
    const list = await Group.find({ deletedAt: null }).sort({ createdAt: 1 });
    console.log('\nGroups (pass --group <id> or --all):\n');
    for (const g of list) {
      const funds = await GroupFund.countDocuments({ groupId: g._id });
      console.log(`  ${g._id}  ${g.name}  (${funds} fund(s))`);
    }
    console.log('');
    await mongoose.disconnect();
    return;
  }

  const results = [];
  for (const g of groups) results.push(...await auditGroup(g));

  const dirty = results.filter(r => !r.clean);
  console.log(`\n${'='.repeat(70)}`);
  if (dirty.length) {
    console.log(`⚠️  ${dirty.length} fund(s) exceed the K${DISCREPANCY_THRESHOLD} threshold:`);
    dirty.forEach(r => console.log(`   ${r.group} — ${r.fund}: K${r.diff.toFixed(2)}`));
    process.exitCode = 1;
  } else {
    console.log('✅ All funds reconcile cleanly.');
    process.exitCode = 0;
  }
  console.log('🔚 Fund Audit Complete\n');

  await mongoose.disconnect();
}

run().catch(err => { console.error('❌', err.message); process.exitCode = 1; });
