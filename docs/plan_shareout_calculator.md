# Plan: Cycle-end share-out calculator

**Status:** planned 2026-10-23 (Opus, with William). Not started. **S0 gates everything below.**
**Why now:** Campaign 2 pillar C3 "Share-out made simple" leads November and December. Three
competitors already claim automated share-out (ComGrow, Tenga, and Airtel Money Village Banking
for statements; see `wsm-second-brain/ventures/saas/chama360/competitive/2026-10-23-monitoring.md`).
Accountant-treasurers (Julie Mwamba's group) will ask for this first. `profitSharingMethod` is stored in `GroupSettings` but never calculated (PARKING_LOT 2026-08-10).
**Target:** live and verified on the demo environment by **Sat 14 Nov 2026**. C3 copy may claim
share-out only after S6 passes.
**Honest framing:** Julie's group is not on Chama360 yet, so their December 2026 share-out
happens on paper either way. No current customer needs this in December (Grace's group is
`pooled_external`). The reasons are marketing, competitive and January sales, so keep scope tight.

## What exists today (read 2026-10-23)

- `GroupSettings.profitSharingMethod`: `proportional | equal`. `policies.cycleEnd`: `pooled_external | shareout_equal | shareout_proportional`. `features.shareOut` on `GroupTemplate` (false for `grocery_chilimba`).
- `Saving.interestEarned` = deposit × `savingsInterestRate` at deposit time (`savingsController.js:30`). Whether this is a promised return or a stand-in for profit share is **unknown** and decides the formula (D3).
- Loans are of two kinds: `accrualMode: 'scheduled'` (installments with `interest` and `paidAmount`) and `'revolving'` (an `entries` ledger, `principalBalance`, `interestOutstanding`).
- `Transaction.type` already includes `'payout'` (only a manual record today, `paymentController.js:204`).
- **Trap:** `beginNewCycle` → `resetForNewCycle` **deletes** every unarchived Loan, Saving, Fine, Contribution and FundExpense, zeroes `BankBalance`, and zeroes every `GroupFund` with `resetsOnCycle !== false`. Today, money owed on open loans simply disappears at cycle end. Share-out must run, and be recorded, **before** this, and it must deduct outstanding balances.
- Audit scripts to reuse for reconciliation: `scripts/auditBankBalance.js`, `scripts/auditCurrentCycle.js`, `scripts/auditFunds.js`.
- Open audit findings from 2026-07-12: **#1 rounding drift** and **#2 overpayment on the scheduled path**. Both skew interest totals. No fix found in CHANGELOG.

## Decisions

| # | Decision | Status |
|---|---|---|
| D1 | Share-out is a **two-step flow**: a read-only preview, then a finalise that writes a frozen `ShareOut` snapshot and payout transactions. `beginNewCycle` refuses to run for `shareout_*` groups until the current cycle has a finalised share-out. `pooled_external` groups are unchanged. | proposed |
| D2 | **Profit pool, top-down with a bottom-up cross-check.** Pot = bank balance + loan balances still owed (principal + interest outstanding) − ring-fenced funds (social fund, any `resetsOnCycle:false` fund). Profit = pot − total savings principal. Cross-check: interest collected + fines paid + other income − cycle expenses. A mismatch over K1 is a blocking warning on the preview, never silently absorbed. | proposed, confirm in S0 |
| D3 | **Savings interest.** Either (a) `interestEarned` is a guaranteed return paid first and the rest is split, or (b) it is ignored and members get only their profit share. The default follows the S0 group's real sheet; if groups differ it becomes a setting. | **open, S0** |
| D4 | Methods for v1: `proportional` (to savings principal at cycle end) and `equal`. Time-weighted share-months (VSLA style) is **out of v1** unless S0's real group uses it. | proposed |
| D5 | **Deductions** come out of each member's line: outstanding loan balance, then unpaid fines. A line that would go negative is shown as "owes the group K__", is never netted against another member, and blocks finalise until the treasurer chooses one of: record a payment, carry the debt into the next cycle (as a new opening loan), or write it off with a reason (audit-logged). | proposed |
| D6 | **Rounding:** compute in ngwee as integers, round each line down to the group's display precision, and hand out the remainder by largest remainder. The lines must sum exactly to the pot. | proposed |
| D7 | Finalise is **one MongoDB transaction**: `ShareOut` doc, one `payout` Transaction per member, closing loan entries for deducted balances, BankBalance adjustment. It is idempotent (one finalised share-out per group per cycle, unique index). | proposed |
| D8 | Visibility: treasurer, admin and loan_officer see the full table. A member sees **only their own line** (matches the C2 rule, members see their own data). | proposed |
| D9 | No manual per-member adjustments in v1, apart from the D5 choices. | proposed |

## Sessions

About 3 hours each, evenings. Built with `/build` (NS-025): Opus plans and gates, Sonnet/Haiku implement.

| # | Session | Done when | Blocks |
|---|---|---|---|
| **S0** | **Rules call** (lunch, not code). Get last year's share-out sheet plus the rules from Julie's treasurers, or any running group: how profit is worked out, savings interest, fines, how outstanding loans are handled, rounding. | One real worked share-out (inputs and per-member results) saved as a test fixture, with names replaced. D2, D3 and D4 confirmed or changed here. | everything |
| S1 | Audit findings #1 and #2: confirm whether still open on both loan paths, fix if so, with tests | Interest totals reproducible from the ledger. `auditCurrentCycle.js` clean on demo data | S3 |
| S2 | Pure engine `utils/shareout/calculate.js` (no DB): pot, profit, method, deductions, D6 rounding | Unit tests pass, including the **S0 golden test reproducing the real sheet to the ngwee**, equal and proportional cases, a negative-line case, and a zero-profit case | S3 |
| S3 | `GET /api/cycles/current/shareout/preview`: gathers cycle data for both loan modes, runs the engine, checks against BankBalance and the audit scripts, returns warnings | Integration tests (`MongoMemoryReplSet`) on a seeded cycle. Role scoping (D8) tested | S4, S5 |
| S4 | `POST /api/cycles/current/shareout/finalise` + `ShareOut` model + the `beginNewCycle` gate (D1, D5, D7) | Tests: atomic rollback when one write fails, idempotent second call, gate blocks reset, `pooled_external` unaffected, negative-line choices recorded in AdminAuditLog | S5 |
| S5 | Frontend: Share-out screen (preview table, warnings, D5 choices, confirm modal), a member's own-line view, PDF and Excel statement. `UI_SPEC.md` tokens only | `pnpm build` and `pnpm test` green. Run end to end in a browser on a local seeded group | S6 |
| S6 | Demo seed with a finished cycle and a finalised share-out (`demo.chama360.nxhub.online`), CHANGELOG + version, `/ship --preflight`, deploy, verify on demo | William can screen-record share-out on demo for C3. Production verified with no customer data touched | C3 copy |

**Calendar (assumes S0 lands by Fri 30 Oct):** S1–S2 the week of 2 Nov, S3–S4 the week of 9 Nov, S5–S6 by Sat 14 Nov. If S0 slips, the whole chain slips and C3 stays on the softer angle ("the year's numbers already recorded, so share-out starts from figures everyone has seen").

## Out of scope (v1)

Time-weighted share-months (unless S0 needs it), grocery-pool purchase splits (`pooled_external`), SACCO share capital and dividends (no `ShareCapital` model; separate product question), guarantor offsets (Grocery Champions, PARKING_LOT), mobile-money disbursement of payouts (payouts are recorded, not sent), and editing a finalised share-out (a reversal path is a later build if anyone needs it).

## Risks

- **No real sheet:** without S0 the engine encodes a guess, and the first time a treasurer runs it is the moment trust is won or lost. Do not start S2 without the fixture.
- **Data quality:** share-out reads everything recorded in the cycle, so any mis-recorded payment shows up as a wrong payout. The D2 cross-check and the audit scripts are the guard; the preview must say clearly what didn't reconcile.
- **Capacity:** about 6 evenings against BazaBooks (still the number 1 priority) and Campaign 2's ~3.5 h/week. If an evening has to choose, BazaBooks outreach wins.
