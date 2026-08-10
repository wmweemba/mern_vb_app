# Chama360 — Parking Lot
> Out-of-scope items, deferred features, and ideas to revisit.
> When something is parked during a planning or build session,
> it goes here. Review at the start of each new sprint.

## Parked During Current Sprint

| Date | Item | Source | Notes |
|---|---|---|---|
| 2026-05-29 | Partial payment reversal — `reverseInstallmentPayment` currently requires `paid===true`, so partial payments cannot be reversed. Pre-existing gap, not introduced by this feature. | `docs/plan_partial-payments.md` §D.6 | When building this, consider that partial state is now valid — reversal logic will need to handle `paidAmount > 0` with `paid === false`. |

## Parked for Future Sprints

| Date | Item | Source | Notes |
|---|---|---|---|
| 2026-08-10 | **`flat` interest method double-charges.** `loanCalculator.js` charges `amount × rate` on *every* installment, so a 25%-over-8-weeks loan is billed 25% twice. Latent for any flat-rate group. | `docs/plan_configurable_group_rules.md` §2.1 | Belongs to the `term_flat` accrual strategy (Grocery Champions). Fix when that strategy is built — do not patch `loanCalculator.js` in isolation, it would change behaviour for existing flat-rate groups. |
| 2026-08-10 | **Loan guarantors + default offset.** Grocery Champions requires a named guarantor per loan; on default the member's contributions settle the loan, the guarantor covers the difference, and the member is excluded from share-out. | Grocery Champions constitution §15, §18 | Needs a `guarantorId` on `Loan` and a cycle-end offset routine. Champions only. |
| 2026-08-10 | **Exit forfeiture.** A member leaving mid-cycle forfeits all savings; outstanding loans must be settled first. | Grocery Champions constitution §10, §11 | Maps to the `exit: 'forfeit'` policy seam. Champions only. |
| 2026-08-10 | **Fine catalogue with weekly recurrence.** Named fine types with default amounts, re-applied every week the obligation stays unpaid (K100/week plus 4 named admin infractions). | Grocery Champions constitution §14 | Grace's group has no fines at all, so this is not on the critical path. Maps to a `finePolicy` seam. |
| 2026-08-10 | **Share-out calculation.** `profitSharingMethod` is stored but never calculated. Not needed for Grace (share-out is off-app), but **still required for Julie Mwamba's December 2026 cycle end** and existential for the SACCO segment. | `docs/plan_configurable_group_rules.md` §6 | Priority unchanged by the grocery work — it was deferred out of that plan's scope, not deprioritised. |

## Rejected (considered and decided against)

| Date | Item | Reason |
|---|---|---|
