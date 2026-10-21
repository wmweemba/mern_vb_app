---
paths:
  - "**/*{ayment,eversal,orrection,evolving,avings}*"
  - "**/FinancialRulesDrawer.jsx"
---

# Partial payments, reversals and corrections

Moved verbatim from CLAUDE.md on 2026-10-21; loads only when Claude works with matching files. Full prior file: `docs/history/CLAUDE-2026-10-21.md`.

## Partial Payments Feature — Architecture Notes

Added 2026-05-29. Key decisions recorded here to prevent regression:

1. **Partial payment state is valid** — `paid===false && paidAmount > 0` is a legitimate installment state after a partial payment. It is NOT corruption. Only treat it as corruption if `paidAmount > installment.total`. `scripts/fixCorruptedLoan.js` has been retired as `RETIRED_fixCorruptedLoan.js` — do not restore or run it.

2. **Auto-fine is opt-in per group** — `GroupSettings.partialPaymentFineAmount` (default `0`) controls the fine amount. Zero means no fine. The amount is always read from settings; never hardcoded. Use `Number(settings.partialPaymentFineAmount) || 0` defensively.

3. **Detection condition** — a fine fires only when the partial installment has `newPaidAmount >= inst.interest` (interest covered, principal carried). Payment below interest does NOT fire a fine.

4. **Duplicate prevention on Fine** — `Fine` model has two new nullable fields: `loanId` (ref: 'Loan') and `installmentMonth`. The auto-fine block does a `Fine.findOne({ loanId, installmentMonth, cancelled: { $ne: true } })` guard before creating. A voided fine does not block a new one. Never use description-string matching for deduplication.

5. **Fine created inside the existing payment session** — `Fine.create([...], { session })` runs inside the same manual transaction as the installment update, bank balance update, and Transaction log. If any step fails, the entire payment rolls back atomically.

6. **No reversal path for partial payments (pre-existing gap)** — `reverseInstallmentPayment` requires `installment.paid === true`. A partial installment (unpaid) cannot be reversed through it. Parked for future sprint. Current lever: void the auto-fine via `voidFine`.

7. **Fine Rules settings drawer** — `partialPaymentFineAmount` is editable via `FinancialRulesDrawer.jsx` (not a separate drawer) and is included in the PUT `/api/group-settings` allowedFields whitelist.

---

## Reversal / Corrections — Architecture Notes

Added 2026-09-27 (support ticket: a treasurer double-recorded a contribution to the App Subscription fund with no way to undo it). Key decisions recorded here to prevent regression:

1. **The reversal shape is copied from `paymentController.voidFine`, the only proven prior art.** `Saving`, `Contribution`, and `FundExpense` all gained `cancelled`/`cancelledAt`/`cancelledBy`/`cancelReason` (FundExpense already had the first three, unused, before this). Reversing a record: soft-flag it (never hard-delete), reverse its balance effect via the **same shared helper the original entry used** (`updateBankBalance` or `updateFundBalance`, negated), and log an offsetting `Transaction` reusing the original `type` with a negated `amount`. Never invent a new `Transaction` type for a reversal — `auditBankBalance.js`'s `balanceEffect()` switch only handles types it already knows, and a new unhandled type falls through to the dangerous `default: return amount` catch-all.

2. **A Contribution reverses whichever destination it originally credited, read from its own denormalized `fundId`/`affectsMainBalance` — never re-resolved from the current `ContributionType`.** Same defensive instinct as `typeName`/`countsTowardInterestObligation` elsewhere in this model: if a type's routing is edited later, a historical contribution must still reverse against the pot it actually credited.

3. **Reversal is refused once the record is `archived`** (cycle closed). Cycle boundaries are still the `archived: { $ne: true }` convention (Named Funds note #8, Phase 5 note #1) — reversing an archived record would restate a frozen cycle's numbers after the fact.

4. **`scripts/auditFunds.js` computes each fund's balance from raw `Contribution`/`FundExpense` documents, not from the `Transaction` ledger — it needs its own `cancelled: { $ne: true }` filter on both sums, separately from `auditBankBalance.js`.** `auditBankBalance.js` never needed a change because it works entirely off `Transaction` records, where a reversal already nets to zero via the negated amount; `auditFunds.js` re-derives from source documents, so a reversed record's original amount would otherwise still be counted. Found live, not by the unit tests, because the tests seed fresh data with no reversed rows to expose it — a reason to prefer a live-database check over trusting a green test suite alone when adding a new state to an existing audit's source documents.

5. **Never call `res.json()` (or `res.status().json()`) from inside `session.withTransaction()`'s callback.** The commit happens strictly after the callback resolves, but a response can reach the client before that commit lands — a client re-reading immediately after a `200` can see stale, pre-write data. `voidFine` and `reverseInstallmentPayment` both have this latent race (not fixed, out of scope for this change); `recordContribution`/`recordExpense` already avoid it correctly. The pattern: build the result inside the transaction, assign it to a variable declared outside, and call `res.json()` only after `await session.withTransaction(...)` resolves.

---

## Revolving Payment Corrections — Architecture Notes

Added 2026-10-08 (support ticket: Simon Peter's group recorded a K2,420 revolving-loan payment as all-principal when it should have been K220 interest + K2,200 principal; this implements in-month interest charging and payment reversal so a treasurer can correct such errors without a data script).

1. **In-month interest is a new entry type `interest_charge`, never reusing `accrual`.** `interest_charge` has no `periodLabel` idempotency key and is created **inside `applyPayment`** (via `utils/strategies/loanAccrual/revolvingMonthly.js`) only when the caller passes `ctx.chargeInterestShortfall === true` and the requested `toInterest` exceeds `loan.interestOutstanding`. It raises `interestOutstanding` by exactly the shortfall, then the payment is applied as normal. Without the flag, the existing 400 error is kept but its message directs the treasurer to the confirm-and-charge flow. Accrual, by contrast, is idempotent per `periodLabel` and runs only during Month-End (no `chargeInterestShortfall` flag).

2. **Reversal appends negated entries of the same type, never edits or deletes.** Reversing Muya's payment appends a `principal_payment` entry with `amount: -2420`. Originals get `reversedAt`, `reversedBy`, `reverseReason`; new entries get `reversalOf: <original._id>`. Every consumer that sums entries by type (cycle collections, Interest Obligation, audit scripts) nets to zero with no code change — the reversals are built into the ledger as negative amounts, not tracked separately.

3. **A "payment" = all entries one `applyPayment` call created, identified by their identical `date`.** If the call creates an `interest_charge`, `interest_payment`, and `principal_payment`, all three share the exact same timestamp (one `new Date()` per call, confirmed in production). Reversing any one entry reverses the whole set. This is the invariant: any future code that pushes payment entries must use one `date` per call, or the ±10 s reversal matching will misfind or miss transactions.

4. **Transaction matching: new entries carry `transactionId`; legacy ones use ±10 s search.** `paymentController.repayment` logs a `loan_payment` Transaction, then links every entry it just pushed to that Transaction's `_id`. Legacy entries (pre-2026-10-08) never got this link. When `reverseRevolvingPayment` (the `PUT /:loanId/entries/:entryId/reverse` endpoint) reverses a legacy payment, it finds the original Transaction by searching for `referenceId: loan._id`, `type: 'loan_payment'`, `amount: <totalPaid>` (positive), and `createdAt` within **±10 seconds** of the entry date. It must find exactly one Transaction; zero or multiple raises a `409` with a count, never guessing.

5. **Reversal is blocked if the loan is archived, an entry is already reversed, or accrual/capitalisation has run after the payment.** The third guard is critical: Month-End accrual computes interest from the outstanding principal *at that moment*. Undoing an earlier payment would leave that interest amount wrong. Later payments or top-ups do not block reversal — the ledger's additions are independent.

6. **Money path mirrors `contributionController.reverseContribution` exactly.** One `session.withTransaction`, `updateBankBalance(-totalPaid, ...)`, `logTransaction({ type: 'loan_payment', amount: -totalPaid, ... })`, and `res.json` **only after** the transaction resolves. `cancelReason` is required (400 if blank). If the loan was `fullyPaid`, it is set to `false`. Roles: `admin`, `loan_officer`, `treasurer`, matching the scheduled-installment reversal route.

7. **The dashboard "interest charged" aggregation must sum both `accrual` and `interest_charge` entries.** In `controllers/savingsController.js`, the revolving branch sums accrual entries into `totalInterestLoans`; it now also includes `interest_charge` entries. Negated reversal entries (`amount: -220`) then net out automatically — no special handling needed.

8. **Top-ups (new loans via `createLoan`) still have no `transactionId` link — a follow-up.** `loanController.createLoan`'s disbursement-via-`onDisburse` path was written before reversal support existed; linking it is out of scope for this fix but should be done before the next payment-reversal change, or the matching heuristic will grow more fragile.

9. **A member must never have two open revolving loans — reversal refuses to create that state (added 2026-10-09).** Reversing a payment that paid a loan off sets it back to `fullyPaid: false`. If the member has since been given a newer open revolving loan (`createLoan` opens a fresh one when none is open), `reverseRevolvingPayment` returns `409` instead of reopening the old loan beside it. Two open loans would make top-ups and repayments ambiguous about which loan to post to. As a backstop for any legacy data already in that state, `createLoan`'s top-up lookup sorts by `createdAt: -1`, so it posts to the newest. A malformed `loanId` on the reverse route returns `404` (not a 500 CastError).

---
