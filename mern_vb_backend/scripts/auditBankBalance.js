/**
 * Bank balance audit — reconciles a group's recorded BankBalance against its
 * Transaction log. STRICTLY READ-ONLY: never add a write here. Runs against the
 * production Atlas database (see CLAUDE.md "MongoDB Atlas" note) — read-only is
 * the only thing that makes that safe.
 *
 * Multi-tenant: every query is scoped by groupId. The app has multiple groups
 * sharing one database; comparing one group's BankBalance against Transaction
 * sums pooled across every group produces a meaningless "discrepancy" (this was
 * the bug — the script had zero groupId references before this rewrite).
 *
 * Usage:
 *   node scripts/auditBankBalance.js                  # list groups + balances, exit
 *   node scripts/auditBankBalance.js --group <groupId> # audit one group
 *   node scripts/auditBankBalance.js --all             # audit every non-deleted group
 *
 * Exit code: 1 if any audited group's discrepancy exceeds ZMW 1 (so this can gate
 * a release, per CLAUDE.md's Verification Loop Step 2), 0 otherwise.
 */
const mongoose = require('mongoose');
require('dotenv').config();

const DISCREPANCY_THRESHOLD = 1; // ZMW

function parseArgs(argv) {
  const args = { group: null, all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') args.all = true;
    if (argv[i] === '--group') args.group = argv[i + 1];
  }
  return args;
}

// Balance effect of one transaction on the MAIN lending pool (CLAUDE.md "Financial
// Logic — Bank Balance Formula"). social_fund_credit/debit are the social fund's
// mini-ledger, not the main pool — they MUST stay 0 here, not fall into a
// catch-all default, or the audit produces false discrepancies (see CLAUDE.md
// "Contributions Feature" item 7 — this bit a prior version of this script).
// Revolving-loan interest accrual (utils/strategies/loanAccrual/revolvingMonthly.js
// `accrue()`) deliberately creates no Transaction at all — it's a balance
// restatement, not a cash movement — so it never appears here and needs no case.
function balanceEffect(type, amount) {
  switch (type) {
    case 'saving':
    case 'loan_payment':
    case 'payment':
    case 'fine':
    case 'contribution':
      return amount;
    case 'loan':
    case 'payout':
      return -amount;
    case 'cycle_reset':
    case 'social_fund_credit':
    case 'social_fund_debit':
      return 0;
    default:
      return amount;
  }
}

// Interest actually paid on a loan, regardless of accrual family — mirrors
// controllers/interestObligationController.js's interestPaidOnLoan, but this
// cross-check wants *total paid* (interest + principal), not interest-only.
function totalPaidOnLoan(loan) {
  if (loan.accrualMode === 'revolving') {
    return (loan.entries || [])
      .filter(e => e.type === 'interest_payment' || e.type === 'principal_payment')
      .reduce((sum, e) => sum + e.amount, 0);
  }
  return (loan.installments || []).reduce((sum, inst) => sum + (inst.paidAmount || 0), 0);
}

async function listGroups(Group, BankBalance) {
  const groups = await Group.find({}).sort({ createdAt: 1 });
  console.log(`Found ${groups.length} group(s) in the database:\n`);
  for (const g of groups) {
    const bb = await BankBalance.findOne({ groupId: g._id });
    const status = g.deletedAt ? `deleted ${g.deletedAt.toISOString().split('T')[0]}` : 'active';
    console.log(`  ${g._id} | ${g.name.padEnd(30)} | ${status.padEnd(22)} | balance: K${bb ? bb.balance : '(none)'}`);
  }
  console.log('\nRun with --group <groupId> to audit one group, or --all to audit every active group.');
}

async function findOrphanedBankBalances(Group, BankBalance) {
  const balances = await BankBalance.find({});
  const orphans = [];
  for (const bb of balances) {
    const group = await Group.findById(bb.groupId);
    if (!group) {
      orphans.push({ bankBalanceId: bb._id, groupId: bb.groupId, balance: bb.balance, reason: 'no matching Group document' });
    } else if (group.deletedAt) {
      orphans.push({ bankBalanceId: bb._id, groupId: bb.groupId, balance: bb.balance, reason: `Group deleted ${group.deletedAt.toISOString().split('T')[0]} ("${group.name}")` });
    }
  }
  return orphans;
}

// Returns { calculatedBalance, recordedBalance, difference, clean }
async function auditGroup(groupId, groupLabel, models) {
  const { Transaction, BankBalance, Savings, Loan } = models;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`GROUP: ${groupLabel} (${groupId})`);
  console.log('='.repeat(70));

  const currentBalance = await BankBalance.findOne({ groupId });
  console.log(`\n📊 Current Recorded Bank Balance: K${currentBalance ? currentBalance.balance : '(no BankBalance document)'}\n`);

  const transactions = await Transaction.find({ groupId, archived: { $ne: true } }).sort({ createdAt: 1 });
  console.log(`📝 Total Transactions Found: ${transactions.length}\n`);

  const totalsByType = {};
  let calculatedBalance = 0;

  transactions.forEach((tx, index) => {
    const type = tx.type || 'unknown';
    const amount = tx.amount || 0;
    const effect = balanceEffect(type, amount);
    calculatedBalance += effect;

    totalsByType[type] = totalsByType[type] || { count: 0, total: 0 };
    totalsByType[type].count += 1;
    totalsByType[type].total += amount;

    console.log(`${index + 1}. ${tx.createdAt.toISOString().split('T')[0]} | ${type.toUpperCase()} | K${amount} | Effect: ${effect >= 0 ? '+' : ''}K${effect} | Running: K${calculatedBalance.toFixed(2)}`);
  });

  console.log('\n📈 SUMMARY BY TRANSACTION TYPE:\n');
  Object.entries(totalsByType).forEach(([type, { count, total }]) => {
    console.log(`${type.toUpperCase()}: ${count} transactions, Total: K${total}`);
  });

  const recordedBalance = currentBalance ? currentBalance.balance : 0;
  const difference = recordedBalance - calculatedBalance;

  console.log(`\n🎯 RESULT:\n`);
  console.log(`📊 Current Recorded Balance: K${recordedBalance}`);
  console.log(`🧮 Calculated Expected Balance: K${calculatedBalance.toFixed(2)}`);
  console.log(`📏 Difference: K${difference.toFixed(2)}`);

  const clean = Math.abs(difference) < DISCREPANCY_THRESHOLD;
  if (clean) {
    console.log(`✅ Bank balance is ACCURATE (within K${DISCREPANCY_THRESHOLD} threshold).`);
  } else {
    console.log(`⚠️  Discrepancy exceeds K${DISCREPANCY_THRESHOLD} threshold!`);
  }

  // Cross-verification against actual Savings/Loan records for this group.
  console.log('\n🔍 CROSS-VERIFICATION WITH ACTUAL DATA:\n');

  const allSavings = await Savings.find({ groupId, archived: { $ne: true } });
  const actualSavingsTotal = allSavings.reduce((sum, s) => sum + s.amount, 0);
  console.log(`💰 Actual Savings Records Total: K${actualSavingsTotal}`);

  const allLoans = await Loan.find({ groupId, archived: { $ne: true } });
  const actualLoansTotal = allLoans.reduce((sum, l) => sum + l.amount, 0);
  console.log(`📋 Actual Loan Records Total (original disbursement amounts): K${actualLoansTotal}`);

  let totalPaidOnLoans = 0;
  allLoans.forEach(loan => { totalPaidOnLoans += totalPaidOnLoan(loan); });
  console.log(`💸 Total Paid on Loans (installments + revolving entries): K${totalPaidOnLoans}`);

  const txSavingsTotal = (totalsByType.saving || { total: 0 }).total;
  const txLoanPaymentsTotal = ((totalsByType.loan_payment || { total: 0 }).total) + ((totalsByType.payment || { total: 0 }).total);

  console.log('\n🎯 DATA CONSISTENCY CHECK:\n');
  console.log(`Transaction Savings vs Actual Savings: K${txSavingsTotal} vs K${actualSavingsTotal} (${txSavingsTotal === actualSavingsTotal ? '✅ Match' : '❌ Mismatch'})`);
  console.log(`Transaction Loan Payments vs Actual Payments: K${txLoanPaymentsTotal} vs K${totalPaidOnLoans} (${Math.abs(txLoanPaymentsTotal - totalPaidOnLoans) < 0.01 ? '✅ Match' : '❌ Mismatch'})`);

  return { groupId: String(groupId), groupLabel, recordedBalance, calculatedBalance, difference, clean };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔍 Bank Balance Audit (multi-tenant, read-only)\n');

    const Group = require('../models/Group');
    const BankBalance = require('../models/BankBalance');
    const Transaction = require('../models/Transaction');
    const Savings = require('../models/Savings');
    const Loan = require('../models/Loans');
    const models = { Transaction, BankBalance, Savings, Loan };

    // Orphaned BankBalance documents — report only, never delete.
    const orphans = await findOrphanedBankBalances(Group, BankBalance);
    if (orphans.length > 0) {
      console.log(`⚠️  ${orphans.length} orphaned BankBalance document(s) found (report only — not modified):\n`);
      orphans.forEach(o => {
        console.log(`  BankBalance ${o.bankBalanceId} — groupId ${o.groupId} — K${o.balance} — ${o.reason}`);
      });
      console.log('');
    }

    if (!args.group && !args.all) {
      await listGroups(Group, BankBalance);
      return;
    }

    let targetGroups = [];
    if (args.group) {
      const group = await Group.findById(args.group);
      if (!group) {
        console.error(`❌ No group found with id ${args.group}`);
        process.exitCode = 1;
        return;
      }
      targetGroups = [group];
    } else {
      targetGroups = await Group.find({ deletedAt: null }).sort({ createdAt: 1 });
      console.log(`Auditing ${targetGroups.length} active group(s)...\n`);
    }

    const results = [];
    for (const group of targetGroups) {
      const result = await auditGroup(group._id, group.name, models);
      results.push(result);
    }

    if (args.all) {
      console.log(`\n${'='.repeat(70)}`);
      console.log('SUMMARY — ALL GROUPS');
      console.log('='.repeat(70));
      results.forEach(r => {
        const flag = r.clean ? '✅' : '❌';
        console.log(`${flag} ${r.groupLabel.padEnd(30)} | recorded K${r.recordedBalance.toFixed(2).padStart(10)} | expected K${r.calculatedBalance.toFixed(2).padStart(10)} | diff K${r.difference.toFixed(2).padStart(8)}`);
      });
    }

    const anyDirty = results.some(r => !r.clean);
    if (anyDirty) {
      console.log(`\n⚠️  One or more groups exceed the K${DISCREPANCY_THRESHOLD} discrepancy threshold.`);
      process.exitCode = 1;
    } else {
      console.log(`\n✅ All audited group(s) reconcile cleanly.`);
      process.exitCode = 0;
    }
  } catch (error) {
    console.error('❌ Error during audit:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Bank Balance Audit Complete');
  }
}

main();
