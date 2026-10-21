---
paths:
  - "**/*{ontribution,Fund,fund}*"
  - "**/audit{BankBalance,Funds,SocialFund}.js"
---

# Contributions and named funds

Moved verbatim from CLAUDE.md on 2026-10-21; loads only when Claude works with matching files. Full prior file: `docs/history/CLAUDE-2026-10-21.md`.

## Contributions Feature — Architecture Notes

Added 2026-05-28. Key decisions recorded here to prevent regression:

1. **Dual-balance routing** — each `ContributionType` has `affectsMainBalance` (bool). Contributions route to either `BankBalance` (main lending pool) or `SocialFundBalance` (separate non-lendable pot). The recorder can override per-transaction; the override is stored as `overrodeDefault: true` on the `Contribution` row and never re-derived.

2. **Denormalized `typeName` on Contribution** — same defensive pattern as `Fine.username`. If a type is renamed or deactivated later, historical records still show the name used at record time.

3. **ContributionTypes are never hard-deleted** — only `active` is toggled. Deactivated types can't accept new contributions, but old Contribution rows keep a valid `contributionTypeId`.

4. **Transaction.userId for social-fund expenses** — the schema requires `userId: required: true`. For expenses with no member beneficiary, `userId` is set to `recordedBy` (the recording treasurer). The true beneficiary detail lives on `SocialFundExpense.beneficiaryMemberId`/`beneficiaryName`.

5. **Seeding** — every new group gets a zeroed `SocialFundBalance` and two default `ContributionType` docs ("Admin Fee" → main, "Social Fund" → pot). `scripts/seedContributionDefaults.js` backfills existing groups idempotently.

6. **Mongoose 8.x `create([...], { session })` with multiple docs** — requires `{ session, ordered: true }` or the operation throws. This is why the two ContributionType seed rows use `{ session, ordered: true }`.

7. **Audit script safety** — `auditBankBalance.js` explicitly handles `social_fund_credit`/`social_fund_debit` as `balanceEffect = 0` (excluded from main pool). The prior `default: balanceEffect = amount` catch-all would have silently counted them, producing false discrepancies.

---

## Named Funds — Architecture Notes

Added 2026-09-10 (Session 5 of `docs/plan_db_cutover_and_grace_migration.md`). Key decisions recorded here to prevent regression:

1. **`fundId: null` means the main lending pool — the main pool is NOT a GroupFund.** Folding `BankBalance` into a generic fund abstraction would rewrite the most load-bearing arithmetic in the app to solve a side-pot problem. Do not "tidy" this by giving the main pool a fund row.

2. **`ContributionType.affectsMainBalance` is deprecated but still written**, derived as `!fundId`. It is not the source of truth. **Destination resolution has a deliberate fallback:** a type with `affectsMainBalance: false` and no `fundId` (i.e. not yet backfilled) routes to the group's social fund. Removing that fallback would silently start crediting the main lending pool instead of the pot — the existing test suite catches this, so do not "simplify" it away.

3. **`FundExpense` is bound to the existing `socialfundexpenses` collection.** The rename from `SocialFundExpense` was a naming fix, not a data migration. Do not add a migration to rename the collection.

4. **`fund_credit` / `fund_debit` must stay explicitly handled at `balanceEffect = 0`** in `auditBankBalance.js`. The old `default: balanceEffect = amount` catch-all would silently count them and manufacture a discrepancy — the same trap the social-fund pair already documents.

5. **The App Subscription Fund is platform-layer, not template-layer.** Every group gets it on every template, seeded **inactive**. Paying for Chama360 is true of every customer; fines, share-out and social funds genuinely vary by group model. See P-013 in the second brain.

6. **Pointing a contribution type at a fund auto-activates that fund** (`contributionTypeController.resolveFundId`). That is the moment a group starts using the pot, and it removes the need for a separate activation screen.

7. **`SocialFundBalance` is deprecated, not dropped**, and `socialFundController` is a thin shim delegating to `fundController` — so there is exactly one balance per pot. Never reintroduce a second write path to a fund's balance.

8. **`GroupFund.resetsOnCycle` — the app subscription pot must NOT reset.** Members pay in one month for the next month's Chama360 bill, so that money spans cycles by design; `resetForNewCycle` skips funds with `resetsOnCycle: false`. `auditFunds.js` matches: resetting funds are audited against the current cycle, persisting funds against **lifetime** credits and debits. Changing either half without the other produces a false discrepancy at the first cycle turnover.

9. **`generateBackupReports` must pass explicit `fields` to json2csv.** Without them the parser throws on an empty array, and `beginNewCycle` fails outright — which meant every `grocery_chilimba` group (no fines by template) could never close a cycle. Do not remove the field lists.

11. **The Record Contribution form posts `fundId`, never `affectsMainBalance`.** `AddContributionForm.jsx` offers a fund `Select` (main pool + every active fund); the old main/social two-way toggle was removed 2026-09-11 because it made every third pot unreachable and could route subscription money into the lending pool. The backend still accepts the boolean for un-migrated callers — do not reintroduce it in the UI.

10. **Audit pots with `scripts/auditFunds.js`, never the old `auditSocialFund.js`** (deleted). That script had the same zero-`groupId` multi-tenancy defect `auditBankBalance.js` was fixed for in August, and was never fixed alongside it — its output was meaningless on a multi-group database.

---
