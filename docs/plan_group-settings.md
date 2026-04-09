# Plan: Build GroupSettings Model and Wire to Codebase

**Status:** Ready for implementation
**Author:** Claude Opus 4.6 (plan mode, Day 2 sprint)
**Date:** 2026-04-02
**Prerequisite:** `plan_fix-hardcoded-values.md` has been implemented — loanCalculator.js is already clean. The TODO markers in loanController.js are in place.
**Sprint priority:** Week 1 #3 (build model) + #4 (wire calculations)

---

## 1. What Is Being Built and Why

### What GroupSettings is
A Mongoose model that stores all configurable financial parameters for a village banking group: interest rates, penalty amounts, savings rules, cycle length, loan limits, and profit-sharing method. It is a **single-document-per-group** collection — one document holds all settings for one group.

### What problem it solves
Today, financial parameters are scattered as hardcoded values across 3 controllers:

- Interest rate `10%` in `loanController.js` and `savingsController.js`
- Late penalty `15%` in `loanController.js`
- Overdue fine `K1,000` in `loanController.js`
- Early payment charge `K200` in `loanController.js`
- Savings fines `K500` and savings caps `K3,000`, `K1,000`, `K5,000` in `savingsController.js`
- Default loan duration `4` months in `loanController.js`
- Loan model default interest rate `10` in `Loans.js`

When a second group signs up with different rates or rules, **every one of these values is wrong for them**. There's no way to serve two groups from the same codebase without this model.

### Why it's needed for the commercial sprint
The April sprint targets 2 paying groups. Group #2 will almost certainly have different interest rates, penalty structures, or cycle lengths. Without GroupSettings, onboarding a second group means forking the codebase or manually patching values — neither is viable for a commercial product.

---

## 2. The Schema

### File: `mern_vb_backend/models/GroupSettings.js` (NEW)

```js
const mongoose = require('mongoose');

const groupSettingsSchema = new mongoose.Schema({
  groupName: { type: String, required: true },

  // Cycle configuration
  cycleLengthMonths: {
    type: Number,
    required: true,
    enum: [6, 12],
  },

  // Loan configuration
  interestRate: {
    type: Number,
    required: true,
    min: 1,
    max: 50,
  },
  interestMethod: {
    type: String,
    required: true,
    enum: ['reducing', 'flat'],
  },
  defaultLoanDuration: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  loanLimitMultiplier: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
  },

  // Penalty configuration
  latePenaltyRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  overdueFineAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  earlyPaymentCharge: {
    type: Number,
    required: true,
    min: 0,
  },

  // Savings configuration
  savingsInterestRate: {
    type: Number,
    required: true,
    min: 0,
    max: 50,
  },
  minimumSavingsMonth1: {
    type: Number,
    required: true,
    min: 0,
  },
  minimumSavingsMonthly: {
    type: Number,
    required: true,
    min: 0,
  },
  maximumSavingsFirst3Months: {
    type: Number,
    required: true,
    min: 0,
  },
  savingsShortfallFine: {
    type: Number,
    required: true,
    min: 0,
  },

  // Profit sharing
  profitSharingMethod: {
    type: String,
    required: true,
    enum: ['proportional', 'equal'],
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

groupSettingsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('GroupSettings', groupSettingsSchema);
```

### William's group seed values

```js
{
  groupName: "Chama360 Pilot Group",
  cycleLengthMonths: 6,
  interestRate: 10,
  interestMethod: "reducing",
  defaultLoanDuration: 4,
  loanLimitMultiplier: 3,
  latePenaltyRate: 15,
  overdueFineAmount: 1000,
  earlyPaymentCharge: 200,
  savingsInterestRate: 10,
  minimumSavingsMonth1: 3000,
  minimumSavingsMonthly: 1000,
  maximumSavingsFirst3Months: 5000,
  savingsShortfallFine: 500,
  profitSharingMethod: "proportional",
}
```

These values match every hardcoded value currently in the codebase — the seed preserves exact current behaviour.

---

## 3. Files That Will Be Touched

### New files

| # | File | Purpose |
|---|------|---------|
| 1 | `models/GroupSettings.js` | Schema definition |
| 2 | `controllers/groupSettingsController.js` | CRUD + getSettings helper |
| 3 | `routes/groupSettings.js` | API routes |
| 4 | `scripts/seedGroupSettings.js` | One-time seed script |
| 5 | `tests/groupSettings.test.js` | Unit tests |

### Modified files

| # | File | What changes |
|---|------|-------------|
| 6 | `server.js` | Add `app.use('/api/group-settings', ...)` route mount |
| 7 | `controllers/loanController.js` | `createLoan`: replace `DEFAULT_DURATION` and `DEFAULT_INTEREST_RATE` with GroupSettings lookup. `repayInstallment`: replace hardcoded penalty values `0.15`, `1000`, `200` with GroupSettings lookup |
| 8 | `controllers/savingsController.js` | `createSaving` and `updateSaving`: replace hardcoded interest `0.10`, fines `500`, thresholds `3000`, `1000`, `5000` with GroupSettings lookup |
| 9 | `models/Loans.js` | Remove `default: 10` from `interestRate` field (make it required instead — the value now comes from the controller via GroupSettings) |
| 10 | `utils/loanCalculator.js` | **NO CHANGES** — already parameterized |

### Files NOT touched
- `controllers/bankBalanceController.js` — no hardcoded financial values
- `controllers/paymentController.js` — no hardcoded financial values (uses loan data, not raw rates)
- `models/Threshold.js` — separate concept (per-cycle threshold), not replaced by GroupSettings

---

## 4. Hardcoded Values to Replace — Complete Inventory

Every hardcoded financial value found in the codebase, mapped to its GroupSettings replacement:

### loanController.js

| Line(s) | Current hardcoded value | GroupSettings field | Context |
|---------|------------------------|-------------------|---------|
| 240 | `DEFAULT_DURATION = 4` | `settings.defaultLoanDuration` | Default loan term when frontend doesn't specify |
| 241 | `DEFAULT_INTEREST_RATE = 10` | `settings.interestRate` | Default interest rate for new loans |
| 350 | `0.15` (15% late penalty) | `settings.latePenaltyRate / 100` | Late installment penalty calculation |
| 357 | `1000` (K1,000 overdue fine) | `settings.overdueFineAmount` | Fine applied after full loan term expires |
| 364 | `200` (K200 early payment) | `settings.earlyPaymentCharge` | Charge for paying off entire loan early |

### savingsController.js

| Line(s) | Current hardcoded value | GroupSettings field | Context |
|---------|------------------------|-------------------|---------|
| 28 | `0.10` (10% savings interest) | `settings.savingsInterestRate / 100` | Interest earned on savings deposits |
| 31 | `3000` (K3,000 month-1 minimum) | `settings.minimumSavingsMonth1` | Minimum first-month savings |
| 31, 32 | `500` (K500 fine) | `settings.savingsShortfallFine` | Fine for under-saving |
| 32 | `1000` (K1,000 monthly minimum) | `settings.minimumSavingsMonthly` | Minimum monthly savings (month 2+) |
| 33 | `5000` (K5,000 cap) | `settings.maximumSavingsFirst3Months` | Max savings in first 3 months |
| 110 | `0.10` (duplicate of line 28) | `settings.savingsInterestRate / 100` | Same calculation in `updateSaving` |
| 113 | `3000` (duplicate of line 31) | `settings.minimumSavingsMonth1` | Same check in `updateSaving` |
| 113, 114 | `500` (duplicate) | `settings.savingsShortfallFine` | Same fine in `updateSaving` |
| 114 | `1000` (duplicate of line 32) | `settings.minimumSavingsMonthly` | Same check in `updateSaving` |
| 115 | `5000` (duplicate of line 33) | `settings.maximumSavingsFirst3Months` | Same cap in `updateSaving` |

### models/Loans.js

| Line | Current hardcoded value | Change |
|------|------------------------|--------|
| 7 | `default: 10` on interestRate | Remove default, add `required: true` |

**Total: 17 hardcoded values across 3 files, all mapped to 11 GroupSettings fields.**

---

## 5. Implementation Order

### Step 1: Create the GroupSettings model
Create `mern_vb_backend/models/GroupSettings.js` with the exact schema from Section 2.

### Step 2: Create the GroupSettings controller
Create `mern_vb_backend/controllers/groupSettingsController.js`:

```js
const GroupSettings = require('../models/GroupSettings');

// Internal helper — used by other controllers to get settings
// Returns the first GroupSettings document (single-group for now)
// Throws if no settings document exists
exports.getSettings = async () => {
  const settings = await GroupSettings.findOne();
  if (!settings) {
    throw new Error('GroupSettings not configured. Run the seed script or create settings via the API.');
  }
  return settings;
};

// GET /api/group-settings
exports.getGroupSettings = async (req, res) => {
  try {
    const settings = await GroupSettings.findOne();
    if (!settings) {
      return res.status(404).json({ error: 'Group settings not found' });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch group settings', details: err.message });
  }
};

// PUT /api/group-settings
exports.updateGroupSettings = async (req, res) => {
  try {
    let settings = await GroupSettings.findOne();
    if (!settings) {
      return res.status(404).json({ error: 'Group settings not found. Run seed script first.' });
    }

    const allowedFields = [
      'groupName', 'cycleLengthMonths', 'interestRate', 'interestMethod',
      'defaultLoanDuration', 'loanLimitMultiplier', 'latePenaltyRate',
      'overdueFineAmount', 'earlyPaymentCharge', 'savingsInterestRate',
      'minimumSavingsMonth1', 'minimumSavingsMonthly', 'maximumSavingsFirst3Months',
      'savingsShortfallFine', 'profitSharingMethod'
    ];

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        settings[key] = req.body[key];
      }
    }

    await settings.save();
    res.json({ message: 'Group settings updated', settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update group settings', details: err.message });
  }
};
```

**Key design decision:** `getSettings()` is an exported async helper that other controllers call directly — no HTTP round-trip. This is the pattern all controllers use to read settings.

### Step 3: Create the GroupSettings route
Create `mern_vb_backend/routes/groupSettings.js`:

```js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');
const groupSettingsController = require('../controllers/groupSettingsController');

// Any authenticated user can read settings
router.get('/', verifyToken, groupSettingsController.getGroupSettings);

// Only admin can update settings
router.put('/', verifyToken, authorizeRoles('admin'), groupSettingsController.updateGroupSettings);

module.exports = router;
```

**Before writing this file:** Read `middleware/roles.js` to confirm the export name is `authorizeRoles`. If it's different (e.g. `authorize`, `checkRole`), use the actual export name.

### Step 4: Mount the route in server.js
Add this line in `server.js` after the existing route mounts (after line 21):

```js
app.use('/api/group-settings', require('./routes/groupSettings'));
```

### Step 5: Create the seed script
Create `mern_vb_backend/scripts/seedGroupSettings.js`:

```js
require('dotenv').config();
const mongoose = require('mongoose');
const GroupSettings = require('../models/GroupSettings');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true }
};

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  const existing = await GroupSettings.findOne();
  if (existing) {
    console.log('GroupSettings already exists — skipping seed.');
    console.log('Current settings:', JSON.stringify(existing.toJSON(), null, 2));
    await mongoose.disconnect();
    return;
  }

  const settings = await GroupSettings.create({
    groupName: "Chama360 Pilot Group",
    cycleLengthMonths: 6,
    interestRate: 10,
    interestMethod: "reducing",
    defaultLoanDuration: 4,
    loanLimitMultiplier: 3,
    latePenaltyRate: 15,
    overdueFineAmount: 1000,
    earlyPaymentCharge: 200,
    savingsInterestRate: 10,
    minimumSavingsMonth1: 3000,
    minimumSavingsMonthly: 1000,
    maximumSavingsFirst3Months: 5000,
    savingsShortfallFine: 500,
    profitSharingMethod: "proportional",
  });

  console.log('GroupSettings seeded successfully:');
  console.log(JSON.stringify(settings.toJSON(), null, 2));
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

### Step 6: Run the seed script
```bash
cd mern_vb_backend && node scripts/seedGroupSettings.js
```
Confirm output shows the seeded document. If it says "already exists", that's fine.

### Step 7: Wire loanController.js — createLoan
In `controllers/loanController.js`:

**7a.** Add the import at the top (near other requires, after line 77):
```js
const { getSettings } = require('./groupSettingsController');
```

**7b.** In `createLoan` (starts at line 229), replace lines 239-244:
```js
    // TODO: Read these defaults from GroupSettings once it exists
    const DEFAULT_DURATION = 4;
    const DEFAULT_INTEREST_RATE = 10;

    const duration = customDuration ? Number(customDuration) : DEFAULT_DURATION;
    const appliedInterestRate = customRate !== undefined ? Number(customRate) : DEFAULT_INTEREST_RATE;
```
With:
```js
    const settings = await getSettings();

    const duration = customDuration ? Number(customDuration) : settings.defaultLoanDuration;
    const appliedInterestRate = customRate !== undefined ? Number(customRate) : settings.interestRate;
```

### Step 8: Wire loanController.js — repayInstallment
In `repayInstallment` (starts at line 329), add a settings lookup at the start of the try block (after line 331, before the user lookup):
```js
    const settings = await getSettings();
```

Then replace the three hardcoded penalty values:

**8a.** Line 350 — late penalty:
```js
// Before:
      installment.penalties.lateInterest = +(installment.total * 0.15).toFixed(2);
// After:
      installment.penalties.lateInterest = +(installment.total * (settings.latePenaltyRate / 100)).toFixed(2);
```

**8b.** Line 357 — overdue fine:
```js
// Before:
      installment.penalties.overdueFine = 1000;
// After:
      installment.penalties.overdueFine = settings.overdueFineAmount;
```

**8c.** Line 364 — early payment charge:
```js
// Before:
        installment.penalties.earlyPaymentCharge = 200;
// After:
        installment.penalties.earlyPaymentCharge = settings.earlyPaymentCharge;
```

### Step 9: Wire savingsController.js — createSaving
In `controllers/savingsController.js`:

**9a.** Add the import at the top (after line 5):
```js
const { getSettings } = require('./groupSettingsController');
```

**9b.** In `createSaving` (starts at line 17), add settings lookup at the start of the try block (after line 19, before the user lookup):
```js
    const settings = await getSettings();
```

**9c.** Replace lines 27-33:
```js
// Before:
    let fine = 0;
    let interest = +(amount * 0.10).toFixed(2);

    // Required savings check
    if (month === 1 && amount < 3000) fine = 500;
    else if (month > 1 && amount < 1000) fine = 500;
    else if (month <= 3 && amount > 5000) return res.status(400).json({ error: 'Cannot save more than K5,000 in the first 3 months' });

// After:
    let fine = 0;
    let interest = +(amount * (settings.savingsInterestRate / 100)).toFixed(2);

    // Required savings check
    if (month === 1 && amount < settings.minimumSavingsMonth1) fine = settings.savingsShortfallFine;
    else if (month > 1 && amount < settings.minimumSavingsMonthly) fine = settings.savingsShortfallFine;
    else if (month <= 3 && amount > settings.maximumSavingsFirst3Months) return res.status(400).json({ error: `Cannot save more than K${settings.maximumSavingsFirst3Months.toLocaleString()} in the first 3 months` });
```

### Step 10: Wire savingsController.js — updateSaving
In `updateSaving` (starts at line 78):

**10a.** Add settings lookup at the start of the try block (after line 87, before the saving lookup):
```js
    const settings = await getSettings();
```

**10b.** Replace lines 109-117:
```js
// Before:
      let fine = 0;
      let interest = +(amount * 0.10).toFixed(2);

      // Required savings check
      if (month === 1 && amount < 3000) fine = 500;
      else if (month > 1 && amount < 1000) fine = 500;
      else if (month <= 3 && amount > 5000) {
        return res.status(400).json({ error: 'Cannot save more than K5,000 in the first 3 months' });
      }

// After:
      let fine = 0;
      let interest = +(amount * (settings.savingsInterestRate / 100)).toFixed(2);

      // Required savings check
      if (month === 1 && amount < settings.minimumSavingsMonth1) fine = settings.savingsShortfallFine;
      else if (month > 1 && amount < settings.minimumSavingsMonthly) fine = settings.savingsShortfallFine;
      else if (month <= 3 && amount > settings.maximumSavingsFirst3Months) {
        return res.status(400).json({ error: `Cannot save more than K${settings.maximumSavingsFirst3Months.toLocaleString()} in the first 3 months` });
      }
```

### Step 11: Update Loans model
In `models/Loans.js`, line 7, change:
```js
// Before:
  interestRate: { type: Number, default: 10 }, // 10% per month
// After:
  interestRate: { type: Number, required: true },
```

### Step 12: Write tests
Create `mern_vb_backend/tests/groupSettings.test.js` (see Section 7 for full test code).

### Step 13: Run full test suite
```bash
cd mern_vb_backend && pnpm test
```
All tests must pass.

### Step 14: Run verification (see Section 8)

---

## 6. Edge Cases and Risks

### Risk 1: Missing GroupSettings document
**Scenario:** Server starts before seed script runs, or seed fails.
**Mitigation:** `getSettings()` throws a clear error: `"GroupSettings not configured. Run the seed script or create settings via the API."` Controllers that call `getSettings()` are already in try/catch blocks, so this surfaces as a 500 with a clear message.
**NOT mitigated by fallback defaults** — if settings are missing, it's a configuration error. Silent fallbacks would mask the problem and could cause wrong financial calculations for a new group.

### Risk 2: Existing loans have interestRate from the old default
**Scenario:** Existing Loan documents in MongoDB have `interestRate: 10` set by the old Mongoose default.
**Impact:** None. These values are already written to the documents. Removing the default from the schema only affects *new* documents. Existing loans keep their stored `interestRate`. The `updateLoan` recalculation already reads `loan.interestRate` from the document (line 166), so it continues to work.

### Risk 3: createLoan called without interestRate and GroupSettings has a different rate
**Expected behaviour:** This is the *point* of GroupSettings. If a group's settings say 15%, new loans without an explicit override get 15%. This is correct.
**Data consistency:** The rate used is stored on each Loan document (`interestRate` field), so the loan is self-contained after creation. Changing GroupSettings later does NOT retroactively affect existing loans.

### Risk 4: Two simultaneous requests race on getSettings()
**Impact:** None. `getSettings()` is a read-only query. Both requests get the same document. No mutation occurs.

### Risk 5: updateSaving triggers savings rules check with new settings
**Scenario:** Admin changes minimumSavingsMonthly from K1,000 to K2,000, then someone edits an old K1,500 saving.
**Behaviour:** The edit would apply the new K2,000 minimum and add a fine. This is correct — the rules should reflect current settings when re-evaluating.

### Risk 6: `authorizeRoles` export name mismatch
**Mitigation:** Step 3 includes a note to read `middleware/roles.js` and verify the exact export name before writing the route file.

---

## 7. Test Cases

### File: `mern_vb_backend/tests/groupSettings.test.js`

```js
const calculateLoanSchedule = require('../utils/loanCalculator');

describe('GroupSettings integration with loanCalculator', () => {
  // Regression: William's group settings (10% reducing) produce same results as before
  test('reducing balance at 10% matches pre-GroupSettings output', () => {
    const { schedule } = calculateLoanSchedule(10000, 4, 10);

    expect(schedule).toHaveLength(4);
    expect(schedule[0].interest).toBe(1000);   // 10000 * 0.10
    expect(schedule[1].interest).toBe(750);    // 7500 * 0.10
    expect(schedule[2].interest).toBe(500);    // 5000 * 0.10
    expect(schedule[3].interest).toBe(250);    // 2500 * 0.10
  });

  // Different group with 15% rate produces correct schedule
  test('reducing balance at 15% produces correct different schedule', () => {
    const { schedule } = calculateLoanSchedule(10000, 4, 15);

    expect(schedule).toHaveLength(4);
    expect(schedule[0].interest).toBe(1500);   // 10000 * 0.15
    expect(schedule[1].interest).toBe(1125);   // 7500 * 0.15
    expect(schedule[2].interest).toBe(750);    // 5000 * 0.15
    expect(schedule[3].interest).toBe(375);    // 2500 * 0.15
  });

  // Different group with 5% rate
  test('reducing balance at 5% produces correct schedule', () => {
    const { schedule } = calculateLoanSchedule(10000, 4, 5);

    expect(schedule).toHaveLength(4);
    expect(schedule[0].interest).toBe(500);    // 10000 * 0.05
    expect(schedule[1].interest).toBe(375);    // 7500 * 0.05
    expect(schedule[2].interest).toBe(250);    // 5000 * 0.05
    expect(schedule[3].interest).toBe(125);    // 2500 * 0.05
  });

  // Duration from GroupSettings (defaultLoanDuration = 6)
  test('6-month duration from settings produces 6 installments', () => {
    const { duration, schedule } = calculateLoanSchedule(12000, 6, 10);

    expect(duration).toBe(6);
    expect(schedule).toHaveLength(6);
    expect(schedule[0].principal).toBe(2000);
    expect(schedule[5].principal).toBe(2000);
  });
});

describe('GroupSettings schema validation', () => {
  const GroupSettings = require('../models/GroupSettings');

  test('rejects invalid interestMethod', async () => {
    const doc = new GroupSettings({
      groupName: 'Test',
      cycleLengthMonths: 6,
      interestRate: 10,
      interestMethod: 'invalid',
      defaultLoanDuration: 4,
      loanLimitMultiplier: 3,
      latePenaltyRate: 15,
      overdueFineAmount: 1000,
      earlyPaymentCharge: 200,
      savingsInterestRate: 10,
      minimumSavingsMonth1: 3000,
      minimumSavingsMonthly: 1000,
      maximumSavingsFirst3Months: 5000,
      savingsShortfallFine: 500,
      profitSharingMethod: 'proportional',
    });

    await expect(doc.validate()).rejects.toThrow();
  });

  test('rejects cycleLengthMonths not in [6, 12]', async () => {
    const doc = new GroupSettings({
      groupName: 'Test',
      cycleLengthMonths: 3,
      interestRate: 10,
      interestMethod: 'reducing',
      defaultLoanDuration: 4,
      loanLimitMultiplier: 3,
      latePenaltyRate: 15,
      overdueFineAmount: 1000,
      earlyPaymentCharge: 200,
      savingsInterestRate: 10,
      minimumSavingsMonth1: 3000,
      minimumSavingsMonthly: 1000,
      maximumSavingsFirst3Months: 5000,
      savingsShortfallFine: 500,
      profitSharingMethod: 'proportional',
    });

    await expect(doc.validate()).rejects.toThrow();
  });

  test('accepts valid William group settings', async () => {
    const doc = new GroupSettings({
      groupName: 'Chama360 Pilot Group',
      cycleLengthMonths: 6,
      interestRate: 10,
      interestMethod: 'reducing',
      defaultLoanDuration: 4,
      loanLimitMultiplier: 3,
      latePenaltyRate: 15,
      overdueFineAmount: 1000,
      earlyPaymentCharge: 200,
      savingsInterestRate: 10,
      minimumSavingsMonth1: 3000,
      minimumSavingsMonthly: 1000,
      maximumSavingsFirst3Months: 5000,
      savingsShortfallFine: 500,
      profitSharingMethod: 'proportional',
    });

    await expect(doc.validate()).resolves.toBeUndefined();
  });

  test('rejects interest rate above 50', async () => {
    const doc = new GroupSettings({
      groupName: 'Test',
      cycleLengthMonths: 6,
      interestRate: 60,
      interestMethod: 'reducing',
      defaultLoanDuration: 4,
      loanLimitMultiplier: 3,
      latePenaltyRate: 15,
      overdueFineAmount: 1000,
      earlyPaymentCharge: 200,
      savingsInterestRate: 10,
      minimumSavingsMonth1: 3000,
      minimumSavingsMonthly: 1000,
      maximumSavingsFirst3Months: 5000,
      savingsShortfallFine: 500,
      profitSharingMethod: 'proportional',
    });

    await expect(doc.validate()).rejects.toThrow();
  });
});

describe('Penalty calculations with GroupSettings values', () => {
  test('late penalty at 15% matches current hardcoded behaviour', () => {
    const installmentTotal = 3500;
    const latePenaltyRate = 15;
    const penalty = +(installmentTotal * (latePenaltyRate / 100)).toFixed(2);
    expect(penalty).toBe(525);
  });

  test('late penalty at 20% produces different correct value', () => {
    const installmentTotal = 3500;
    const latePenaltyRate = 20;
    const penalty = +(installmentTotal * (latePenaltyRate / 100)).toFixed(2);
    expect(penalty).toBe(700);
  });

  test('savings interest at 10% matches current hardcoded behaviour', () => {
    const amount = 5000;
    const savingsInterestRate = 10;
    const interest = +(amount * (savingsInterestRate / 100)).toFixed(2);
    expect(interest).toBe(500);
  });

  test('savings interest at 8% produces different correct value', () => {
    const amount = 5000;
    const savingsInterestRate = 8;
    const interest = +(amount * (savingsInterestRate / 100)).toFixed(2);
    expect(interest).toBe(400);
  });
});
```

### Note on existing tests
The existing tests in `loanSavingsController.test.js` and `reportController.test.js` use mocked data and don't hit the database. They should still pass because:
- `loanCalculator.js` signature hasn't changed since the hardcoded-values fix
- The Loan model still accepts `interestRate` (now required instead of defaulted)
- Read the existing tests before running to verify they don't create Loan documents without `interestRate` — if they do, add `interestRate: 10` to those test fixtures

---

## 8. Verification Steps

After implementation, run these exact commands in order:

### 8a. Tests
```bash
cd mern_vb_backend && pnpm test
```
**Expected:** All tests pass, including new `groupSettings.test.js`.

### 8b. Console.log sweep
```bash
grep -rn "console.log" mern_vb_backend/controllers/groupSettingsController.js mern_vb_backend/controllers/loanController.js mern_vb_backend/controllers/savingsController.js mern_vb_backend/models/GroupSettings.js
```
**Expected:** No matches. (`console.error` in catch blocks is acceptable.)

### 8c. Hardcoded financial value sweep
```bash
grep -n "0\.10\|0\.15\| 1000\b\| 500\b\| 200\b\| 3000\b\| 5000\b\|DEFAULT_DURATION\|DEFAULT_INTEREST_RATE" mern_vb_backend/controllers/loanController.js mern_vb_backend/controllers/savingsController.js
```
**Expected:** Zero matches for any raw financial values. The `DEFAULT_*` constants should be gone (replaced by `settings.*`). Matches in comments, string literals (error messages), or unrelated code (like HTTP status `500`) should be manually verified as non-financial.

### 8d. Verify getSettings is imported where needed
```bash
grep -rn "getSettings" mern_vb_backend/controllers/loanController.js mern_vb_backend/controllers/savingsController.js
```
**Expected:** At least 1 match in each file (the import line + usage).

### 8e. Verify Loans model has no default interest rate
```bash
grep -n "default.*10\|default: 10" mern_vb_backend/models/Loans.js
```
**Expected:** Zero matches.

### 8f. State the result
```
✓ Tests passed (backend)
✓ No console.log statements in modified files
✓ No hardcoded financial values in controllers
✓ getSettings imported and used in loanController.js and savingsController.js
✓ Loans model interestRate has no default
Ready to commit.
```

---

## 9. What This Plan Does NOT Cover

These are out of scope and documented for future sessions:

| Item | Why deferred |
|------|-------------|
| Flat rate interest method in loanCalculator.js | Needs a code branch in the calculator; planned for after GroupSettings is stable |
| Frontend GroupSettings admin UI | Backend-first this session; UI can be a separate PR |
| Multi-group support (groupId on settings) | Single-group is sufficient for launch; groupId can be added when auth supports multi-group |
| `interestMethod` wiring in loanCalculator.js | The schema stores it, but the calculator only does reducing balance today. Flat rate is a separate feature |
| `loanLimitMultiplier` enforcement | Schema stores it, enforcement logic TBD |
| `profitSharingMethod` wiring | Schema stores it, payout logic doesn't exist yet |
| `cycleLengthMonths` wiring | Schema stores it, cycle controller doesn't use it yet |

These fields are included in the schema now so they're ready when the features that use them are built. They will not cause errors sitting unused.

---

## Self-Assessment

**Is this plan complete enough that a fresh Claude Code session with no prior context could implement it correctly from the file alone?**

**Yes.** The plan provides:
- Complete schema with copy-pasteable code for every new file
- Every hardcoded value inventoried with file, line, and replacement expression
- Exact before/after code blocks for every modification
- Step-by-step execution order with no ambiguity
- Explicit notes on what to verify before writing (e.g., roles middleware export name)
- Complete test file with hand-calculated expected values
- Verification commands with expected outputs
- Clear scope boundaries and known limitations

A fresh session needs only to: (1) read this file, (2) verify the current code matches what's described, (3) execute Steps 1-14 in order.
