---
paths:
  - "**/*{roupSettings,emplate,nboarding,bligation,iability,ycle,cheduled}*"
  - "**/loanCalculator*"
  - "**/loanCalculator/**"
---

# Configurable group rules (Phases 1 to 5)

Moved verbatim from CLAUDE.md on 2026-10-21; loads only when Claude works with matching files. Full prior file: `docs/history/CLAUDE-2026-10-21.md`.

## Configurable Group Rules (Phase 1) — Architecture Notes

Added 2026-08-11 (Phase 1 of `docs/plan_configurable_group_rules.md`: template + policy architecture). **Behaviour-neutral for every existing group** — this phase only wires the seams; no new arithmetic ships until Phase 2 (revolving accrual). Key decisions recorded here to prevent regression:

1. **Templates are copied at group creation, never referenced live.** `GroupTemplate` is a small platform catalogue (`village_bank`, `grocery_chilimba` seeded by `scripts/seedGroupTemplates.js`). `groupController.createGroup` reads a template's `defaults`/`policies` once and writes them onto the new `GroupSettings` document; editing a template afterwards never retroactively changes an existing group. If the catalogue isn't seeded, `createGroup` falls back to a hardcoded constant matching the exact pre-Phase-1 literals, so group creation can never break on a missing template.

2. **`interestMethod` stays authoritative for scheduled loans — `policies.loanAccrual` doesn't override it.** `utils/strategies/loanAccrual/index.js`'s `resolveLoanAccrualStrategy()` only trusts the stored `policies.loanAccrual` value to pick a *family* (scheduled vs. revolving vs. term-flat). For the two scheduled families it re-derives reducing-vs-flat from `GroupSettings.interestMethod` every time, because Phase 1 doesn't expose a policy editor in the UI — an admin editing interest method via the existing Settings drawer must not silently stop taking effect because a stale policy value disagrees.

3. **`loanCalculator.js` is untouched.** `scheduledReducing.js`/`scheduledFlat.js` are thin wrappers around it. The `flat` branch's known double-charge defect (bills 25%-over-8-weeks groups like Grocery Champions twice) is unchanged and intentionally out of scope — it belongs to `term_flat` (parked, Champions only).

4. **`paymentController.repayment`'s allocation loop moved into the strategy, unchanged.** `applyPayment()` in `utils/strategies/loanAccrual/scheduledCommon.js` is an exact extraction of the sequential-installment-allocation algorithm that used to live inline — verified byte-for-byte against `tests/paymentController.test.js`'s 7 cases (partial payments, auto-fines, overpayment spanning installments, session rollback) with no test changes needed.

5. **Template switching is a separate, guarded endpoint.** `PUT /api/group-settings/template` (not the general settings `PUT`) — refuses to switch once the group has any non-archived `Transaction` (mid-cycle switch would silently restate every open loan's arithmetic, per the plan's §3.3 rule). There's no `Cycle` model yet (that's Phase 5), so "has the current cycle started" is approximated as "does this group have any transaction at all" — revisit once Phase 5 ships a real cycle boundary.

6. **Two new backfill/seed scripts, neither run against production yet.** `scripts/seedGroupTemplates.js` (creates the 2-template catalogue) and `scripts/backfillGroupSettingsPolicies.js` (persists `templateKey`/`policies` on existing `GroupSettings` docs, derived from their own `interestMethod`/`profitSharingMethod` — safe because Mongoose already applies the schema's `village_bank`-shaped defaults to any document that predates these fields, so nothing was silently wrong before this ran either). **Not yet executed against the shared Atlas database** — run manually when ready, per the outstanding DB-cutover plan.

7. **Onboarding wizard is now template-length, not fixed-4-step.** `pages/Onboarding.jsx`'s step list is computed from the chosen template (`steps = ['template','details','lending', ...('fines' if features.fines), 'confirm']`) — a `grocery_chilimba` selection skips the Fine Rules step entirely and swaps the Lending Rules fields (no interest method / loan-limit multiplier; adds the interest-quota amount when `policies.interestObligation === 'per_member_quota'`). This is a deliberate, plan-mandated deviation from `UI_SPEC.md` §6.12's literal "4 pills" — the pill *pattern* is unchanged, only the count is now dynamic. **Not verified live in a browser** — `/onboarding` requires a signed-in Clerk session with no existing group, which needs real (or throwaway) Clerk credentials; verified via `pnpm build` + code review only.

---

## Configurable Group Rules (Phase 2) — Architecture Notes

Added 2026-08-12 (Phase 2 of `docs/plan_configurable_group_rules.md`: revolving monthly loan accrual, scoped to Grace Kalele's group). Key decisions recorded here to prevent regression:

1. **Revolving loans never touch `installments[]`.** `Loan.accrualMode` (`'scheduled' | 'revolving'`) is the switch every controller checks first. A revolving loan's single source of truth is `principalBalance + interestOutstanding`, restated by an append-only `entries[]` ledger. Any code that reads `loan.installments` for a revolving loan will just see an empty array — that's intentional, not a bug to "fix" by populating it.

2. **Accrual is not a cash movement.** `revolvingMonthly.accrue()` creates no `Transaction` and never calls `updateBankBalance` — it only restates `principalBalance`/`interestOutstanding` on the loan document. Only `onDisburse` (money leaving the pot) and `applyPayment` (money entering it) touch the bank balance and log a `Transaction`. Adding a `Transaction`/balance call to `accrue()` would double-count — the group's total lending pool doesn't shrink or grow just because interest was calculated.

3. **Payment allocation is member-directed, not a fixed waterfall — confirmed by Simon Peter, not assumed.** `paymentController.repayment` accepts an optional `allocation: { toInterest, toPrincipal }` for revolving loans; omitted, it defaults to interest-first. A fixed interest-first rule with no override would silently misrecord any member who directs payment differently (principal-only, or a stated split), and the group's balances would diverge from their own tracking within a month. `revolvingMonthly.applyPayment` rejects (400, not silently clamped) both an allocation that doesn't sum to the payment amount and a payment that exceeds the loan's total outstanding balance.

4. **Capitalisation is gated on `policies.arrears === 'capitalise'` and never fires for a scheduled loan.** When it does fire (`revolvingMonthly.accrue`), unpaid `interestOutstanding` folds into `principalBalance` *before* that period's new interest is computed — so a capitalising group is charged interest on the larger, post-capitalisation balance in the same period the capitalisation happens. This is real, observed behaviour in Grace's group, not a synthetic edge case; it has first-class golden tests (`tests/strategies/revolvingMonthly.test.js`).

5. **"Run Month-End Interest" is a treasurer-triggered batch action, idempotent per `periodLabel`.** `POST /api/loans/accrue-month-end` accrues every open revolving loan in the group inside one session; a loan that already has an `entries[]` row of `type: 'accrual'` for that `periodLabel` is skipped, so re-running the same month is always safe. There is no scheduled/cron version of this — a human runs it once a month, with `GET /api/loans/accrue-month-end/preview` powering the confirmation screen first (UI_SPEC.md §6.18: this moves every member's balance at once, so it is never a single-tap action).

6. **A member's active revolving loan is topped up, not duplicated.** `loanController.createLoan`, when the group's resolved accrual family is `revolving_monthly`, looks for the member's existing open (`fullyPaid: false`) revolving loan first and calls `onDisburse(loan, amount, ctx)` on it instead of creating a second `Loan` document. This mirrors the workbook's "New Loan total" column (old balance + new borrowing merge into one running figure) and keeps `entries[]` as the complete history for a member's one ongoing loan.

7. **`savings_multiple` loan-limit checking is skipped when `policies.loanLimit === 'none'`**, not just left in place and coincidentally passing. Grace's group has no savings-based cap — checking it anyway would either block valid loans or require faking a multiplier. The `projected_cycle_contribution` cap from the plan's §2.6 (fee + interest quota + contribution × months) is a **separate, later strategy** — not built in Phase 2, and `loanLimit` stays `'none'` for `grocery_chilimba` until it lands.

8. **`deleteLoan` and `updateLoan` both need a revolving-aware branch, or they silently do the wrong thing with real money.** Before this phase, `deleteLoan`'s "has this loan had any payments" check only looked at `installments[]` — for a revolving loan that's always empty, so the check would have let a treasurer delete a loan with real payment/top-up history and refund only the *original* disbursed `amount`, not the current `principalBalance` (which may have grown via top-ups). Fixed by checking `entries[]` for anything beyond the single opening disbursement, and refunding `principalBalance` instead of `amount` for revolving loans. `updateLoan` on a revolving loan now only allows editing `notes` — amount/duration edits are meaningless without a fixed schedule, and a balance change belongs in `createLoan` (top-up) or a payment, never a direct field edit.

---

## Configurable Group Rules (Phase 3) — Architecture Notes

Added 2026-08-12 (Phase 3 of `docs/plan_configurable_group_rules.md`: interest quota tracking). Key decisions recorded here to prevent regression:

1. **Derive the report, store only the target.** `GroupSettings.interestObligationAmount` is the only stored number (added in Phase 1). Everything in the Interest Obligation report — credited from loans, credited from contributions, shortfall — is computed fresh from `Loan` and `Contribution` records on every request in `controllers/interestObligationController.js`. A stored running total would drift from the transactions that feed it the first time a payment is reversed or a fine is voided; a derived figure structurally cannot.

2. **Credited-from-loans works for both accrual families, not just revolving.** `interestPaidOnLoan(loan)` branches on `accrualMode`: revolving loans sum their `entries[]` of `type: 'interest_payment'` (the ledger already tracks this exactly); scheduled loans credit a paid installment's full `interest`, or — for a partial (`paid: false, paidAmount > 0`) — `min(paidAmount, interest)`, mirroring the interest-first allocation convention `utils/strategies/loanAccrual/scheduledCommon.js` already uses elsewhere. No group currently has both a scheduled accrual and an active quota, but the function is written to be correct if one ever does, rather than silently under-reporting.

3. **Shortfall is a floor, never a credit-back.** `shortfall = max(0, target − credited)`. A member who over-delivers (paid more interest or top-up than their quota) shows `0`, not a negative number — confirmed by Simon Peter: surplus stays in the pot or rolls over, it is never refunded or converted into extra groceries. Don't "fix" a negative-looking shortfall by subtracting it elsewhere; `0` is correct.

4. **`countsTowardInterestObligation` is denormalized onto `Contribution` at record time**, not resolved live via `contributionTypeId`. Same defensive instinct as `typeName`/`affectsMainBalance` (§ Contributions Feature notes above) — if a treasurer later flips a type's quota flag, every already-recorded contribution must keep reporting under the rule that was true when it was recorded, or historical Interest Obligation reports would silently restate themselves.

5. **The "Interest Top-Up" contribution type is seeded conditionally, not unconditionally.** `groupController.createGroup` only creates it when the resolved template's `policies.interestObligation === 'per_member_quota'` (currently `grocery_chilimba`) — adding it to every `village_bank` group would give admins a meaningless type with no corresponding quota to service. `scripts/seedContributionDefaults.js` mirrors this conditional for backfilling existing groups (checks each group's own `GroupSettings.policies.interestObligation`, not the template).

6. **No `Cycle` model yet, so "credited this cycle" means "not archived."** The plan's Phase 5 (a real `Cycle` model with explicit start/end dates) hasn't shipped. Until it does, the Interest Obligation report follows the same convention every other cycle-scoped aggregate in this codebase already uses (e.g. the loan-limit savings check in `loanController.createLoan`): `archived: { $ne: true }`. A "Begin New Cycle" reset is what resets a member's credited total to zero, not a date boundary.

7. **Route middleware gotcha, caught before merge:** `middleware/auth.js`'s `requireRole` takes a single role or an **array** of roles — it is not variadic. `requireRole('admin', 'treasurer', 'loan_officer')` silently only enforces `'admin'` (extra arguments are dropped); the correct call is `requireRole(['admin', 'treasurer', 'loan_officer'])`. Grep for `requireRole(` before adding a new multi-role route rather than copying a `allowRoles(...roles)` call from `loanController`/`paymentController`-style routers, which use a different, genuinely variadic local helper.

---

## Configurable Group Rules (Phase 4) — Architecture Notes

Added 2026-08-12 (Phase 4 of `docs/plan_configurable_group_rules.md`: membership fee as a liability). Key decisions recorded here to prevent regression:

1. **No new model — any `ContributionType` can become a liability.** `targetAmountPerMember > 0` is the only signal. This was a deliberate minimalism call in the plan itself ("no new model, no new controller"): a treasurer can put a target on the existing default "Admin Fee" type rather than needing a dedicated "Membership Fee" type seeded for them. Don't add an auto-seeded liability type later without checking whether the group actually wants a *second* fee, separate from Admin Fee — the plan's Grace Kalele case uses exactly one.

2. **Same derive-don't-store discipline as Phase 3.** `controllers/contributionLiabilityController.js` stores nothing beyond the target on `ContributionType`; paid/outstanding are computed fresh from `Contribution` records on every request. `outstanding = max(0, target − paid)` floors at zero — an overpaying member shows `0`, not a negative "credit," consistent with how Phase 3's shortfall handles over-delivery.

3. **`cycleSettlementDeadlineDays` is stored but inert.** Added to `GroupSettings` because the plan explicitly names it as shared by loans and liability fees, but there is nothing to enforce it against yet — confirmed by checking `NewCycleBanner.jsx`, which is a fully static "Cycle 12 ends soon" stub with no real date logic behind it. Don't build "is this fee overdue" UI against this field until Phase 5's `Cycle` model gives it a real cycle-end date to subtract from; a fabricated date would be worse than no deadline indicator at all.

4. **The Settings UI target editor is a separate inline control from the existing rename flow**, not a merge of the two. `ContributionTypesManager.jsx`'s pencil-icon rename (`editingId`/`editName`) and the new target badge (`editingTargetId`/`editTargetValue`) are independent pieces of state — a type can be mid-rename and have its target edited by a different control without the two clobbering each other. If extending this component further (e.g. Phase 5 per-cycle target overrides), keep new inline editors on their own state rather than folding into `editingId`.

---

## Configurable Group Rules (Phase 5) — Architecture Notes

Added 2026-08-12 (Phase 5 of `docs/plan_configurable_group_rules.md`: Cycle model + per-cycle configuration snapshot). Key decisions recorded here to prevent regression:

1. **`models/Cycle.js` is additive — nothing that reads `archived`/`cycleNumber` on Loan/Saving/Fine/Transaction/Contribution/SocialFundExpense had to change.** Those fields, and the `archived: { $ne: true }` convention Phase 3's notes already documented as "cycle boundary approximated as not-archived," are unchanged and still authoritative for every existing query. `Cycle` adds real `startDate`/`endDate`/`settingsSnapshot` on top, for the two things that convention structurally cannot give: a bound to validate a backdated entry against, and a frozen copy of the rules that were in force. Existing groups have no `Cycle` document until their first reset under this code (or a manual backfill) — `resolveEntryDate` and `getCurrentCycleNumber` both fall back to pre-Phase-5 behaviour when one doesn't exist yet, so this ships with zero behaviour change for any group that hasn't touched Begin New Cycle since deploying it.

2. **`archiveCurrentCycleData` now filters on `archived: { $ne: true }` — this was audit finding #3, and it was live.** Before this fix, every `beginNewCycle` call re-stamped *every* loan/saving/fine/transaction row in the group — including ones already archived from a prior cycle — with the new cycle's `cycleNumber`/`cycleEndDate`. A group on its third reset would have had cycle 1's historical records silently relabelled as cycle 3. `resetForNewCycle`'s `deleteMany` calls remain effectively a no-op after archiving (nothing matches `archived: { $ne: true }` once the archive step has run) — the actual "reset" has always been the archived-flag tagging, not real deletion; this is intentional and unchanged, not a bug introduced here.

3. **Contribution and SocialFundExpense are now archived/reset by `beginNewCycle` — this was audit finding #4.** Previously neither collection was touched by a cycle reset at all, so contribution and social-fund-expense records from a closed cycle kept showing up in every `archived: { $ne: true }` query (Interest Obligation report, contribution liability report, dashboard) indefinitely. `SocialFundBalance` is now zeroed alongside `BankBalance` in the same reset, for the same reason.

4. **`beginNewCycle` is now wrapped in a MongoDB session/transaction — it wasn't before.** This is a genuinely new behaviour, not just a bugfix: previously a failure partway through (e.g. the cycle-reset Transaction log throwing) left the group in a partially-archived, partially-reset state with no rollback, silently swallowed by a `catch` that deliberately didn't re-throw. That catch is now gone; a failure anywhere in the reset rolls back everything, per the project's existing "failed operations must automatically rollback" rule for money-moving code. `generateBackupReports` (read-only) still runs ahead of the transaction, unchanged.

5. **Cycle 1 is opened at group creation, from the same `cycleStartDate` the onboarding wizard already collected and the backend already accepted but silently discarded.** `groupController.createGroup` now reads `req.body.cycleStartDate` (falls back to "now" if blank) and calls `cycleLengthMonths` from the just-created `GroupSettings` doc to compute `endDate`. No frontend change was needed — the wizard was already sending this field.

6. **Backdating (`date`/`createdAt`) is opt-in per request, not a new required field.** `loanController.createLoan`, `savingsController.createSaving`, and `contributionController.recordContribution` all accept an optional date field; omitting it behaves exactly as before ("now"). Supplying one is gated to `admin`/`treasurer` regardless of which role the route itself allows (loans/savings routes also permit `loan_officer` to create records at all — that's unchanged; only the backdating override is narrower), and is validated against the group's open `Cycle` bounds via `utils/cycleHelpers.resolveEntryDate`. A group with no `Cycle` document yet is **not** restricted (same fallback as above) — this matches `savings.date`'s pre-existing, previously-unrestricted behaviour rather than tightening it retroactively.

7. **The backdated date is threaded through to the `Transaction` log, not just the source record.** `logTransaction` now accepts an optional `createdAt`; every call site in the three controllers above passes the resolved entry date through. Without this, a backdated loan would show correctly on the Loan document but still appear in Recent Activity / exports dated "today" — the two would disagree.

8. **`GroupSettings.cycleStartDate` doesn't exist as a stored field — cycle boundaries live only on `Cycle`.** Don't add a duplicate date field to `GroupSettings` for this; the settings document is intentionally single-cycle-snapshot-free, and `Cycle.settingsSnapshot` is where a frozen copy of settings belongs once a cycle closes.

---
