# Implementation Plan — Flexible Partial Loan Payments + Optional Auto-Fine

> Author: Opus planning pass. Date: 2026-05-29.
> Scope: backend payment flow + GroupSettings + tests; frontend touchpoints listed only.
> **No application code is written by this plan. It is a build spec for a fresh Sonnet session.**
>
> Hard constraints honored throughout:
> - **No changes** to `utils/loanCalculator.js`, the installment schedule structure, or schedule generation.
> - All new logic lives **inside the existing `paymentController.repayment` flow and its existing MongoDB session.**

---

## A. Investigation — Current Partial-Payment Behavior (read before building)

Source: `mern_vb_backend/controllers/paymentController.js` `repayment` (lines 8–134), `models/Loans.js`, `utils/loanCalculator.js`.

### Installment record structure (confirmed — no change needed)
Each `loan.installments[]` entry (`models/Loans.js:10–23`):
```
{ month, principal, interest, total (= principal + interest),
  paidAmount (default 0), paid (default false), paymentDate, penalties{...} }
```
**The partial-payment state IS fully representable today:** `paidAmount` is cumulative; `paid` flips to `true` only when `paidAmount >= total`. An interest-only payment is simply `paidAmount = interest`, `paid = false`, and outstanding principal = `total − paidAmount`. **No schema or schedule change is required** — constraint satisfied.

### A.1 What happens now when a payment covers interest but not the full installment?
Walk the loop (`paymentController.js:57–89`) for `paymentAmount = interest` on a fresh installment:
- `currentPaid = 0`, `amountNeeded = total`, `paymentForThis = min(interest, total) = interest`.
- Pushed: `newPaidAmount = interest`, `willBePaid = (interest >= total) = false`.
- Applied (line 82–89): `installment.paidAmount = interest`; `paid` stays `false`; `paymentDate` NOT set.
- `allPaid = false` → `fullyPaid` stays `false`.
- Bank balance credited by `paymentAmount` (line 97); a `loan_payment` Transaction logged (line 98–105).

**Conclusion:** partial payments already work correctly and the money is tracked accurately. A later payment re-selects the same installment via `find(inst => !inst.paid)` (line 46), reads `currentPaid = paidAmount` (line 60), and tops it up. The feature is therefore **additive** — we hook an auto-fine onto an already-correct flow; we do not need to fix the core mechanics.

### A.2 Is paid / paidAmount correctly recorded for a partial payment?
**Yes.** `paidAmount` accumulates correctly; `paid` is set `true` only at full settlement (line 67, 85–86); `fullyPaid` only when every installment is paid (line 91–94). This is internally consistent.

### A.3 Existing bugs / hazards in partial-payment handling
1. **CRITICAL — semantic conflict with "corruption" definition.** The codebase currently treats `paid === false && paidAmount > 0` as *corruption*:
   - `scripts/fixCorruptedLoan.js:37–40` actively **resets `paidAmount` to 0** whenever it sees `paid === false && paidAmount > 0`.
   - CLAUDE.md "Known History" #7 codifies the same belief.
   This feature **legitimizes** exactly that state. **`scripts/fixCorruptedLoan.js` would destroy legitimate partial payments if run after this ships.** This is the single most important risk — see §I. (It is a one-off script, not production code, but it is dangerous the moment partial payments exist.)
2. **Reversal cannot undo a partial payment.** `loanController.reverseInstallmentPayment` (`loanController.js:24–26`) throws `'Installment is not marked as paid'` when `installment.paid === false`. So once a partial payment exists, there is **no built-in way to reverse it** (the partial installment is unpaid by definition). The auto-fine *can* be undone separately via `voidFine`. This is a pre-existing gap, arguably out of scope for this feature, but flag it (see §D / §I.6).
3. **Float rounding (LOW).** All schedule amounts are `toFixed(2)`, and `paymentForThis = min(remaining, total − currentPaid)` makes a full payment land *exactly* on `total` (so `willBePaid` is reliably `true` for full payments). Residual float risk is negligible; noted for completeness only. Do not add rounding logic.

### A.4 Threshold logic — detecting "interest covered but principal not paid"
The only installment that can be left partial by a payment is the **last one the loop touched** — earlier installments are always filled to `total` before the loop advances (line 61–62). That installment is the unique entry in `installmentsToUpdate` with `willBePaid === false`.

**Detection condition (precise):**
```
partial = installmentsToUpdate.find(u => !u.willBePaid)        // at most one
inst    = loan.installments[partial.index]
interestCovered      = partial.newPaidAmount >= inst.interest
principalOutstanding = partial.newPaidAmount <  inst.total      // always true when !willBePaid
→ fire auto-fine candidate when: partial exists AND interestCovered AND principalOutstanding
```
- Payment **< interest** → `interestCovered = false` → **no auto-fine** (principal *and* part of interest unpaid; out of scope — see §D.5).
- Payment **≥ total** for that installment → it isn't in `partial` → no fine (correct).

---

## B. GroupSettings Change

### B.1 Schema addition — `models/GroupSettings.js`
Add (place near the penalty group, after `earlyPaymentCharge`):
```js
partialPaymentFineAmount: {
  type: Number,
  default: 0,          // 0 = no auto-fine
  min: 0,
},
```
**Do NOT make this `required: true`.** The other numeric fields are `required` *without* defaults, meaning the seed must supply them. A new `required` field would force re-saving every existing GroupSettings doc and risk validation errors on legacy reads. `default: 0` is applied on hydration, so **every existing group automatically gets "no auto-fine" — zero behavior change for current groups.** Read defensively in code as `Number(settings.partialPaymentFineAmount) || 0`.

### B.2 Make the field editable — `controllers/groupSettingsController.js`
`updateGroupSettings` whitelists editable fields (`groupSettingsController.js:34–40`). **Add `'partialPaymentFineAmount'` to the `allowedFields` array** — otherwise Settings-page edits silently no-op.

### B.3 Seed it on group creation (both paths)
- `controllers/groupController.js` `createGroup` (self-serve onboarding, POST `/api/groups`): destructure `partialPaymentFineAmount` from `req.body` and add `partialPaymentFineAmount: partialPaymentFineAmount || 0` to the `GroupSettings.create([...])` payload.
- `controllers/adminGroupsController.js` `createGroup` (super-admin path): add `partialPaymentFineAmount: 0` to its `GroupSettings.create([...])` payload.
(Both are optional thanks to the default, but explicit seeding keeps the two seed blocks honest and lets the wizard set a value.)

### B.4 Onboarding wizard — `pages/Onboarding.jsx`
The wizard has 4 steps; **Step 3 = "Fine Rules"** (`Onboarding.jsx:210–239`) already holds `lateFineAmount` + `lateFineType`. Add the new field there:
- **Label:** "Partial payment fine"
- **Input:** `type="number" min="0"`, default `0`, new state `partialPaymentFineAmount`.
- **Helper text:** "Optional. Charge a fine when a member pays only the interest and carries the principal forward. Set to 0 for no fine."
- Wire it into the `axios.post('/api/groups', { ... })` body (`Onboarding.jsx:55–67`) and into the Step-4 confirmation summary (`Onboarding.jsx:241–254`), e.g. "Partial payment fine: K{amount} (or 'None' when 0)".

### B.5 Settings page
- **Display (read view):** `pages/Settings.jsx` — add a `<Field label="Partial Payment Fine" value={...}>` next to the existing "Late Fine Amount" field (`Settings.jsx:106`), formatting `0` as "None".
- **Edit:** `components/settings/FinancialRulesDrawer.jsx` — add a number input bound to `partialPaymentFineAmount` so it's included in the PUT `/api/group-settings` payload (which now passes the whitelist from §B.2).

---

## C. Auto-Fine Implementation Approach

### C.1 Exact location in `paymentController.repayment`
Insert a single block **between the `logTransaction(...)` call (ends line 105) and `await session.commitTransaction()` (line 107).** At that point `loan.installments` are already mutated, the loan is saved, the bank balance is updated, and the payment Transaction is logged — all within the open manual transaction.

Add an import at the top of the file (mirrors `savingsController.js`):
```js
const { getSettings } = require('./groupSettingsController');
```
`Fine` is already imported (`paymentController.js:4`).

### C.2 The block (spec — detection + creation)
```js
// --- Auto-fine: interest covered but principal carried forward ---
const partial = installmentsToUpdate.find(u => !u.willBePaid);
if (partial) {
  const inst = loan.installments[partial.index];
  if (partial.newPaidAmount >= inst.interest) {          // §A.4 detection
    const settings = await getSettings(req.groupId);      // read-only; every group has settings
    const fineAmount = Number(settings.partialPaymentFineAmount) || 0;
    if (fineAmount > 0) {                                  // §D.4 — 0 = no fine
      const existing = await Fine.findOne({                // §D.3 — duplicate prevention
        ...req.groupScope,
        userId,
        loanId: loan._id,
        installmentMonth: inst.month,
        cancelled: { $ne: true },
      }).session(session);
      if (!existing) {
        await Fine.create([{
          ...req.groupScope,
          userId,
          username: member.name,
          amount: fineAmount,
          note: `Partial payment — Month ${inst.month} principal not paid`,
          issuedBy: req.memberId,
          loanId: loan._id,
          installmentMonth: inst.month,
        }], { session });
      }
    }
  }
}
```

### C.3 How the Fine is created (existing pattern)
Mirrors `paymentController.fine` (`paymentController.js:147–164`): `Fine.create` with `userId`, `username`, `amount`, `note`, `issuedBy = req.memberId`. Differences: (a) array form `Fine.create([{...}], { session })` so it joins the transaction (same form used in `createGroup`), and (b) two extra reference fields — see §C.5.

**The auto-fine is created UNPAID and does NOT touch the bank balance.** Per CLAUDE.md Known History #6, fines credit the balance only when *paid*. The payment's interest portion was already credited at line 97; the fine is just an outstanding obligation.

### C.4 Session handling — confirmed inside the existing session
`repayment` uses the **manual** session pattern: `startSession()` + `session.startTransaction()` (lines 11–12), `commitTransaction()` on success (line 107), `abortTransaction()` in `catch` (line 124), `endSession()` in `finally` (line 132). The new block sits before the commit and uses the same `session`. If `Fine.findOne`/`Fine.create` throws, control falls to the existing `catch` → `abortTransaction()` → **the entire payment rolls back** (installment updates, bank balance, payment Transaction, and the fine). This satisfies the rollback requirement (test §E.5). Do **not** introduce a second session or switch this handler to `withTransaction`.

### C.5 Fine model additions (ADOPTED — robust, field-based duplicate prevention)
Duplicate prevention keys on stable references, **not** description text. Add two nullable fields to `models/Fine.js`:
```js
loanId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', default: null },
installmentMonth: { type: Number, default: null },
```
> **Use `ref: 'Loan'`, NOT `'Loans'`.** The model is registered as `mongoose.model('Loan', ...)` in `models/Loans.js:31` — Mongoose refs use the model name, not the filename. `ref: 'Loans'` would silently break `populate`.

**Duplicate check** (as used in §C.2): `Fine.findOne({ ...req.groupScope, loanId, installmentMonth, cancelled: { $ne: true } })`. Only partial-payment auto-fines populate `loanId` + `installmentMonth`, so that pair uniquely identifies the fine for an installment. (Optional refinement: add a third nullable field `fineType: { type: String, default: null }`, set it to `'partial_payment'` on the auto-fine, and include `fineType: 'partial_payment'` in the check. Useful for categorizing fines in reports, but not required for correct duplicate detection.)

**Do NOT detect duplicates by matching the `note`/description string.** String-identity matching is fragile — it silently produces duplicate fines the moment the wording changes (cf. the `'saving'` vs `'savings'` audit-script bug in this project's history) and cannot distinguish two concurrent loans both partial on the same month.

**Non-breaking confirmation:** both fields are nullable with `default: null`. Every existing `Fine` document simply has `loanId = null` / `installmentMonth = null`, and every existing `Fine.create(...)` call that omits them keeps working unchanged. No migration is required.

---

## D. Edge Cases

1. **Member pays exactly the interest amount.** `newPaidAmount = interest` → `willBePaid = false`, `interestCovered = true` → **fine created** (if setting > 0 and no duplicate). Installment left `paid = false`, `paidAmount = interest`.
2. **Member pays more than interest but less than full installment.** `interest < newPaidAmount < total` → `willBePaid = false`, `interestCovered = true` → **fine created** (same rule). Principal partially paid, remainder carried forward.
3. **Duplicate fine for the same installment.** The `Fine.findOne({ loanId, installmentMonth, cancelled: { $ne: true } })` guard (§C.2) prevents a second auto-fine when a member makes multiple sub-full payments against the same installment across months. A *voided/cancelled* prior fine (`cancelled: true`) does not block a new one. (Note: top-up payments to an already-partial installment that still don't complete it re-enter this branch — the guard is what stops repeat fines.)
4. **`partialPaymentFineAmount === 0`.** Guarded by `if (fineAmount > 0)` → **no fine created, no behavior change.** This is the default for all existing and new groups.
5. **Payment below interest (`newPaidAmount < interest`).** `interestCovered = false` → **no auto-fine.** Out of scope: principal *and* part of interest are unpaid; the feature only fines "interest covered, principal carried." Flag to William as a deliberate non-action.
6. **No way to reverse a partial payment (pre-existing gap — OUT OF SCOPE).** `reverseInstallmentPayment` (`loanController.js:24–26`) requires `installment.paid === true`, so a partial (unpaid) installment cannot be reversed through it today. This limitation is **pre-existing — not introduced by this feature — and is explicitly out of scope.** It is logged for the **Shiny Object Parking Lot in the sprint doc** (see §H, "Parked"). Current levers if a partial must be undone: record offsetting activity, or void the auto-fine via `voidFine`.
7. **Zero-interest installment (degenerate).** If `inst.interest === 0`, `interestCovered` is trivially true for any non-zero payment, so any partial fires a fine. Acceptable for 0% groups but note it; do not special-case unless William objects.

---

## E. Test Cases to Write (do NOT implement yet)

Add to `mern_vb_backend/tests/loanSavingsController.test.js` (the critical payment test file), Jest + Supertest, group-scoped fixtures. Each test asserts BOTH installment state AND the Fine collection.

1. **Interest-only payment + fine on (setting > 0):** seed group `partialPaymentFineAmount = 500`; pay exactly `installment.interest`. Assert: installment `paid === false`, `paidAmount === interest`; exactly **one** Fine exists with `amount === 500`, `note === 'Partial payment — Month 1 principal not paid'`, `loanId`/`installmentMonth` set, `paid === false`; bank balance increased by the interest amount only (no fine credit).
2. **Interest-only payment + no fine (setting = 0):** same payment, `partialPaymentFineAmount = 0`. Assert: installment partial as above; **zero** Fines created.
3. **Full installment payment → no fine:** pay `installment.total` (setting > 0). Assert: installment `paid === true`, `paidAmount === total`; **zero** auto-fines.
4. **Duplicate-fine prevention:** setting > 0; pay interest-only (creates fine), then make a second sub-full payment on the *same* installment. Assert: still exactly **one** Fine for that `loanId` + `installmentMonth`.
5. **Session rollback — fine creation fails, payment rolls back:** setting > 0, force the `Fine.create` (or `Fine.findOne`) to throw (mock/stub). Assert: **no Fine persisted, installment `paidAmount` unchanged from pre-payment, bank balance unchanged, no `loan_payment` Transaction persisted** — full atomic rollback.

Recommended extras:
6. **Payment below interest → no fine** (§D.5): pay `< interest`; assert partial state recorded, zero fines.
7. **Overpayment spanning installments leaves the *last* one partial → fine only on that month** (§A.4): pay `installment1.total + installment2.interest`; assert month-1 paid, month-2 partial, single fine on month 2.

---

## F. UI Changes Needed (LIST ONLY — Sonnet builds these)

- **GroupSettings form additions:**
  - `pages/Onboarding.jsx` — Step 3 "Fine Rules": "Partial payment fine" number input + helper text; include in POST body and Step-4 summary (§B.4).
  - `pages/Settings.jsx` — read-only "Partial Payment Fine" field (format 0 as "None") (§B.5).
  - `components/settings/FinancialRulesDrawer.jsx` — editable number input bound to `partialPaymentFineAmount` (§B.5).
- **Repayment schedule display update** (loan detail / installment schedule view under `src/features/loans/`): for an unpaid installment with `paidAmount > 0`, show **"Interest paid: K{paidAmount}" / "Principal remaining: K{total − paidAmount}"** and a **"Partial"** status chip instead of plain "Unpaid". (`enhancedReportsController.js:136–137` already computes the `Remaining` figure for reports — mirror that math in the UI.)
- **Loans list indicator:** a **"Partial"** badge on any loan (or installment row) where `paid === false && paidAmount > 0`, distinct from "Paid"/"Unpaid"/"Overdue", so treasurers can spot carried-forward principal at a glance.

---

## G. Risks & Gotchas (this codebase)

1. **`scripts/fixCorruptedLoan.js` will delete legitimate partial payments (HIGH).** It resets `paidAmount → 0` for any `paid === false && paidAmount > 0` installment (`fixCorruptedLoan.js:37–40`). After this feature, that condition is **valid data**. Mitigation is **Step 1 of the implementation order (§H)** — retire the script and rewrite CLAUDE.md Known History #7 *before any code is written*. Refined definition: `paid === false && paidAmount > 0` is **valid** when a partial-payment Fine exists for that installment, and is corruption only when no such Fine exists. ⚠️ **Caveat:** in groups with `partialPaymentFineAmount === 0` a legitimate partial leaves **no** Fine — so any future corruption-detector must also treat the state as valid whenever `paidAmount <= total`, and must not rely on Fine-existence alone.
2. **Atomicity (HIGH, CLAUDE.md #1).** The auto-fine MUST be created with `{ session }` inside the existing transaction (§C.4). Never create the fine outside the session or after commit, or a failed payment could leave an orphan fine / balance drift.
3. **Settings whitelist (MEDIUM).** Forgetting to add `partialPaymentFineAmount` to `updateGroupSettings.allowedFields` (§B.2) makes the Settings UI appear to save while silently discarding the value — a confusing, hard-to-spot bug.
4. **Fine model fields (MEDIUM) — ADOPTED.** Duplicate prevention uses `loanId` + `installmentMonth` on `Fine` (§C.5), keyed by those fields — never by description-string matching. Use `ref: 'Loan'` (not `'Loans'`). Both fields are nullable and non-breaking for existing records.
5. **No backend PDF/export work (LOW, CLAUDE.md #5).** Any schedule/partial reporting stays frontend-only.
6. **No partial-payment reversal path (LOW, pre-existing, §A.3.2/§D.6).** Out of scope; do not build a reversal in this feature. Logged in the §H "Parked" list for the sprint-doc Shiny Object Parking Lot.

---

## H. Implementation Order (Checklist)

Read §A (investigation, read-only) first. Then build in this order. **Step 1 must happen before any code is written.**

- [ ] **Step 1 — Retire the corruption script + fix the corruption definition (DATA-SAFETY — do first, before any code).**
  - Rename `scripts/fixCorruptedLoan.js` → `scripts/RETIRED_fixCorruptedLoan.js`.
  - Add a comment block at the top of the renamed file:
    > Retired [version] — partial payments make `paidAmount > 0` with `paid = false` a valid state. Running this script after this version will silently destroy legitimate partial payment records. Do not run.

    (Fill `[version]` with the release version shipping this feature.)
  - Update **CLAUDE.md Known History #7**: `paid === false && paidAmount > 0` is now **valid** when a partial payment has been recorded for that installment (identified by a corresponding partial-payment Fine), and is corruption **only** when no such Fine exists for that installment. ⚠️ Caveat (carry into the wording): in groups with `partialPaymentFineAmount === 0` a legitimate partial leaves no Fine, so the state must also be treated as valid whenever `paidAmount <= total` — do not rely on Fine-existence alone.
- [ ] **Step 2 — GroupSettings field + whitelist + seed.**
  - Add `partialPaymentFineAmount` to `models/GroupSettings.js` (§B.1).
  - ⚠️ **REQUIRED:** add `'partialPaymentFineAmount'` to the `allowedFields` whitelist in `groupSettingsController.updateGroupSettings` (`groupSettingsController.js:34–40`, §B.2). **Omitting this makes treasurer saves a silent no-op** — the UI appears to save but the value is discarded. Easy to miss, hard to debug.
  - Seed it in both `createGroup` paths (§B.3).
- [ ] **Step 3 — Fine model fields (§C.5).** Add nullable `loanId` (`ref: 'Loan'`) + `installmentMonth` to `models/Fine.js`. Non-breaking for existing records.
- [ ] **Step 4 — Auto-fine block in `paymentController.repayment` (§C).** Insert between `logTransaction` and `commitTransaction`, inside the existing manual session.
- [ ] **Step 5 — Frontend (§F).** Onboarding Step 3 input; Settings read field + `FinancialRulesDrawer` edit; repayment-schedule partial display; loans-list "Partial" badge.
- [ ] **Step 6 — Tests (§E).** The 5 required cases + 2 recommended extras.
- [ ] **Step 7 — Verification loop (CLAUDE.md).** Backend tests; `node scripts/auditBankBalance.js` (financial logic touched) — confirm no drift; console.log sweep; confirm the fine amount is read from settings (no hardcoded value).

**Parked (NOT in this feature):** reversing a partial payment — pre-existing gap in `reverseInstallmentPayment` (§D.6). Add to the sprint-doc Shiny Object Parking Lot.

---

This plan is complete and self-contained for a fresh Sonnet session.
