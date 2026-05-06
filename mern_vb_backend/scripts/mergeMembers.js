/**
 * One-time script: merge legacy PENDING GroupMember records into the
 * newly-created active records for Farai Liwewe and Katongo Katwishi.
 *
 * What it does:
 *   1. Finds the old (PENDING, isVerified=false) record by name + old email
 *   2. Finds the new (active, isVerified=true) record by correct email
 *   3. Prints both records for manual verification
 *   4. Re-points all Saving, Loan, Fine, Transaction docs from old _id → new _id
 *   5. Soft-deletes the old record (active=false, deletedAt=now)
 *
 * Run with: node scripts/mergeMembers.js
 * Set DRY_RUN=false to commit changes: DRY_RUN=false node scripts/mergeMembers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const GroupMember = require('../models/GroupMember');
const Saving     = require('../models/Savings');
const Loan       = require('../models/Loans');
const Fine       = require('../models/Fine');
const Transaction = require('../models/Transaction');

const DRY_RUN = process.env.DRY_RUN !== 'false';

const PAIRS = [
  {
    label:    'Farai Liwewe',
    oldEmail: 'sylvialiwewe@gmail.com',
    newEmail: 'liwewesylvia@gmail.com',
  },
  {
    label:    'Katongo Katwishi',
    oldEmail: 'katongo@gmail.com',
    newEmail: 'thandiwekatwishi@gmail.com',
  },
];

async function mergePair({ label, oldEmail, newEmail }) {
  console.log(`\n── ${label} ──────────────────────────────────`);

  const oldRec = await GroupMember.findOne({ email: oldEmail, isVerified: { $ne: true } });
  const newRec = await GroupMember.findOne({ email: newEmail, isVerified: true });

  if (!oldRec) { console.log(`  ⚠️  Old record not found (${oldEmail}) — skipping`); return; }
  if (!newRec) { console.log(`  ⚠️  New record not found (${newEmail}) — skipping`); return; }

  console.log(`  OLD  _id=${oldRec._id}  name="${oldRec.name}"  email=${oldRec.email}  verified=${oldRec.isVerified}`);
  console.log(`  NEW  _id=${newRec._id}  name="${newRec.name}"  email=${newRec.email}  verified=${newRec.isVerified}`);

  const [savings, loans, fines, txns] = await Promise.all([
    Saving.countDocuments({ userId: oldRec._id }),
    Loan.countDocuments({ userId: oldRec._id }),
    Fine.countDocuments({ userId: oldRec._id }),
    Transaction.countDocuments({ userId: oldRec._id }),
  ]);

  console.log(`  Data attached to old record → Savings:${savings}  Loans:${loans}  Fines:${fines}  Transactions:${txns}`);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would re-point ${savings + loans + fines + txns} documents and soft-delete old record.`);
    return;
  }

  await Promise.all([
    Saving.updateMany({ userId: oldRec._id },      { $set: { userId: newRec._id } }),
    Loan.updateMany({ userId: oldRec._id },         { $set: { userId: newRec._id } }),
    Fine.updateMany({ userId: oldRec._id },         { $set: { userId: newRec._id } }),
    Transaction.updateMany({ userId: oldRec._id }, { $set: { userId: newRec._id } }),
  ]);

  oldRec.active    = false;
  oldRec.deletedAt = new Date();
  await oldRec.save();

  console.log(`  ✅  Merged. All data now points to new record. Old record soft-deleted.`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');
  console.log(DRY_RUN
    ? '\n⚠️  DRY RUN — no data will be changed. Set DRY_RUN=false to commit.\n'
    : '\n🔴 LIVE RUN — changes will be committed.\n'
  );

  for (const pair of PAIRS) {
    await mergePair(pair);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
