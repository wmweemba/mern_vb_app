# Build: revolving-payment-corrections

**Goal:** Let a treasurer (a) record interest on a revolving loan that is repaid in the same
month it was borrowed, before that month's Month-End Interest has run, and (b) reverse a
wrongly recorded revolving-loan payment and re-enter it correctly. Then Simon Peter can fix
Muyapekwa E Daka's 07/10/2026 payment himself (K2,420 recorded as all-principal; it should
be K220 interest + K2,200 principal). No one-off data script is needed.

**Repo:** /Users/williammweemba/Dev_Projects/mern_vb_app · **Branch:** build/revolving-payment-corrections · **Base:** 8a9edcc (main, 2026-10-08, re-check at approval)
**Status:** building (approved 2026-10-08 20:56)

> **Orchestrator note:** this plan was written outside `/build`, with the codebase and the
> production data already read. Phase 0 will find it. Skip Phase 1's Explore pass, review the
> plan, and go straight to Checkpoint A. Everything a subagent needs is in §Context and its
> own unit section.

**Hard deadline:** live in production **before Simon runs October's Month-End Interest**.
September's ran on 25/09, so October's is probably around 25/10. Once October accrues on
Muya's loan, U3's guard (correctly) blocks reversing her 07/10 payment, and the fallback
becomes a hand-written data script plus correcting her October accrual. William is asking
Simon to hold October's run until this ships.

---

## Context

### The ticket and the evidence

Simon Peter (treasurer, *Grocery Savings Group*, `grocery_chilimba` template) recorded
Muyapekwa E Daka's repayment of K2,420 as all principal. She had borrowed K2,200 on 03/10
and repaid K2,200 + K220 interest (10%) on 07/10.

**Root cause (product gap, not just user error):** `revolvingMonthly.applyPayment` refuses
`toInterest > interestOutstanding`. On 07/10, `interestOutstanding` was **K0**, because
October's accrual hadn't run. So the correct split was impossible to record. The
"Allocate to interest" field's placeholder read "up to K0". The app only charges interest at
month-end on the principal outstanding at that moment, so any money borrowed and repaid within
a month escapes interest.

**The group's rule, confirmed by Simon on 2026-10-08:** a full month's 10% is owed on every
kwacha borrowed, however soon it's repaid ("if someone gets a loan at the beginning of the
month and pays after 15 days, still 10%"). So for Muya's October: K220 at repayment (on the
K2,200) + K200 at month-end (10% of the remaining K2,000) = K420 = 10% of the K4,200 she had
out. **Interest charged at repayment and month-end accrual on the remainder add up to the
group's rule, with no double charge.** The same holds when old principal is repaid mid-month
before that month's accrual.

Simon also said "I can't edit for anyone". Revolving loans have **no correction path at all**:
`EditLoanForm` only allows notes, and `reverseInstallmentPayment` is for scheduled
installments only.

### Production read (2026-10-08, read-only, via `docker exec` on the Coolify backend)

Group `6a75a334ba20ae75b763e2cb` "Grocery Savings Group": `interestRate: 10`,
`policies.arrears: 'capitalise'`, `policies.interestObligation: 'per_member_quota'` but
**`interestObligationAmount: 0`**, so the quota report is currently inert for this group.
13 revolving loans, all open. Accrual runs: 2026-07 (31/07), 2026-08 (31/08),
**2026-09 (25/09)**. **No 2026-10 accrual yet.** Entry types in use: `disbursement`,
`accrual`, `interest_payment`, `principal_payment`.

Muya: member `6a912cbc7de2d763a9fbf768`, loan `6aa30f0825733d5fe1364b5e`,
`principalBalance: 1780`, `interestOutstanding: 0`. Last entries:

| date (UTC) | type | amount | principalAfter | entry _id | transactionId |
|---|---|---|---|---|---|
| 2026-09-25T13:57:52.162Z | accrual (2026-09) | 400 | 4000 | …7355 | — |
| 2026-09-26T10:00:26.115Z | interest_payment | 400 | 2400 | …78f5 | **none** |
| 2026-09-26T10:00:26.115Z | principal_payment | 1600 | 2400 | …78f6 | **none** |
| 2026-09-30T20:21:54.233Z | principal_payment | 400 | 2000 | …33cf | **none** |
| 2026-10-03T07:31:00.470Z | disbursement | 2200 | 4200 | …7fdb | **none** |
| 2026-10-07T10:54:41.578Z | principal_payment | 2420 | 1780 | `6ac624f15a6d213606539aea` | **none** |

Matching Transaction: `6ac624f15a6d213606539aee`, `type: 'loan_payment'`, `amount: 2420`,
`note: 'Payment — interest K0, principal K2420'`, `createdAt: 2026-10-07T10:54:41.613Z`
(**35 ms after the entry date**), `referenceId` = the loan.

**Critical finding: app-recorded revolving entries never carry `transactionId`.** Only 38
of 100 entries group-wide have one, and those are all from `scripts/importGraceCycle.js`.
`paymentController.repayment` calls `applyPayment` *before* `logTransaction` and never links
the two (`loanController.createLoan`'s top-up path has the same gap). So:
- U2 must link new payment entries to their Transaction.
- U3 must find the Transaction for **legacy** payments by matching, not by id (rule below).

Bank balance is **correct** today: K2,420 cash really came in. The error is only in how the
loan ledger split it. Reversal plus re-entry nets the bank balance to zero change.

### Design decisions (constrain every unit)

1. **In-month interest = a new entry type `interest_charge`.** Do not reuse `accrual`:
   accrual carries `periodLabel` idempotency (`loanController.hasAccruedForPeriod`) and is
   produced only by the Month-End run. An `interest_charge` has no `periodLabel`. It is
   created **inside `applyPayment`**, only when the caller passes
   `ctx.chargeInterestShortfall === true` and `toInterest > interestOutstanding`. It raises
   `interestOutstanding` by exactly the shortfall, then the payment is applied as normal.
   Without the flag, today's 400 error is unchanged, but its message should say the
   treasurer can confirm an in-month interest charge. This is never automatic: the
   treasurer types the interest amount and ticks a confirm box (U5).
2. **Reversal = append negated entries of the *same* type, never delete or edit amounts.**
   This mirrors CLAUDE.md "Reversal / Corrections" note #1, which reuses the original
   Transaction `type` with a negated `amount`. Reversing Muya's payment appends a
   `principal_payment` entry with `amount: -2420`. Every existing consumer that sums entries
   by type then nets to zero **with no code change**:
   `cycleCollectionsController.summarizeLoans`, `interestObligationController.interestPaidOnLoan`,
   `scripts/auditBankBalance.js` `totalPaidOnLoan`. The original entries get
   `reversedAt`/`reversedBy`/`reverseReason`, which is used for the double-reversal guard and
   UI strike-through. The new entries get `reversalOf: <original entry _id>`.
3. **A "payment" = the set of entries one `applyPayment` call created.** These are its
   `interest_charge` (if any), `interest_payment` (if any) and `principal_payment` (if any).
   They share the **exact same `date`** (one `new Date()` per call; confirmed in production:
   both 26/09 entries are `…26.115Z`). Reversing any one entry reverses the whole set,
   including its `interest_charge`.
4. **Transaction for a payment:** if the entries carry `transactionId`, use it. Otherwise
   (legacy) find Transactions with `referenceId: loan._id`, `type: 'loan_payment'`,
   `amount: <sum of the set's payment entries>` (positive) and `createdAt` within **±10 s**
   of the entry date, in the group scope. It must be **exactly one**; zero or several →
   `409` with a clear message. Never guess.
5. **Reversal guard:** refuse (`400`) if the loan is `archived`, if any entry in the set is
   already reversed, or **if any `accrual` or `capitalisation` entry on the loan is dated
   after the payment**. Accrual is computed from the principal at the moment it runs, so
   undoing an earlier payment would leave that interest wrong. Later payments or top-ups do
   **not** block reversal (balances are additive).
6. **Money path follows the reversal pattern exactly** (`contributionController.reverseContribution`):
   - one `session.withTransaction`
   - `updateBankBalance(-total, groupId, session)`
   - `logTransaction({ type: 'loan_payment', amount: -total, referenceId: loan._id, note })`
   - `res.json` **only after** `withTransaction` resolves (CLAUDE.md Reversal note #5)
   - `cancelReason` required (400 if blank)
   - if the loan was `fullyPaid`, set `fullyPaid: false`
   - roles `admin`/`treasurer`/`loan_officer`, matching `reverseInstallmentPayment`'s route
7. **Dashboard "interest charged"** (`savingsController.js` ~line 236 sums `accrual` entries)
   must also count `interest_charge`. Negated `interest_charge` reversal entries then net out
   there too.
8. **Out of scope:**
   - linking `transactionId` on revolving **top-ups** in `createLoan` (follow-up)
   - reversing disbursements, accruals or capitalisations
   - a one-off fix script for Muya
   - any change to `accrue()`, Month-End preview/run, or `scheduled*` strategies
   - backfilling `transactionId` on legacy entries
   - fixing the latent res-inside-transaction race in `voidFine`/`reverseInstallmentPayment`

### Stack and conventions

- Backend `mern_vb_backend/`: Node, Express 5, Mongoose 8, **CommonJS**, Jest + Supertest,
  `mongodb-memory-server` **`MongoMemoryReplSet`** (transactions need a replica set). Copy the
  mock/setup header of `tests/reversalController.test.js` (Clerk + `resolveGroup` mocks) for
  new controller tests.
- Frontend `mern-vb-frontend/`: React 19, Vite 7, Tailwind 4 tokens, **ES modules**.
  **`UI_SPEC.md` is mandatory** (CLAUDE.md "UI Spec Compliance"): §6.7 buttons, §6.8 inputs,
  §6.14 badges, §6.18 confirmation modal. Use `components/ui/Select.jsx`, never a raw
  `<select>`.
- No TypeScript. Async/await. try/catch in controllers with proper status codes. **No
  `console.log`** left in controllers/utils/routes/src. No hardcoded rates: read
  `GroupSettings.interestRate` / `loan.interestRate`.
- `round2` and `EPSILON = 0.01` already exist in `revolvingMonthly.js`. Reuse them.
- `middleware/auth.js`'s `requireRole` takes an **array**. Route files here use a local
  variadic `allowRoles(...)`; copy the neighbouring route's form exactly.
- Express 5 route order: static before dynamic. Put the new route next to the existing
  `/:loanId/installments/:month/reverse` route in `routes/loans.js`.
- Commits: conventional (`feat:`/`fix:`/`test:`/`docs:`), **no Co-Authored-By line**.
- **Auto Deploy is ON: pushing `main` is the production deploy.** CLAUDE.md's Verification
  Loop (tests → `auditBankBalance.js --all` → console.log sweep → hardcoded-value check) is the
  pre-push gate.

### Commands

```bash
cd mern_vb_backend && pnpm test                     # all backend tests
cd mern_vb_backend && pnpm test -- <pattern>        # one file
cd mern-vb-frontend && pnpm test && pnpm build && pnpm lint
cd mern_vb_backend && node scripts/auditBankBalance.js --all   # dev Atlas; exit 0 expected except William's Group's known ~K18,177
```

---

## Units

| ID | Title | Model | Risk | Depends on | Owns (files) | Status |
|---|---|---|---|---|---|---|
| U1 | Strategy: `interest_charge` + `reversePayment` | sonnet | high | — | `models/Loans.js`, `utils/strategies/loanAccrual/revolvingMonthly.js`, `tests/strategies/revolvingMonthly.test.js` | done |
| U2 | Repayment: accept charge flag, link transactionId | sonnet | high | U1 | `controllers/paymentController.js`, `tests/paymentController.test.js` | todo |
| U3 | Reverse-payment endpoint | sonnet | high | U1 | `controllers/loanController.js`, `routes/loans.js`, `tests/revolvingPaymentReversal.test.js` (new) | todo |
| U4 | Consumers: dashboard + net-out tests | haiku | low | U1 | `controllers/savingsController.js`, `tests/cycleCollectionsController.test.js`, `tests/interestObligationController.test.js` | todo |
| U5 | Payment modal: in-month interest | sonnet | low | U2 | `mern-vb-frontend/src/components/ui/ManagePaymentModal.jsx` | todo |
| U6 | Ledger: reversal display + Reverse action | sonnet | low | U3 | `mern-vb-frontend/src/pages/Loans.jsx` | todo |
| U7 | CLAUDE.md architecture notes | haiku | low | U1–U6 | `CLAUDE.md` | todo |

U2/U3/U4 are independent of each other after U1, and U5/U6 after their backends. If worktree
isolation works (NS-025 says `~/Dev_Projects/.git` was deleted, so retry it), U2‖U3 and U5‖U6
are valid pairs. Otherwise run sequentially: U1→U2→U3→U4→G1→U5→U6→G2→U7.
Estimate: 7 units × ~20 min ≈ 2.5 h of build time plus gates and Phase 3. Likely 2 sessions.

All backend paths below are relative to `mern_vb_backend/`.

### U1 — Strategy: `interest_charge` + `reversePayment`

- **Brief:**
  1. `models/Loans.js` `entries[]`:
     - add `'interest_charge'` to the `type` enum
     - add optional fields `reversalOf: ObjectId` (no ref needed), `reversedAt: Date`,
       `reversedBy: ObjectId ref 'GroupMember'`, `reverseReason: String`
     - keep `amount` `required` with **no `min`**, because reversal entries are negative
     - update the schema comment
  2. `revolvingMonthly.applyPayment(loan, paymentAmount, allocation, ctx)`:
     - compute the interest allocation first, exactly as today
     - if `toInterest > interestOutstanding + EPSILON` **and** `ctx.chargeInterestShortfall === true`:
       let `charge = round2(toInterest - interestOutstanding)`; raise `interestOutstanding`
       by it; push an entry `{ date, type: 'interest_charge', amount: charge,
       principalAfter: principalBalance, interestAfter: <raised>, transactionId:
       ctx.transactionId, recordedBy: ctx.recordedBy }`
     - use **one** `date` value for every entry this call pushes. Today it's
       `ctx.date || new Date()`, computed once; hoist it above the charge.
     - run the "exceeds outstanding balance" check **after** any charge, so K2,420 against
       K4,200 principal + K220 charge passes
     - without the flag, keep the existing 400, but extend its message with
       `— confirm an in-month interest charge to record interest before Month-End`
     - return `interestCharged` (0 when none) alongside the existing fields
  3. New exported pure function `reversePayment(loan, entryId, ctx)`, where
     `ctx = { reason, reversedBy, date? }`:
     - find the entry by `_id`. It must be type `interest_charge` / `interest_payment` /
       `principal_payment` with `amount > 0` and no `reversalOf`, else throw `{status:400}`.
     - collect its **set**: all entries of those three types with the identical `date`
       (`getTime()` equal), `amount > 0`, no `reversalOf`.
     - if any entry in the set has `reversedAt` → throw 400 "already reversed"
     - if any `accrual`/`capitalisation` entry has `date > set date` → throw 400,
       "Month-End Interest has run since this payment; it can no longer be reversed"
     - restore `principalBalance += Σprincipal_payment`,
       `interestOutstanding += Σinterest_payment − Σinterest_charge` (`round2`; never below 0;
       throw 500 if the arithmetic would go negative, which signals corruption)
     - for each set entry, append a negated entry: same `type`, `amount: -orig.amount`,
       `reversalOf: orig._id`, `date: ctx.date || new Date()`, `principalAfter`/`interestAfter`
       = the restored balances, `recordedBy: ctx.reversedBy`
     - stamp originals with `reversedAt`, `reversedBy`, `reverseReason`
     - return `{ toInterest, toPrincipal, interestCharged, totalPaid: toInterest + toPrincipal, setDate, transactionId: <first non-null transactionId in the set or null> }`
     - **does not** touch `fullyPaid`, BankBalance or Transaction (the caller's job)
- **Contracts:**
  - `applyPayment` signature unchanged; it gains `ctx.chargeInterestShortfall` and
    `result.interestCharged`
  - `reversePayment(loan, entryId, { reason, reversedBy, date })` → result above; errors carry `.status`
  - entry type string `'interest_charge'`; fields `reversalOf`, `reversedAt`, `reversedBy`, `reverseReason`
- **Acceptance:** `cd mern_vb_backend && pnpm test -- revolvingMonthly` exits 0, with new
  cases covering:
  - (a) **Muya replay:** principal 4200 / interest 0; pay 2420 with `{toInterest:220,
    toPrincipal:2200}` and the flag → principal 2000, interest 0, entries `interest_charge 220`,
    `interest_payment 220`, `principal_payment 2200`, all with the same `date`
  - (b) same payment without the flag → throws 400 mentioning "in-month interest"
  - (c) flag set but `toInterest <= interestOutstanding` → no `interest_charge` entry
  - (d) reverse a legacy single `principal_payment 2420` (built by hand, no transactionId)
    → principal 1780→4200, a `principal_payment -2420` entry with `reversalOf`, original stamped
  - (e) reverse the set from (a) by passing the `interest_payment` id → all three negated,
    principal back to 4200, interest back to 0
  - (f) reversing twice → 400
  - (g) an `accrual` dated after the payment → 400
  - (h) a later `disbursement` does **not** block
  - (i) Σ amounts by type nets to the pre-payment value after reversal

  Existing tests must still pass unchanged.

### U2 — Repayment: accept charge flag, link transactionId

- **Brief:** In `controllers/paymentController.js` `repayment`'s revolving branch:
  - read `chargeInterestShortfall` from `req.body` (strict `=== true`) and pass it via ctx to
    `strategy.applyPayment`
  - after `logTransaction(...)` returns the Transaction doc, set `transactionId = tx._id` on
    every entry `applyPayment` just pushed (the trailing entries whose `date` equals the call's
    date), then `loan.save({ session })` again, or restructure so the save happens once after
    linking
  - include `interestCharged` in the Transaction note when > 0, e.g.
    `Payment — in-month interest charged K220; interest K220, principal K2200`, and in the
    JSON response under `allocation`

  Keep the existing manual `startTransaction`/`commitTransaction` structure and its
  respond-after-commit order. Don't refactor the scheduled branch.
- **Contracts:**
  - `POST /api/payments/repayment` body gains optional `chargeInterestShortfall: boolean`
  - response `allocation` gains `interestCharged`
- **Acceptance:** `cd mern_vb_backend && pnpm test -- paymentController` exits 0, with new
  cases:
  - revolving loan with principal 4200, interest 0: POST 2420 with allocation 220/2200 and
    the flag → 200; loan principal 2000; three entries all carrying the **same**
    `transactionId` equal to the logged `loan_payment` Transaction's `_id`; BankBalance +2420
  - same without the flag → 400, BankBalance unchanged, no Transaction (rollback)

  All 7 existing cases pass unchanged.

### U3 — Reverse-payment endpoint

- **Brief:** Add `exports.reverseRevolvingPayment` to `controllers/loanController.js` (next
  to `reverseInstallmentPayment`), routed as
  `PUT /:loanId/entries/:entryId/reverse` in `routes/loans.js` with the same middleware chain
  and `allowRoles('admin', 'loan_officer', 'treasurer')` as the installments-reverse route.
  Body `{ cancelReason }` is required (400 if blank or whitespace). Inside one
  `session.withTransaction`:
  1. load the loan `{ _id, ...req.groupScope }`; 404 if missing; 400 if `accrualMode !== 'revolving'` or `archived`
  2. `const r = strategy.reversePayment(loan, entryId, { reason, reversedBy: req.memberId })`,
     using `resolveLoanAccrualStrategyForLoan` or requiring `revolvingMonthly` directly, as the file already does
  3. resolve the original Transaction (design decision 4): by `r.transactionId` if set,
     else the ±10 s match on `referenceId`/`type: 'loan_payment'`/`amount: r.totalPaid`/`createdAt`.
     It must be exactly one, else throw `{status:409}` naming the count.
  4. `updateBankBalance(-r.totalPaid, req.groupId, session)`
  5. `logTransaction({ userId: loan.userId, type: 'loan_payment', amount: -r.totalPaid, referenceId: loan._id, groupId: req.groupId, note: \`Payment reversed: ${reason}. Original K${r.totalPaid} (interest K${r.toInterest}, principal K${r.toPrincipal}) of ${<original tx createdAt date>} reversed.\` }, session)`
  6. set the new reversal entries' `transactionId` to that offsetting Transaction's `_id`
  7. if `loan.fullyPaid`, set it to `false`
  8. `loan.save({ session })`

  Respond `res.json({ message, loan, reversed: r })` **only after** `withTransaction`
  resolves. Map `err.status` to the HTTP status, else 500. Never touch the scheduled-loan
  reverse path.
- **Contracts:** `PUT /api/loans/:loanId/entries/:entryId/reverse` `{ cancelReason }` →
  `200 { message, loan, reversed }` | 400 | 403 | 404 | 409.
- **Acceptance:** new `tests/revolvingPaymentReversal.test.js`, using the
  `MongoMemoryReplSet` + mocks header copied from `tests/reversalController.test.js`.
  `pnpm test -- revolvingPaymentReversal` exits 0 with cases:
  1. **Muya legacy replay:** seed the loan from the §Context production table (entries with
     no transactionId), a K2,420 `loan_payment` Transaction 35 ms after the entry, and a
     BankBalance. Reverse → 200; principal 4200; BankBalance −2420; a −2420 `loan_payment`
     Transaction exists. Then POST a repayment of 2420 with 220/2200 + the flag → principal
     2000, and BankBalance is back to its pre-reversal value.
  2. Two candidate Transactions in the window → 409, nothing changed.
  3. Accrual after the payment → 400, nothing changed.
  4. Already reversed → 400.
  5. Blank `cancelReason` → 400.
  6. Member role → 403.
  7. Loan in another group → 404.
  8. A payment that made the loan `fullyPaid` → reversal sets `fullyPaid: false`.

  Full `pnpm test` exits 0.

### U4 — Consumers: dashboard + net-out tests

- **Brief:** In `controllers/savingsController.js` (~line 236, the revolving branch summing
  `accrual` entries into `totalInterestLoans`), also sum `interest_charge` entries, and update
  the comment above it. **No other production code change.** Add tests proving reversal
  entries net out with no consumer change:
  - in `tests/cycleCollectionsController.test.js`, a `summarizeLoans` case with a loan
    containing `interest_payment 220`, `principal_payment 2200`, and their negated reversal
    entries (`-220`, `-2200`, `reversalOf` set) → monthlyInterest 0, loanRepayment 0
  - in `tests/interestObligationController.test.js`, an equivalent case against the
    already-exported `interestPaidOnLoan` (`controllers/interestObligationController.js:86`)
    → 0 after reversal.
- **Contracts:** none new.
- **Acceptance:** `cd mern_vb_backend && pnpm test` exits 0; the new cases fail if the
  negated entries are removed from the fixture (sanity: assert the non-reversed fixture gives 220/2200).

### U5 — Payment modal: in-month interest

- **Brief:** `components/ui/ManagePaymentModal.jsx`, revolving repayment branch (the
  "Allocate to interest (ZMW)" field, ~lines 206–222; payload built ~line 78).
  - **Suggestion:** if the active loan has **no `accrual` entry for the current
    `YYYY-MM`** (local date) and an amount is entered, show a helper line under the field:
    "Month-End Interest hasn't run this month. If this payment includes interest on what's
    being repaid, that's K{s} interest + K{amount−s} principal." Here
    `s = round2(amount × rate / (100 + rate))` and `rate = activeLoan.interestRate`. Add a
    small ghost button "Use K{s}" that fills `toInterest`. **Never auto-fill.**
  - **Confirm:** when `Number(toInterest) > (activeLoan.interestOutstanding || 0)`, show a
    required checkbox: "Record K{toInterest − interestOutstanding} as interest charged this
    month (Month-End will charge the remaining balance as usual)". Disable submit until it is
    ticked. When ticked, add `chargeInterestShortfall: true` to the payload.
  - Replace the misleading placeholder `Default: interest first, up to K…` with
    `Interest owed now: K{interestOutstanding}`.
  - Show `interestCharged` in the success toast when > 0.

  Follow UI_SPEC §6.7 (ghost button), §6.8 (inputs/checkbox); use only tokens; keep the
  existing input classes. Don't touch the savings/fine branches.
- **Contracts:** sends `chargeInterestShortfall: true` only when the confirm is ticked.
- **Acceptance:** `cd mern-vb-frontend && pnpm build && pnpm lint && pnpm test` exit 0.
  Behaviour is verified in Phase 3 E2E flow 1.

### U6 — Ledger: reversal display + Reverse action

- **Brief:** `pages/Loans.jsx` `RevolvingLedger` (~lines 19–64):
  - add `ENTRY_LABEL.interest_charge = 'Interest charged (in-month)'`
  - entries with `reversalOf` render label + " — reversed", amount as `−K…`, in
    `text-text-secondary`
  - original entries with `reversedAt` render struck through (`line-through`) with a
    §6.14 "Reversed" badge and the `reverseReason` on its own line
  - on non-reversed `interest_charge`/`interest_payment`/`principal_payment` rows with
    `amount > 0` and no `reversalOf`, for roles `admin`/`treasurer`/`loan_officer` (copy
    `canReverseSavings` from `pages/Savings.jsx` ~line 48), show a small "Reverse" text
    button. Show it **once per payment set** (on the first row of entries sharing a `date`),
    not once per row.
  - clicking opens a **UI_SPEC §6.18 confirmation modal** (destructive style) titled
    "Reverse this payment?". Body: "This undoes the whole payment of K{set total} recorded
    {date} (interest K…, principal K…) and takes K{set total} back out of the bank balance.
    You can then record it again correctly." It includes a required reason input (§6.8).
  - submit `PUT ${API_BASE_URL}/loans/${loan._id}/entries/${entryId}/reverse`
    `{ cancelReason }`; show `err.response.data.error` inline on failure (the 400 accrual
    message must be readable); on success refetch loans and dispatch
    `window.dispatchEvent(new Event('loanDataChanged'))`.
  - mirror the state/handler shape of Savings.jsx's reverse flow (~lines 28–70, 142–146).
    Reuse the existing `Dialog` components already imported in Loans.jsx.

  `RevolvingLedger` needs `user` and a refetch callback passed in as props.
- **Contracts:** consumes U3's route.
- **Acceptance:** `cd mern-vb-frontend && pnpm build && pnpm lint && pnpm test` exit 0.
  Behaviour is verified in Phase 3 E2E flow 2.

### U7 — CLAUDE.md architecture notes

- **Brief:** Add a section "## Revolving Payment Corrections — Architecture Notes" before
  the final "*Last updated*" line, and update that line to 2026-10-08. Cover, as numbered
  notes in the style of the existing sections:
  - design decisions 1–6 from this plan, briefly
  - the `transactionId` gap: legacy entries are unlinked; reversal matches ±10 s; top-ups
    are still unlinked as a follow-up
  - the "same `date` = one payment" invariant: any future code pushing payment entries must
    use one date per call
  - why a reversal is blocked after a Month-End accrual

  Also add `interest_charge` to the Phase 2 notes' entry-type context if one lists types.
- **Acceptance:** `grep -n "Revolving Payment Corrections" CLAUDE.md` matches; no other file changed.

---

## Gates

| Gate | After | Opus reads | Note |
|---|---|---|---|
| G1 | U1–U4 | `revolvingMonthly.js` full; `git diff` of `paymentController.js` and `loanController.js` (U1–U3 are each `risk: high`, so already diff-read per unit, so G1 checks how they fit together); run `pnpm test` + `node scripts/auditBankBalance.js --all` on dev Atlas | Check: one `date` per applyPayment call; ±10 s matcher can't pick a reversal Transaction (amount is negative, so it can't); res.json after withTransaction; no consumer counts `reversedAt` entries twice |
| G2 | U5–U6 | Both frontend diffs against UI_SPEC §6.7, §6.8, §6.14, §6.18 | Re-read the spec sections against the diff (CLAUDE.md mandates this) |

## E2E flows

Local stack: `pnpm start` at the repo root (backend :5000 against **dev Atlas**, Vite
frontend). The backend `.env` `CLERK_SECRET_KEY` was checked **2026-10-08**: `sk_test_`,
`environment_type: development` via `GET https://api.clerk.com/v1/instance`, so throwaway
sign-in works. **Re-check before creating users.** Seed a login:
`cd mern_vb_backend && node scripts/createThrowawayTestUser.js --group "ZZZ_TEST Revolving Corrections" --template grocery_chilimba`.
Sign in at `/sign-in` with the printed email/password; OTP **424242**. **Clean up after:**
`--delete <clerkUserId> --groupId <id>`, then `node scripts/cleanupOrphanedRecords.js` (the
`--delete` is known to be incomplete). Mobile width (375px) first.

1. **In-month interest (U2+U5).**
   - Add a member and a revolving loan of K2,200 (Loans → Add Loan).
   - Open Manage Payment → repayment K2,420. The suggestion line shows "K220 interest +
     K2,200 principal"; tap "Use K220".
   - The confirm checkbox appears and submit is disabled until it's ticked. Tick it, submit.
   - The ledger shows "Interest charged (in-month) K220", "Interest paid K220",
     "Principal paid K2,200"; principal K0, loan Paid.
2. **Reverse and re-enter (U3+U6).**
   - New loan K4,200. Record K2,420 with the interest field **blank** (reproduces Muya's
     error: Principal paid K2,420, principal K1,780).
   - Tap Reverse on that row. The modal states K2,420 and requires a reason. Confirm.
   - The original row is struck through with a "Reversed" badge plus the reason; a
     "Principal paid — reversed −K2,420" row appears; principal is K4,200.
   - Re-record K2,420 as 220/2,200 with the confirm → principal K2,000.
   - The dashboard bank balance equals its pre-step-1 value + K2,420.
3. **Guard.** On the flow 2 loan, run Month-End Interest (Loans → Run Month-End Interest →
   confirm), then try to Reverse the 220/2,200 payment. The inline error explains that
   Month-End has run since; nothing changes.
4. **Member can't reverse.** No Reverse button for a member-role login (or confirm via the
   U3 403 test if a member login is impractical; note which was done).

## Rollout (post-build, new session; William decides each step)

1. Push `build/revolving-payment-corrections` (one question), then merge → `main` (a
   separate question). **Pushing `main` deploys to production** (Auto Deploy on).
2. Verify `curl -s https://api.chama360.nxhub.online/api/health` returns
   `transactionsAvailable: true`.
3. Production audit before Simon touches anything:
   `ssh -i ~/.ssh/hetzner_coolify root@78.47.128.95 "docker exec <backend-container> node scripts/auditBankBalance.js --group 6a75a334ba20ae75b763e2cb"`.
   Get the container name with `docker ps --format '{{.Names}}' | grep '^jgk8cwgs4s0w844cw8ksw80s'`;
   it changes on every redeploy.
4. Tell Simon to: open Muya's loan → Reverse the 07/10 "Principal paid K2,420" (reason
   e.g. "Recorded all as principal — should be K220 interest + K2,200 principal") → Record
   payment K2,420, Use K220, tick confirm. Expected: principal **K2,000**, interest K0; bank
   balance unchanged net.
5. Re-run the group audit (step 3). Then tell Simon October's Month-End can run: Muya's
   October accrual should preview as **K200**.
6. Answer the support ticket in-app; `/brain log`.

## Log
- 2026-10-08: plan drafted in a non-/build session after the production read (above) and
  Simon's answers. Awaiting Checkpoint A.
- 2026-10-08 20:56 /build session start (Opus orchestrator). Phase 0 resume; base re-checked: main still 8a9edcc.
- 2026-10-08 20:56 plan approved by William at Checkpoint A. Starting U1.
- 2026-10-08 U1 done. Verifier: revolvingMonthly 23/23, full suite 17 suites / 134 tests. Opus diff-read: OK. Checked the reversePayment 500 negative-interest guard: a charge always equals the shortfall and is fully settled in the same call, so restored interest ≥ pre-payment interest ≥ 0. The 500 is reachable only on corrupt data, as specified. Note for U3: the full suite flakes under default parallelism (MongoMemoryServer contention in support* suites), so use `--maxWorkers=2`.
