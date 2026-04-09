# Plan: Numbers Fix — Bank Balance & Transaction Correction

**Created:** 2026-04-01 (Sprint Day 1)
**Status:** Ready for implementation (Sonnet)
**Risk level:** HIGH — touches live financial data. Backup before executing.

---

## Problem Statement

The recorded bank balance (K179,622.67) does not match the transaction-calculated balance. Three root causes have been confirmed by the group treasurer:

1. **Manual setBankBalance override** — admin adjusted the balance directly to match an external bank account, bypassing the transaction trail.
2. **Patriciam K11 data entry error** — loan transaction logged as K11 instead of K11,000. Loan record was corrected to K11,000 (likely via direct DB edit), but the transaction record and bank balance debit were never fixed.
3. **Duplicate payment transactions** — during troubleshooting, multiple payment entries were created for idah and sampa that credited the bank balance multiple times for the same installment.

---

## True Correct Balance

Computed from verified source records (not the corrupted transaction trail):

```
+ Total savings deposits:           K 235,300.00
- Total loan disbursements:         K 330,500.00   (12 active loans)
+ Total installment payments:       K 115,833.67   (from actual loan.installments[].paidAmount)
+ Net fine payments:                K       0.00   (K500 paid then reversed)
- Payouts:                          K       0.00
                                    ─────────────
= TRUE BANK BALANCE:                K  20,633.67
```

Current recorded balance: K179,622.67
**Correction needed: -K158,989.00**

---

## Correction Steps

### Step 0 — Backup

Before any changes, dump the current state:

```bash
cd mern_vb_backend
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

async function backup() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Transaction = require('./models/Transaction');
  const Loan = require('./models/Loans');
  const BankBalance = require('./models/BankBalance');

  const txs = await Transaction.find({ archived: { \$ne: true } }).lean();
  const loans = await Loan.find({ archived: { \$ne: true } }).lean();
  const bal = await BankBalance.findOne().lean();

  fs.writeFileSync('backup_transactions_' + Date.now() + '.json', JSON.stringify(txs, null, 2));
  fs.writeFileSync('backup_loans_' + Date.now() + '.json', JSON.stringify(loans, null, 2));
  fs.writeFileSync('backup_balance_' + Date.now() + '.json', JSON.stringify(bal, null, 2));
  console.log('Backup complete');
  await mongoose.disconnect();
}
backup();
"
```

### Step 1 — Delete duplicate payment transactions

These 4 transactions are duplicates that credited the bank balance multiple times for the same installment payment. The bank balance was already affected at the time of creation. We delete the records so the transaction trail is clean.

**IDAH — 2 duplicates to delete (excess K35,000):**

| Transaction ID | Amount | Note | Why delete |
|---|---|---|---|
| `69848bd254ac2096922fbcd7` | K17,500 | "Feb Loan Payment-Full" | Duplicate of 69848b8f, posted 1 min later |
| `69848ead0143712773e13b02` | K17,500 | "Feb Loan Payment-Full" | Duplicate of 69848b8f, posted 12 min later |

After deletion, idah's remaining loan_payment transactions:
- K17,500 (original) + K-17,500 (reversal) + K17,500 (re-post) + K16,250 (March) = K33,750 net
- Matches installments: Month 1 K17,500 + Month 2 K16,250 = K33,750

**SAMPA — 2 duplicates to delete (excess K28,000):**

| Transaction ID | Amount | Note | Why delete |
|---|---|---|---|
| `69849b9585d07cfa4cd0b5cb` | K14,000 | "Feb Loan Payment-Full" | Duplicate of 698494096, posted 32 min later |
| `69849eca85d07cfa4cd0b688` | K14,000 | "Payment for 1 installment(s)" | Duplicate of 698494096, posted 46 min later |

After deletion, sampa's remaining loan_payment transactions:
- K14,000 + K14,000 + K11,000 + K-12,000 + K-13,000 + K13,000 = K27,000 net
- Matches installments: Month 1 K14,000 + Month 2 K13,000 = K27,000

**Code to execute:**

```javascript
// In the correction script:
const duplicateIds = [
  '69848bd254ac2096922fbcd7',  // idah dup
  '69848ead0143712773e13b02',  // idah dup
  '69849b9585d07cfa4cd0b5cb',  // sampa dup
  '69849eca85d07cfa4cd0b688',  // sampa dup
];
const result = await Transaction.deleteMany({
  _id: { $in: duplicateIds.map(id => new mongoose.Types.ObjectId(id)) }
});
console.log('Deleted ' + result.deletedCount + ' duplicate transactions');
// MUST be exactly 4
```

### Step 2 — Fix patriciam K11 transaction

The transaction at ID `69637bb667c6d49b9d295b10` has amount=11 but should be 11000.

The loan record already shows K11,000 (was corrected separately). The bank balance was only debited K11 at loan creation time. The remaining K10,989 was never debited.

```javascript
const tx11 = await Transaction.findById('69637bb667c6d49b9d295b10');
if (tx11 && tx11.amount === 11) {
  tx11.amount = 11000;
  tx11.note = 'Loan of K11000 created. [Corrected from K11 — data entry error]';
  await tx11.save();
  console.log('Fixed patriciam transaction: K11 -> K11000');
}
```

### Step 3 — Set bank balance to corrected value

After Step 1 and Step 2, recalculate the balance from the corrected transaction trail. Then set the bank balance to match.

```javascript
// Recalculate from corrected transactions
const txs = await Transaction.find({ archived: { $ne: true } }).sort({ createdAt: 1 });
let calculatedBalance = 0;
txs.forEach(tx => {
  switch(tx.type) {
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
console.log('Recalculated balance: K' + calculatedBalance.toFixed(2));
// EXPECTED: K20,633.67

// Set the bank balance
const balDoc = await BankBalance.findOne();
const oldBalance = balDoc.balance;
balDoc.balance = Math.round(calculatedBalance * 100) / 100;
await balDoc.save();
console.log('Bank balance corrected: K' + oldBalance + ' -> K' + balDoc.balance);
```

### Step 4 — Log an audit transaction

Create a special transaction documenting this correction so the audit trail explains the change.

```javascript
// Use the admin user for the audit transaction
const adminUser = await User.findOne({ role: 'admin' });

await Transaction.create({
  userId: adminUser._id,
  type: 'cycle_reset',  // closest available type for admin operations
  amount: 0,
  note: 'BALANCE CORRECTION (2026-04-01): Removed 4 duplicate payment transactions (idah 2x K17500, sampa 2x K14000 = K63000 excess). Fixed patriciam loan transaction K11 -> K11000. Reset bank balance from K179622.67 to calculated K20633.67. Correction = -K158989.00. See docs/plan_numbers_fix.md for full audit.',
});
console.log('Audit transaction logged');
```

### Step 5 — Verify

Re-run the audit script:

```bash
cd mern_vb_backend && node scripts/auditBankBalance.js
```

**Expected results:**
- Recorded balance = K20,633.67
- Calculated balance = K20,633.67
- Difference = K0.00
- Transaction Savings vs Actual Savings: MATCH
- Transaction Loan Payments vs Actual Payments: MATCH (both K115,833.67)
- Output: "Bank balance is ACCURATE!"

---

## Implementation

Create a single script at `mern_vb_backend/scripts/fixBalanceCorrection.js` that executes Steps 0-4 in a single run. The script must:

1. Connect to MongoDB
2. Perform the backup (Step 0)
3. Execute Steps 1-4 sequentially, logging each action
4. Run the verification calculation (Step 5) inline
5. Print a summary showing before/after values
6. Disconnect

The script should use a MongoDB session for Steps 1-3 so they're atomic. If any step fails, all changes roll back.

---

## Post-Fix Actions

1. **Disable setBankBalance for production** — this endpoint bypasses the transaction trail and caused the primary discrepancy. Either remove the route or gate it behind a confirmation that also logs a Transaction record.

2. **Future-proof**: When GroupSettings is built (Week 1 Priority 3), the settings model should NOT affect this correction. The correction is about historical data integrity, not calculation logic.

3. **Re-run audit weekly** during the sprint to catch any new discrepancies early.

---

## Transaction IDs Reference

| ID | User | Type | Amount | Action |
|---|---|---|---|---|
| `69848bd254ac2096922fbcd7` | idah | loan_payment | K17,500 | DELETE (duplicate) |
| `69848ead0143712773e13b02` | idah | loan_payment | K17,500 | DELETE (duplicate) |
| `69849b9585d07cfa4cd0b5cb` | sampa | loan_payment | K14,000 | DELETE (duplicate) |
| `69849eca85d07cfa4cd0b688` | sampa | loan_payment | K14,000 | DELETE (duplicate) |
| `69637bb667c6d49b9d295b10` | patriciam | loan | K11 | FIX to K11,000 |
