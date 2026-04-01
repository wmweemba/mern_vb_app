/**
 * fixBalanceCorrection.js
 *
 * One-time correction script for the K158,989 bank balance discrepancy.
 * Executes the plan documented in docs/plan_numbers_fix.md.
 *
 * Steps:
 *   0 — Backup current state to JSON files
 *   1 — Delete 4 duplicate payment transactions (idah x2, sampa x2)
 *   2 — Fix patriciam loan transaction: K11 -> K11,000
 *   3 — Set bank balance to recalculated value
 *   4 — Log an audit Transaction record
 *   5 — Verify final state
 *
 * Steps 1-3 run inside a MongoDB session (atomic). If any step fails,
 * all changes roll back.
 *
 * Run: cd mern_vb_backend && node scripts/fixBalanceCorrection.js
 */

'use strict';

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Transaction = require('../models/Transaction');
const BankBalance = require('../models/BankBalance');
const Savings = require('../models/Savings');
const Loan = require('../models/Loans');
const User = require('../models/User');

// ── Constants ─────────────────────────────────────────────────────────────────

const DUPLICATE_TX_IDS = [
  '69848bd254ac2096922fbcd7', // idah dup 1
  '69848ead0143712773e13b02', // idah dup 2
  '69849b9585d07cfa4cd0b5cb', // sampa dup 1
  '69849eca85d07cfa4cd0b688', // sampa dup 2
];

const PATRICIAM_TX_ID = '69637bb667c6d49b9d295b10';
const EXPECTED_BALANCE = 20633.67;

// ── Step 0: Backup ─────────────────────────────────────────────────────────────

async function backup() {
  console.log('--- Step 0: Backup ---');

  const txs = await Transaction.find({ archived: { $ne: true } }).lean();
  const loans = await Loan.find({ archived: { $ne: true } }).lean();
  const bal = await BankBalance.findOne().lean();

  const ts = Date.now();
  const dir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  fs.writeFileSync(path.join(dir, `backup_transactions_${ts}.json`), JSON.stringify(txs, null, 2));
  fs.writeFileSync(path.join(dir, `backup_loans_${ts}.json`), JSON.stringify(loans, null, 2));
  fs.writeFileSync(path.join(dir, `backup_balance_${ts}.json`), JSON.stringify(bal, null, 2));

  console.log(`  Backed up ${txs.length} transactions, ${loans.length} loans, balance K${bal?.balance}`);
  console.log(`  Files written to mern_vb_backend/backups/\n`);

  return bal?.balance;
}

// ── Step 1: Delete duplicate transactions ─────────────────────────────────────

async function deleteDuplicates(session) {
  console.log('--- Step 1: Delete duplicate transactions ---');

  const objectIds = DUPLICATE_TX_IDS.map(id => new mongoose.Types.ObjectId(id));
  const result = await Transaction.deleteMany({ _id: { $in: objectIds } }, { session });

  if (result.deletedCount !== 4) {
    throw new Error(`Expected to delete 4 duplicates, deleted ${result.deletedCount}. Aborting.`);
  }

  console.log(`  Deleted ${result.deletedCount} duplicate transactions:`);
  DUPLICATE_TX_IDS.forEach(id => console.log(`    - ${id}`));
  console.log('');
}

// ── Step 2: Fix patriciam K11 -> K11,000 ──────────────────────────────────────

async function fixPatriciam(session) {
  console.log('--- Step 2: Fix patriciam loan transaction K11 -> K11,000 ---');

  const tx = await Transaction.findById(PATRICIAM_TX_ID).session(session);
  if (!tx) {
    throw new Error(`Patriciam transaction ${PATRICIAM_TX_ID} not found. Aborting.`);
  }
  if (tx.amount !== 11) {
    throw new Error(`Expected patriciam tx amount=11, got ${tx.amount}. Aborting.`);
  }

  tx.amount = 11000;
  tx.note = 'Loan of K11000 created. [Corrected from K11 — data entry error on 2026-04-01]';
  await tx.save({ session });

  console.log(`  Fixed: ${PATRICIAM_TX_ID} K11 -> K11,000\n`);
}

// ── Step 3: Recalculate and set bank balance ───────────────────────────────────

async function recalculateAndSetBalance(session) {
  console.log('--- Step 3: Recalculate and set bank balance ---');

  const txs = await Transaction.find({ archived: { $ne: true } })
    .sort({ createdAt: 1 })
    .session(session);

  let calculatedBalance = 0;
  txs.forEach(tx => {
    switch (tx.type) {
      case 'saving':       calculatedBalance += tx.amount; break;
      case 'loan':         calculatedBalance -= tx.amount; break;
      case 'loan_payment':
      case 'payment':      calculatedBalance += tx.amount; break;
      case 'payout':       calculatedBalance -= tx.amount; break;
      case 'fine':         calculatedBalance += tx.amount; break;
      case 'cycle_reset':  break;
      default:             calculatedBalance += tx.amount;
    }
  });

  calculatedBalance = Math.round(calculatedBalance * 100) / 100;
  console.log(`  Recalculated balance from ${txs.length} transactions: K${calculatedBalance.toFixed(2)}`);

  const tolerance = 0.02;
  if (Math.abs(calculatedBalance - EXPECTED_BALANCE) > tolerance) {
    throw new Error(
      `Recalculated balance K${calculatedBalance.toFixed(2)} does not match expected K${EXPECTED_BALANCE}. ` +
      `Difference: K${(calculatedBalance - EXPECTED_BALANCE).toFixed(2)}. Aborting.`
    );
  }

  const balDoc = await BankBalance.findOne().session(session);
  if (!balDoc) throw new Error('BankBalance document not found. Aborting.');

  const oldBalance = balDoc.balance;
  balDoc.balance = calculatedBalance;
  await balDoc.save({ session });

  console.log(`  Bank balance updated: K${oldBalance} -> K${calculatedBalance.toFixed(2)}\n`);
  return { oldBalance, newBalance: calculatedBalance };
}

// ── Step 4: Log audit transaction ─────────────────────────────────────────────

async function logAuditTransaction(oldBalance, newBalance) {
  console.log('--- Step 4: Log audit transaction ---');

  const adminUser = await User.findOne({ role: 'admin' });
  if (!adminUser) throw new Error('Admin user not found. Cannot log audit transaction.');

  await Transaction.create({
    userId: adminUser._id,
    type: 'cycle_reset',
    amount: 0,
    note:
      `BALANCE CORRECTION (2026-04-01): ` +
      `Removed 4 duplicate payment transactions (idah 2x K17500, sampa 2x K14000 = K63000 excess credit). ` +
      `Fixed patriciam loan transaction K11 -> K11000 (missing K10989 debit). ` +
      `Reset bank balance from K${oldBalance} to K${newBalance.toFixed(2)}. ` +
      `Total correction: -K${(oldBalance - newBalance).toFixed(2)}. ` +
      `See docs/plan_numbers_fix.md for full audit.`,
  });

  console.log('  Audit transaction logged.\n');
}

// ── Step 5: Verify ────────────────────────────────────────────────────────────

async function verify() {
  console.log('--- Step 5: Verification ---');

  const balDoc = await BankBalance.findOne();
  const txs = await Transaction.find({ archived: { $ne: true } }).sort({ createdAt: 1 });

  let calculatedBalance = 0;
  txs.forEach(tx => {
    switch (tx.type) {
      case 'saving':       calculatedBalance += tx.amount; break;
      case 'loan':         calculatedBalance -= tx.amount; break;
      case 'loan_payment':
      case 'payment':      calculatedBalance += tx.amount; break;
      case 'payout':       calculatedBalance -= tx.amount; break;
      case 'fine':         calculatedBalance += tx.amount; break;
      case 'cycle_reset':  break;
      default:             calculatedBalance += tx.amount;
    }
  });
  calculatedBalance = Math.round(calculatedBalance * 100) / 100;

  const allSavings = await Savings.find({ archived: { $ne: true } });
  const actualSavingsTotal = allSavings.reduce((sum, s) => sum + s.amount, 0);

  const allLoans = await Loan.find({ archived: { $ne: true } });
  let totalPaidOnLoans = 0;
  allLoans.forEach(loan => {
    totalPaidOnLoans += loan.installments.reduce((sum, inst) => sum + inst.paidAmount, 0);
  });

  const savingsTxTotal = txs.filter(t => t.type === 'saving').reduce((s, t) => s + t.amount, 0);
  const paymentTxTotal = txs.filter(t => t.type === 'loan_payment' || t.type === 'payment').reduce((s, t) => s + t.amount, 0);

  const recorded = balDoc?.balance || 0;
  const diff = Math.abs(recorded - calculatedBalance);

  console.log(`  Recorded balance:    K${recorded.toFixed(2)}`);
  console.log(`  Calculated balance:  K${calculatedBalance.toFixed(2)}`);
  console.log(`  Difference:          K${diff.toFixed(2)}`);
  console.log(`  Savings tx vs actual: K${savingsTxTotal} vs K${actualSavingsTotal} (${savingsTxTotal === actualSavingsTotal ? 'MATCH' : 'MISMATCH'})`);
  console.log(`  Payment tx vs actual: K${paymentTxTotal.toFixed(2)} vs K${totalPaidOnLoans.toFixed(2)} (${Math.abs(paymentTxTotal - totalPaidOnLoans) < 0.01 ? 'MATCH' : 'MISMATCH'})`);
  console.log('');

  if (diff < 0.01) {
    console.log('  RESULT: Bank balance is ACCURATE!');
  } else {
    console.log(`  RESULT: Discrepancy of K${diff.toFixed(2)} remains — investigate before proceeding.`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== fixBalanceCorrection.js — Chama360 Balance Correction ===\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  let oldBalance;
  try {
    // Step 0: backup (outside session, read-only)
    oldBalance = await backup();

    // Steps 1-3: atomic
    const session = await mongoose.startSession();
    let newBalance;
    try {
      await session.withTransaction(async () => {
        await deleteDuplicates(session);
        await fixPatriciam(session);
        ({ newBalance } = await recalculateAndSetBalance(session));
      });
    } finally {
      await session.endSession();
    }

    // Step 4: audit log (outside session so it's always visible)
    await logAuditTransaction(oldBalance, newBalance);

    // Step 5: verify
    await verify();

    console.log('=== Correction complete. ===');
  } catch (err) {
    console.error('\nFATAL — correction aborted:', err.message);
    console.error('All changes within the session have been rolled back.');
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
