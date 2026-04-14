# Plan: Wire GroupSettings into Calculations (Day 3)

## Context

GroupSettings schema is built and seeded. Controllers already call `getSettings()` for most values. But two critical gaps remain:

1. **`loanCalculator.js` ignores `interestMethod`** — it only implements reducing balance. The `interestMethod` field exists in GroupSettings (`"reducing"` | `"flat"`) but is never read or passed to the calculator.
2. **`loanLimitMultiplier` is not enforced** — the field exists in GroupSettings (seeded as `3`) but `createLoan()` never checks `amount <= savings × multiplier`.

### What's Already Done (no work needed)
- `DEFAULT_DURATION` and `DEFAULT_INTEREST_RATE` constants are gone — replaced by `settings.defaultLoanDuration` and `settings.interestRate` in `createLoan()` (line 242-243).
- Fine/penalty logic in `repayInstallment()` already reads `settings.latePenaltyRate`, `settings.overdueFineAmount`, `settings.earlyPaymentCharge` (lines 351-366).
- `savingsController.js` already reads all savings-related settings.
- No `// TODO: GroupSettings` markers remain.

---

## Changes Required

### Change 1: Add `interestMethod` to `loanCalculator.js`

**File:** `mern_vb_backend/utils/loanCalculator.js`

**Current signature (line 1):**
```js
function calculateLoanSchedule(amount, duration, interestRate)
```

**New signature:**
```js
function calculateLoanSchedule(amount, duration, interestRate, interestMethod = 'reducing')
```

**Current logic (lines 6-21):** Only reducing balance — `interest = principalBalance * (interestRate / 100)` where `principalBalance` decreases each month.

**Add flat rate branch.** Replace the interest calculation inside the loop:

```js
for (let month = 1; month <= duration; month++) {
  let interest;
  if (interestMethod === 'flat') {
    // Flat: interest on ORIGINAL amount every installment
    interest = +(amount * (interestRate / 100)).toFixed(2);
  } else {
    // Reducing: interest on remaining balance
    interest = +(principalBalance * (interestRate / 100)).toFixed(2);
  }
  const total = +(installmentPrincipal + interest).toFixed(2);
  // ... rest unchanged
```

**Why this is correct:** Flat rate charges `amount * rate` every month (not `principalBalance * rate`). The principal repayment schedule stays the same — only the interest portion changes.

---

### Change 2: Pass `interestMethod` from `createLoan()`

**File:** `mern_vb_backend/controllers/loanController.js`

**Location:** `createLoan()` function, line 245

**Current:**
```js
const { schedule } = calculateLoanSchedule(amount, duration, appliedInterestRate);
```

**New:**
```js
const { schedule } = calculateLoanSchedule(amount, duration, appliedInterestRate, settings.interestMethod);
```

Also store `interestMethod` on the loan document (line 247-253):
```js
const loan = new Loan({
  userId,
  amount,
  durationMonths: duration,
  interestRate: appliedInterestRate,
  interestMethod: settings.interestMethod,  // ADD THIS
  installments: schedule
});
```

**Requires:** Add `interestMethod` field to the Loan schema.

---

### Change 3: Pass `interestMethod` from `updateLoan()`

**File:** `mern_vb_backend/controllers/loanController.js`

**Location:** Line 200 (inside updateLoan, the recalculate branch)

**Current:**
```js
const { schedule } = calculateLoanSchedule(finalAmount, finalDuration, loan.interestRate);
```

**New:**
```js
const { schedule } = calculateLoanSchedule(finalAmount, finalDuration, loan.interestRate, loan.interestMethod || 'reducing');
```

Uses the loan's stored `interestMethod` so recalculation matches the original method. Falls back to `'reducing'` for loans created before this change.

---

### Change 4: Add `interestMethod` to Loan schema

**File:** `mern_vb_backend/models/Loans.js`

Add field to the schema:
```js
interestMethod: {
  type: String,
  enum: ['reducing', 'flat'],
  default: 'reducing'
}
```

`default: 'reducing'` ensures backward compatibility with existing loans.

---

### Change 5: Enforce `loanLimitMultiplier` in `createLoan()`

**File:** `mern_vb_backend/controllers/loanController.js`

**Location:** Inside `createLoan()`, after line 243 (after settings are fetched), before calling `calculateLoanSchedule()`.

**Add:**
```js
// Enforce loan limit: amount cannot exceed savings × multiplier
const Savings = require('../models/Savings');  // or use existing import
const totalSavings = await Savings.aggregate([
  { $match: { userId, archived: { $ne: true } } },
  { $group: { _id: null, total: { $sum: '$amount' } } }
]);
const memberSavings = totalSavings[0]?.total || 0;
const maxLoan = memberSavings * settings.loanLimitMultiplier;

if (amount > maxLoan) {
  return res.status(400).json({
    error: `Loan amount K${amount} exceeds limit of K${maxLoan} (${settings.loanLimitMultiplier}× savings of K${memberSavings})`
  });
}
```

**Check if Savings model is already imported** at the top of loanController.js. If not, add the require.

**Note:** This only blocks new loans. Existing loans over the limit are grandfathered.

---

## Files to Modify (summary)

| # | File | What |
|---|------|------|
| 1 | `mern_vb_backend/utils/loanCalculator.js` | Add `interestMethod` param + flat branch |
| 2 | `mern_vb_backend/models/Loans.js` | Add `interestMethod` field |
| 3 | `mern_vb_backend/controllers/loanController.js` | Pass `interestMethod` in createLoan + updateLoan, add loan limit check |

No changes needed to: `savingsController.js`, `paymentController.js`, `groupSettingsController.js`, `GroupSettings.js`.

---

## Verification

### 1. Run existing tests
```bash
cd mern_vb_backend && pnpm test
```

### 2. Manual test: flat vs reducing comparison
Create two loans with the same params but different `interestMethod` on the seeded GroupSettings:

**Test case — K1000, 4 months, 10% rate:**

| Month | Reducing Interest | Flat Interest |
|-------|-------------------|---------------|
| 1 | K1000 × 10% = K100 | K1000 × 10% = K100 |
| 2 | K750 × 10% = K75 | K1000 × 10% = K100 |
| 3 | K500 × 10% = K50 | K1000 × 10% = K100 |
| 4 | K250 × 10% = K25 | K1000 × 10% = K100 |
| **Total interest** | **K250** | **K400** |

Verify the calculator output matches these numbers.

### 3. Loan limit test
With `loanLimitMultiplier: 3` and a member with K500 total savings:
- `createLoan(K1500)` → should succeed (exactly 3×)
- `createLoan(K1501)` → should fail with limit error

### 4. Backward compatibility
Existing loans (no `interestMethod` field) should still work — `default: 'reducing'` in schema + `|| 'reducing'` fallback in updateLoan.

### 5. Full verification loop per CLAUDE.md
```bash
cd mern_vb_backend && pnpm test
node scripts/auditBankBalance.js
```
Confirm no balance discrepancy. Confirm no console.log statements. Confirm no hardcoded financial values.

---

## Out of Scope
- The `lateFineAmount`/`lateFineType` fields from CLAUDE.md's draft spec — the actual schema uses `latePenaltyRate`, `overdueFineAmount`, `earlyPaymentCharge` instead, and these are **already wired**.
- The `DEFAULT_DURATION`/`DEFAULT_INTEREST_RATE` constants — **already removed** in a previous session.
- Threshold model — separate concern (forced borrowing), parked per CLAUDE.md.

---

This plan is self-contained. A fresh session can implement it from this file alone.
