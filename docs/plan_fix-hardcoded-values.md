# Plan: Remove Hardcoded Financial Values from loanCalculator.js

**Status:** Ready for implementation
**Author:** Claude Opus 4.6 (plan mode, Day 2 sprint)
**Date:** 2026-04-02
**Implements:** Sprint Week 1 Priority #4 (partial — calculator cleanup)

---

## 1. What Is Being Fixed and Why

### The problem
`utils/loanCalculator.js` contains three hardcoded financial values:

| Line | Value | What it controls |
|------|-------|-----------------|
| 2 | `1` (default duration) | Fallback loan duration when no custom value is passed |
| 4-6 | `20000`, `5000`, `2000` | Amount thresholds that auto-assign duration |
| 14 | `0.10` (10%) | Interest rate used for every installment calculation |

### Why this matters
The GroupSettings model (to be built next session) will allow each group to configure their own interest rate, loan structure, and cycle parameters. If these values stay hardcoded in the calculator:

- **A second group with 15% interest** would silently get 10% — wrong balances, wrong reports, legal liability.
- **A group without amount-based duration thresholds** (e.g. they always specify duration manually) would get unexpected auto-durations for loans where the frontend doesn't pass one.
- **The calculator becomes untestable** for multi-group scenarios because the function signature doesn't accept the values it depends on.

### Scope of this plan
This plan fixes **only `loanCalculator.js` and its direct callers**. It does NOT:
- Build the GroupSettings model (next session)
- Fix hardcoded penalties in `repayInstallment` (lines 358, 365, 372 in loanController.js) — separate plan
- Fix hardcoded interest in `savingsController.js` (lines 28, 110) — separate plan

Those are logged here as known issues but are out of scope for this change.

---

## 2. Current Behaviour — Exactly What Each Hardcoded Value Does

### Line 2: Default duration = 1

```js
let duration = customDuration || 1;
```

When `customDuration` is `null` (not passed by caller), the initial value is `1`. But this is immediately overridden by the threshold logic on lines 4-6 if `customDuration === null`. The `1` only survives as the final duration if the amount is ≤ 2000 AND no custom duration was passed.

**Who calls without customDuration?**
- `createLoan` (loanController.js:240) passes `parsedDuration` which is `null` when `req.body.duration` is absent.
- `updateLoan` (loanController.js:199) passes `finalDuration` which is always a number (read from `loan.durationMonths`).

So the default-1 path is reachable: if the frontend creates a loan for ≤ K2,000 without specifying duration, the loan gets 1 month.

### Lines 4-6: Amount-based duration thresholds

```js
if (customDuration === null) {
    if (amount > 20000) duration = 4;
    else if (amount > 5000) duration = 3;
    else if (amount > 2000) duration = 2;
}
```

This is a fallback: when the caller does NOT provide a custom duration, the calculator picks duration based on loan size. The logic:
- amount > K20,000 → 4 months
- amount > K5,000 → 3 months
- amount > K2,000 → 2 months
- amount ≤ K2,000 → 1 month (the default from line 2)

**Is customDuration always passed?**

Examined `createLoan` (loanController.js:229-240):
```js
const { username, amount, duration: customDuration, interestRate } = req.body;
const parsedDuration = customDuration ? Number(customDuration) : null;
const { duration, schedule } = calculateLoanSchedule(amount, parsedDuration);
```

`customDuration` comes from `req.body.duration`. If the frontend does not send `duration`, `parsedDuration` is `null`, and the threshold logic activates.

**Frontend check required?** Not for this plan. The backend must be defensive — we cannot assume the frontend will always send duration. Whether it does today is irrelevant; the backend API contract allows it to be optional.

### Line 14: Hardcoded interest rate 0.10

```js
const interest = +(principalBalance * 0.10).toFixed(2);
```

This is the core calculation. Every installment's interest is computed as 10% of the remaining principal balance. This value:
- Is never read from the function arguments
- Is never read from the Loan model's `interestRate` field
- Cannot be overridden by the caller

Note: `createLoan` (loanController.js:244-254) works around this by recalculating the schedule AFTER calling `calculateLoanSchedule` if a custom interest rate is provided. This is a code smell — the calculator should accept the rate directly instead of the caller patching its output.

---

## 3. Decision on Lines 4-6: KEEP or REMOVE Threshold Logic

### Analysis

The threshold logic serves as a convenience: if a user (or frontend) creates a loan without specifying a duration, the system picks a reasonable one based on loan size. This is:
- **Currently reachable** — `createLoan` passes `null` when `req.body.duration` is absent
- **William's group specific** — the threshold amounts (K2,000, K5,000, K20,000) and resulting durations (1-4 months) reflect William's group's norms, not universal rules
- **Not stored anywhere configurable** — these are baked into the function

### Decision: REMOVE the threshold logic from loanCalculator.js

**Reasoning:**

1. **The thresholds are group-specific policy**, not calculation logic. They belong in a policy layer (GroupSettings or controller), not in a pure math function.

2. **The calculator's job is math**: given an amount, duration, and rate, produce a schedule. Deciding what the duration should be is a business rule that sits above the calculator.

3. **Keeping thresholds in the calculator** means the function does two things (pick duration + calculate schedule), violating single responsibility. It also means GroupSettings would need a complex `durationThresholds` array structure instead of the controller just requiring duration to be present.

4. **The frontend already has a duration field** on the loan creation form. If duration is missing, the controller should either reject the request or apply a default — not delegate that decision to a math utility.

### Migration path

- `calculateLoanSchedule` will **require** `duration` as a parameter (no more auto-calculation)
- `createLoan` in loanController.js will be updated: if `req.body.duration` is missing, apply a default duration at the controller level (hardcoded there temporarily, moved to GroupSettings next session)
- The default duration at the controller level will be `4` months (the most common loan term in William's group for amounts in the typical range)

---

## 4. The Fix — Parameter by Parameter

### 4a. Interest rate (line 14): `0.10` → function parameter

**Current:** hardcoded `0.10` inside the function
**Fix:** accept `interestRate` as a parameter (as a percentage number, e.g. `10`)
**Inside the function:** use `interestRate / 100` where `0.10` currently is

### 4b. Duration (line 2 + lines 4-6): threshold logic → required parameter

**Current:** `customDuration` is optional; threshold logic fills it in
**Fix:** `duration` becomes a required parameter. No threshold logic. No default.
**Caller responsibility:** controllers must always pass a valid duration

### 4c. Updated function signature

**Before:**
```js
function calculateLoanSchedule(amount, customDuration = null)
```

**After:**
```js
function calculateLoanSchedule(amount, duration, interestRate)
```

All three parameters are required. No defaults. The calculator is now a pure math function.

### 4d. Updated function body

```js
function calculateLoanSchedule(amount, duration, interestRate) {
  const installmentPrincipal = +(amount / duration).toFixed(2);
  const schedule = [];
  let principalBalance = amount;

  for (let month = 1; month <= duration; month++) {
    const interest = +(principalBalance * (interestRate / 100)).toFixed(2);
    const total = +(installmentPrincipal + interest).toFixed(2);
    schedule.push({
      month,
      principal: installmentPrincipal,
      interest,
      total,
      paid: false,
      penalties: {
        lateInterest: 0,
        overdueFine: 0,
        earlyPaymentCharge: 0
      }
    });
    principalBalance -= installmentPrincipal;
  }

  return { duration, schedule };
}

module.exports = calculateLoanSchedule;
```

**Changes from current:**
- Removed `customDuration = null` default
- Removed lines 2-7 (threshold logic + default)
- Added `interestRate` parameter
- Line 14: `0.10` replaced with `interestRate / 100`
- Return value unchanged: `{ duration, schedule }`

---

## 5. Controller Updates

### 5a. `createLoan` (loanController.js:229-277)

**Current behaviour (lines 239-254):**
1. Calls `calculateLoanSchedule(amount, parsedDuration)` — parsedDuration may be null
2. Gets back `{ duration, schedule }`
3. If interestRate was provided and isn't 10, re-calculates the entire schedule manually (lines 244-254)

**New behaviour:**
1. Determine `duration`: use `req.body.duration` if provided, otherwise default to `4` (temporary hardcode at controller level)
2. Determine `interestRate`: use `req.body.interestRate` if provided, otherwise default to `10` (temporary hardcode at controller level)
3. Call `calculateLoanSchedule(amount, duration, interestRate)` — one call, correct schedule
4. **Delete the post-hoc recalculation block** (lines 243-254) — no longer needed since the calculator now accepts the rate directly

**Updated code block:**
```js
exports.createLoan = async (req, res) => {
  const { username, amount, duration: customDuration, interestRate: customRate } = req.body;
  if (!username || !amount) return res.status(400).json({ error: 'Missing fields' });

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    const userId = user._id;

    // TODO: Read these from GroupSettings once it exists
    const DEFAULT_DURATION = 4;
    const DEFAULT_INTEREST_RATE = 10;

    const duration = customDuration ? Number(customDuration) : DEFAULT_DURATION;
    const appliedInterestRate = customRate !== undefined ? Number(customRate) : DEFAULT_INTEREST_RATE;

    const { schedule } = calculateLoanSchedule(amount, duration, appliedInterestRate);

    const loan = new Loan({
      userId,
      amount,
      durationMonths: duration,
      interestRate: appliedInterestRate,
      installments: schedule
    });

    await loan.save();
    // ... rest unchanged (logTransaction, updateBankBalance, response)
```

**Key changes:**
- Threshold logic is gone — `DEFAULT_DURATION` replaces it temporarily
- `calculateLoanSchedule` called with all 3 params
- Post-hoc recalculation block (old lines 243-254) is deleted entirely
- Clear `TODO` comment marks what moves to GroupSettings

### 5b. `updateLoan` (loanController.js:197-202)

**Current (line 199):**
```js
const { schedule } = calculateLoanSchedule(finalAmount, finalDuration);
```

This is inside the `!repaymentsStarted` branch where the entire schedule is recalculated.

**New:**
```js
const { schedule } = calculateLoanSchedule(finalAmount, finalDuration, loan.interestRate);
```

The loan already has `interestRate` stored on it (from when it was created). Pass it through. No temporary default needed — the loan document is the source of truth here.

### 5c. `updateLoan` inline recalculation (loanController.js:162-172)

**Current (line 166):**
```js
const interest = +(principalBalance * (loan.interestRate / 100)).toFixed(2);
```

This line is ALREADY correct — it reads from `loan.interestRate`, not a hardcoded value. **No change needed.**

---

## 6. GroupSettings Dependency — Temporary vs Permanent Layer

### Temporary state (after this fix, before GroupSettings)

| Value | Where it lives temporarily | Line |
|-------|--------------------------|------|
| Default interest rate (10%) | `createLoan` in loanController.js | `const DEFAULT_INTEREST_RATE = 10;` |
| Default duration (4 months) | `createLoan` in loanController.js | `const DEFAULT_DURATION = 4;` |

Both marked with `// TODO: Read these from GroupSettings once it exists`.

### What changes when GroupSettings is wired (next session)

1. Replace the `const DEFAULT_*` lines with a GroupSettings lookup:
   ```js
   const settings = await GroupSettings.findOne({ /* group context */ });
   const DEFAULT_DURATION = settings.defaultLoanDuration;
   const DEFAULT_INTEREST_RATE = settings.interestRate;
   ```
2. The `calculateLoanSchedule` function signature and body do NOT change — it's already clean.
3. The Loan model's `interestRate` field `default: 10` (Loans.js:7) should have its default removed or set dynamically — but that's a GroupSettings task, not this one.

### What this fix guarantees
- `loanCalculator.js` has **zero hardcoded financial values**
- The calculator is a **pure function**: same inputs → same outputs, no hidden state
- All financial policy decisions are made at the **controller level**, where GroupSettings will plug in naturally

---

## 7. Files That Will Be Touched

### File 1: `mern_vb_backend/utils/loanCalculator.js`
- **Complete rewrite** (34 lines → ~28 lines)
- New signature: `function calculateLoanSchedule(amount, duration, interestRate)`
- Remove threshold logic (old lines 2-7)
- Replace `0.10` with `interestRate / 100` (old line 14)

### File 2: `mern_vb_backend/controllers/loanController.js`
- **`createLoan` function (lines 229-277):**
  - Add `DEFAULT_DURATION = 4` and `DEFAULT_INTEREST_RATE = 10` constants with TODO comments
  - Change duration resolution: `customDuration ? Number(customDuration) : DEFAULT_DURATION`
  - Change rate resolution: `customRate !== undefined ? Number(customRate) : DEFAULT_INTEREST_RATE`
  - Update `calculateLoanSchedule` call to pass 3 args
  - **Delete lines 243-254** (the post-hoc recalculation block)
- **`updateLoan` function (line 199):**
  - Update `calculateLoanSchedule` call: add `loan.interestRate` as third argument

### File 3: `mern_vb_backend/tests/loanCalculator.test.js` (NEW FILE)
- Unit tests for the updated `calculateLoanSchedule` function

### Files NOT touched
- `paymentController.js` — does not call `calculateLoanSchedule`
- `models/Loans.js` — `default: 10` stays for now (GroupSettings task)
- `savingsController.js` — hardcoded `0.10` there is a separate issue
- `loanController.js repayInstallment` — penalty hardcodes (lines 358, 365, 372) are a separate issue

---

## 8. Implementation Order

Sonnet executes these steps in exact sequence:

### Step 1: Read current files
Read `utils/loanCalculator.js` and `controllers/loanController.js` in full to confirm they match what this plan describes. If they don't match, stop and re-assess.

### Step 2: Rewrite `utils/loanCalculator.js`
Replace the entire file contents with:
```js
function calculateLoanSchedule(amount, duration, interestRate) {
  const installmentPrincipal = +(amount / duration).toFixed(2);
  const schedule = [];
  let principalBalance = amount;

  for (let month = 1; month <= duration; month++) {
    const interest = +(principalBalance * (interestRate / 100)).toFixed(2);
    const total = +(installmentPrincipal + interest).toFixed(2);
    schedule.push({
      month,
      principal: installmentPrincipal,
      interest,
      total,
      paid: false,
      penalties: {
        lateInterest: 0,
        overdueFine: 0,
        earlyPaymentCharge: 0
      }
    });
    principalBalance -= installmentPrincipal;
  }

  return { duration, schedule };
}

module.exports = calculateLoanSchedule;
```

### Step 3: Update `createLoan` in loanController.js
Edit the `createLoan` function (starts at line 229). Make these specific changes:

**3a.** Change destructuring (line 230):
```js
// Before:
const { username, amount, duration: customDuration, interestRate } = req.body;
// After:
const { username, amount, duration: customDuration, interestRate: customRate } = req.body;
```

**3b.** Replace lines 239-254 (from `const parsedDuration` through end of recalculation block) with:
```js
    // TODO: Read these defaults from GroupSettings once it exists
    const DEFAULT_DURATION = 4;
    const DEFAULT_INTEREST_RATE = 10;

    const duration = customDuration ? Number(customDuration) : DEFAULT_DURATION;
    const appliedInterestRate = customRate !== undefined ? Number(customRate) : DEFAULT_INTEREST_RATE;

    const { schedule } = calculateLoanSchedule(amount, duration, appliedInterestRate);
```

**3c.** Update the Loan constructor (was at line 256, will shift):
```js
    const loan = new Loan({
      userId,
      amount,
      durationMonths: duration,
      interestRate: appliedInterestRate,
      installments: schedule
    });
```
This should already match — verify and leave as-is if correct.

### Step 4: Update `updateLoan` in loanController.js
Find line 199:
```js
const { schedule } = calculateLoanSchedule(finalAmount, finalDuration);
```
Change to:
```js
const { schedule } = calculateLoanSchedule(finalAmount, finalDuration, loan.interestRate);
```

### Step 5: Create test file `mern_vb_backend/tests/loanCalculator.test.js`
Write the tests specified in Section 8 below.

### Step 6: Run the full test suite
```bash
cd mern_vb_backend && pnpm test
```
All tests must pass. If any fail, fix before proceeding.

### Step 7: Run verification steps (Section 9)

---

## 8. Test Cases to Write

Create `mern_vb_backend/tests/loanCalculator.test.js`:

```js
const calculateLoanSchedule = require('../utils/loanCalculator');

describe('calculateLoanSchedule', () => {
  // REGRESSION: William's group uses 10% reducing balance.
  // This test ensures the refactor produces identical output to the old code.
  test('10% interest, 4 months — matches pre-refactor output', () => {
    const { duration, schedule } = calculateLoanSchedule(10000, 4, 10);

    expect(duration).toBe(4);
    expect(schedule).toHaveLength(4);

    // Month 1: principal=2500, interest=10000*0.10=1000, total=3500
    expect(schedule[0].principal).toBe(2500);
    expect(schedule[0].interest).toBe(1000);
    expect(schedule[0].total).toBe(3500);

    // Month 2: principal=2500, interest=7500*0.10=750, total=3250
    expect(schedule[1].principal).toBe(2500);
    expect(schedule[1].interest).toBe(750);
    expect(schedule[1].total).toBe(3250);

    // Month 3: principal=2500, interest=5000*0.10=500, total=3000
    expect(schedule[2].principal).toBe(2500);
    expect(schedule[2].interest).toBe(500);
    expect(schedule[2].total).toBe(3000);

    // Month 4: principal=2500, interest=2500*0.10=250, total=2750
    expect(schedule[3].principal).toBe(2500);
    expect(schedule[3].interest).toBe(250);
    expect(schedule[3].total).toBe(2750);
  });

  // PROVES PARAMETERIZATION: different rate produces different schedule
  test('15% interest rate produces correct different schedule', () => {
    const { duration, schedule } = calculateLoanSchedule(10000, 4, 15);

    expect(duration).toBe(4);
    expect(schedule).toHaveLength(4);

    // Month 1: principal=2500, interest=10000*0.15=1500, total=4000
    expect(schedule[0].principal).toBe(2500);
    expect(schedule[0].interest).toBe(1500);
    expect(schedule[0].total).toBe(4000);

    // Month 2: principal=2500, interest=7500*0.15=1125, total=3625
    expect(schedule[1].principal).toBe(2500);
    expect(schedule[1].interest).toBe(1125);
    expect(schedule[1].total).toBe(3625);

    // Month 3: principal=2500, interest=5000*0.15=750, total=3250
    expect(schedule[2].principal).toBe(2500);
    expect(schedule[2].interest).toBe(750);
    expect(schedule[2].total).toBe(3250);

    // Month 4: principal=2500, interest=2500*0.15=375, total=2875
    expect(schedule[3].principal).toBe(2500);
    expect(schedule[3].interest).toBe(375);
    expect(schedule[3].total).toBe(2875);
  });

  // DURATION PARAMETERIZATION: different duration changes installment count and amounts
  test('custom duration of 2 months splits principal correctly', () => {
    const { duration, schedule } = calculateLoanSchedule(10000, 2, 10);

    expect(duration).toBe(2);
    expect(schedule).toHaveLength(2);

    // Month 1: principal=5000, interest=10000*0.10=1000, total=6000
    expect(schedule[0].principal).toBe(5000);
    expect(schedule[0].interest).toBe(1000);
    expect(schedule[0].total).toBe(6000);

    // Month 2: principal=5000, interest=5000*0.10=500, total=5500
    expect(schedule[1].principal).toBe(5000);
    expect(schedule[1].interest).toBe(500);
    expect(schedule[1].total).toBe(5500);
  });

  // REDUCING BALANCE PROOF: interest decreases each month
  test('interest decreases each month (reducing balance)', () => {
    const { schedule } = calculateLoanSchedule(20000, 4, 10);

    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].interest).toBeLessThan(schedule[i - 1].interest);
    }
  });

  // STRUCTURE: all installments have correct shape
  test('each installment has correct structure', () => {
    const { schedule } = calculateLoanSchedule(5000, 3, 10);

    schedule.forEach((inst, i) => {
      expect(inst.month).toBe(i + 1);
      expect(inst.paid).toBe(false);
      expect(inst.penalties).toEqual({
        lateInterest: 0,
        overdueFine: 0,
        earlyPaymentCharge: 0
      });
      expect(typeof inst.principal).toBe('number');
      expect(typeof inst.interest).toBe('number');
      expect(typeof inst.total).toBe('number');
    });
  });

  // SINGLE MONTH LOAN
  test('1 month loan — full amount in single installment', () => {
    const { duration, schedule } = calculateLoanSchedule(3000, 1, 10);

    expect(duration).toBe(1);
    expect(schedule).toHaveLength(1);
    expect(schedule[0].principal).toBe(3000);
    expect(schedule[0].interest).toBe(300);
    expect(schedule[0].total).toBe(3300);
  });
});
```

---

## 9. Verification Steps

After implementation, run these exact commands in order:

### 9a. Tests
```bash
cd mern_vb_backend && pnpm test
```
**Expected:** All tests pass, including the new `loanCalculator.test.js`.

### 9b. Console.log sweep
```bash
grep -r "console.log" mern_vb_backend/utils/loanCalculator.js
grep -r "console.log" mern_vb_backend/controllers/loanController.js
```
**Expected:** No matches in either file (existing `console.error` in catch blocks is acceptable — only `console.log` is banned).

### 9c. Hardcoded value check in loanCalculator.js
```bash
grep -n "0\.10\|0\.15\|20000\|5000\|2000\b" mern_vb_backend/utils/loanCalculator.js
```
**Expected:** Zero matches. The calculator must have no hardcoded financial values.

### 9d. Confirm defaults are at controller level only
```bash
grep -n "DEFAULT_DURATION\|DEFAULT_INTEREST_RATE" mern_vb_backend/controllers/loanController.js
```
**Expected:** Exactly 2 matches — the `const` declarations in `createLoan`, each with a `TODO` comment referencing GroupSettings.

### 9e. State the result
```
✓ Tests passed (backend)
✓ No console.log statements in modified files
✓ No hardcoded financial values in loanCalculator.js
✓ Defaults located at controller level with TODO markers
Ready to commit.
```

---

## 10. Out-of-Scope Issues Found During Audit

These are NOT part of this plan but should be addressed in follow-up work:

| Issue | Location | Hardcoded Value |
|-------|----------|----------------|
| Late interest penalty | loanController.js:358 | `0.15` (15%) |
| Overdue fine amount | loanController.js:365 | `1000` (K1,000) |
| Early payment charge | loanController.js:372 | `200` (K200) |
| Savings interest | savingsController.js:28, 110 | `0.10` (10%) |
| Savings fine amounts | savingsController.js:31-32 | `500`, `3000`, `1000`, `5000` |
| Loan model default rate | Loans.js:7 | `default: 10` |

All of these will move to GroupSettings in the wiring session. They are documented here so nothing is missed.

---

## Self-Assessment

**Is this plan complete enough that a fresh Claude Code session with no prior context could implement it correctly from the file alone?**

**Yes.** The plan contains:
- The exact current state of every line being changed
- The exact new function signature and body (copy-pasteable)
- Every caller identified with specific line numbers and exact edit instructions
- Complete test file with expected values calculated by hand
- Verification commands with expected outputs
- Clear scope boundaries (what to change, what NOT to change)
- The GroupSettings migration path spelled out

A fresh session needs only to: (1) read this file, (2) verify the current code matches Section 2, (3) execute Steps 1-7 in Section 7.
