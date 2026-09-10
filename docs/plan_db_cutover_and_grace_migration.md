# Plan — Coolify production DB cutover + Grace's group data migration

**Written:** 2026-09-09
**Supersedes the sequencing in:** `docs/plan_configurable_group_rules.md` Phases 6 and 7 (which remain the spec for *what* to do; this doc is the *order*, the *gates* and the *session breakdown*).
**Source data:** `Grocery Chilimba Group Data-Migration-Sep2026.xlsx` (Simon Peter, 2026-09-09) — Google Drive, `Client Details/Grocery Chilimba/Grace Group/`.

---

## READ FIRST — current state as at 2026-09-10

**Done: Sessions 1, 2, 3, 4 and 5.** Production runs on a dedicated private Coolify Mongo
holding exactly one group (Grace's), auditing clean. Atlas is the dev database holding
exactly the 6 dev groups the inventory table specifies. Phases 2–5 are merged and
deployed. Named funds are shipped, and the fund backfill has been applied to **both**
databases.

**Next: Session 6** — write and dry-run `scripts/importGraceCycle.js`.

**Production verified 2026-09-10 after the funds backfill:**

- `auditBankBalance.js --all` — one group, K-3050, reconciles, `EXIT=0`, no orphan
  warnings. Byte-identical before and after the backfill, which is the proof it touched
  no main-balance money.
- `auditFunds.js --all` — Grace's two pots both reconcile at K0. The App Subscription Fund
  shows `(inactive) [persists]`. **`[persists]` is the marker that matters**: it means a
  cycle reset will not wipe subscription money, which it would have done silently at their
  November cycle end before this was fixed.
- Her social fund carried across at K0, confirming nothing was lost during the window when
  production briefly had the named-funds code with no `GroupFund` rows.

**Run backfills as part of the deploy, not after it.** The window above happened because
the fund backfill was applied to Atlas and then the code was pushed, which auto-deploys.
Low impact here only because the fund was empty.

### ⚠️ The one mistake that would do real damage

**`mern_vb_backend/.env` points at ATLAS, which is now the DEV database.** Any script run
locally — `node scripts/anything.js` — hits dev, never production. That is correct and
intended.

It also means: **running a delete script locally would destroy the dev groups that are
deliberately being kept in Atlas**, which is the exact opposite of the intent. Before any
destructive script, print the target host and confirm which database you are on.

Production is only reachable from inside the Coolify Docker network:

```bash
ssh -i ~/.ssh/hetzner_coolify root@78.47.128.95 "docker exec $(docker ps --format '{{.Names}}' | grep '^jgk8cwgs4s0w844cw8ksw') node scripts/<script>.js <args>"
```

Coolify renames the backend container on every redeploy, so resolve the name with `grep`
rather than hardcoding it. Full detail in `CLAUDE.md`.

### Group inventory — both databases

Production and Atlas hold identical group sets (the cutover was a full copy). **Only
Grocery Savings Group belongs in production; all six others belong only in Atlas.**

| Group | `_id` | Prod | Atlas |
|---|---|---|---|
| Grocery Savings Group (Grace's, live customer) | `6a75a334ba20ae75b763e2cb` | keep | remove |
| William's Group | `69d641697236ea09109643e2` | remove | keep, cycle-reset |
| Test group 1 | `69f391848dbc4c12889e5f9f` | remove | keep |
| ZZZ_TEST Demo Grocery Group | `6a7c48724a5ab60a09a37c67` | remove | keep |
| Pamo Village Bank | `69f0a127b9e11b33d7209973` | remove | keep |
| Dev Chama | `6a184f38269287ae9b38f919` | remove | keep |
| Mfinance Grocery Chilimba | `6a90265e7de2d763a9fbf653` | remove | keep |

All six non-Grace groups are currently **soft-deleted in production** (`deletedAt` set) —
the three that were still active were soft-deleted 2026-09-09 via Platform Admin. They are
invisible to the app and excluded from audits, but their data is still present.

### Verifying anything against production

`scripts/auditBankBalance.js` is strictly read-only and safe to run against production. As
at 2026-09-09 it audits **one** group (Grace's), reports it clean, and exits 0. Six
orphaned `BankBalance` warnings are expected and **do not** affect the exit code — that is
driven solely by discrepancies across audited groups.

Grace's group figures, confirmed identical in Atlas pre-cutover and in production after:
recorded K-3050, 11 transactions (8 SAVING/K5600, 2 LOAN/K9000, 1 LOAN_PAYMENT/K350),
difference K0.00. This is **trial data**, cleared in Session 7 step 1.

### Confirmed environment facts

- **Clerk is split into two instances.** Production (`pk_live_`, custom domain
  `clerk.chama360.nxhub.online`) and Development (`pk_test_`, `mint-sunbird-58.clerk...`).
  Coolify frontend and API env vars were both verified correct on the Production instance
  2026-09-09.
- Local dev uses the **Development** Clerk instance, so `scripts/createThrowawayTestUser.js`
  still works exactly as `CLAUDE.md` describes — and its users now land in Atlas/dev, not
  production.
- Grace's 25 members carry **Production**-instance Clerk IDs, so they cannot authenticate
  against dev. Their Atlas copy is inert as well as unwanted.

---

## 0. The thing that changes the plan

**Phases 2–5 are not in production.** `main` (v3.13.2; head has moved past `4e87ad3` with docs commits only) has no `revolvingMonthly` strategy, no `Loan.accrualMode`/`principalBalance`/`entries[]`, no interest-quota tracking, no membership-fee liability, no `Cycle` model. All of it sits unmerged on `feature/configurable-group-rules-phase2`.

Grace's group is a revolving credit line — 10%/month on outstanding, no schedule. **Her data cannot be imported into production as it stands today.** Any import against `main` would create fixed-installment loans, which is structurally the wrong shape and would have to be thrown away.

So the real remaining work is three things, not two:

1. Cutover Atlas → Coolify (infrastructure, no code)
2. Merge and deploy Phases 2–5 (code, no data)
3. Import Grace's June–August cycle (data, no code beyond a one-off script)

Plus the dev-environment split, which is mostly a consequence of (1).

---

## 1. Recommended order — and why it differs from the old note

`_overview.md` item 10 listed build order as "…Phase 5 → Coolify cutover → Grace's import". It never actually decided where the *deploy* of Phases 2–5 sits relative to the cutover. Recommendation:

> **Cutover first. Then deploy Phases 2–5. Then import.**

Reasoning: the cutover is a pure infrastructure move with zero code change (copy data, swap `MONGODB_URI`, redeploy). Doing it while production is at a known-good, well-understood state is the cleanest moment available. It also delivers a verified backup/restore on the new production box *before* the first schema-touching feature deploy lands — so if Phases 2–5 misbehave against real data, there is somewhere to roll back to. Doing it the other way round means the first thing the new database ever receives is a large untested feature deploy.

Still true from the original plan: **the cutover precedes the import**, so Grace's cycle data is born on Coolify and never migrated twice.

---

## 2. Session breakdown

Seven sessions. Session 3 is human-facing and belongs in a lunch block; the rest are evening/build work. Sessions 4 and 5 were split from one after the named-funds design landed (section 7) — merging a large feature branch and building a new model are not one session's work.

### Session 1 — Coolify Mongo + cutover — DONE 2026-09-09

Grace's 25 members are live and paying. This is a real maintenance window, not a quiet change.

1. Stand up MongoDB as a Coolify service on the Hetzner box, alongside NdalamaHub's. Confirm it is **not publicly reachable** — internal Docker network only.
2. `mongodump` from Atlas (`mern-vb-cluster`/`mern_vb_app`). Keep the dump; it is the rollback.
3. `mongorestore` into Coolify Mongo. **Full copy, not selective** — cheaper, reversible, and preserves every `_id` reference. Pruning Atlas down to demo-only data is Session 2 work, done on the copy that is no longer production.
4. Swap `MONGODB_URI` on the API service in Coolify. Redeploy.
5. Verify: sign in as a real user; Grace's group dashboard totals match the pre-cutover figures recorded in step 2; `auditBankBalance.js --all` reproduces the same per-group numbers as before the move (including William's Group's known ~K18,177 gap — it should still be exactly K18,177, unchanged, which is itself a good integrity check).
6. Configure backups on the Coolify Mongo **and test one restore.** Not optional — Phase 6 point 6 of the original plan, and the reason for doing the cutover before the feature deploy.

**Outcome.** Dedicated Mongo instance stood up (deliberately separate from NdalamaHub's, so one root credential does not span two apps' data — better than this plan's original "alongside"). Full `mongodump`/`mongorestore`. Verified: `auditBankBalance.js --all` reproduced the pre-cutover baseline exactly, William's Group's -K18,177 unchanged. Daily backups to Cloudflare R2, restore into a scratch DB tested. Production script access resolved via `docker exec`, documented in `CLAUDE.md`.

**Independently re-verified 2026-09-09:** `/tmp/pre-cutover-audit.txt` reproduces byte-for-byte when the audit is re-run against Atlas today (13,518 bytes, `diff` clean), which confirms both that the baseline is genuine and that Atlas has been untouched since — the rollback is intact. TCP 27017/27018 on the Hetzner IP are closed from the internet. Local `.env` still resolves to Atlas.

**Residual this session created — see Session 2.** "Full copy, not selective" was the right call for the cutover itself, but it carried **all 7 group documents** into production when only Grace's belongs there. Left unaddressed, William's Group's -K18,177 makes `auditBankBalance.js --all` exit non-zero against production permanently, which destroys the release gate the script was fixed in August to provide — right before an import whose verification depends on it.

**Closed 2026-09-09:** Clerk is split into Production and Development instances, and the Coolify frontend and API env vars were both verified correct on the Production instance. See the READ FIRST block.

**Solved during the session:** once Coolify Mongo is private, how do you run `auditBankBalance.js` against production? The `CLAUDE.md` verification loop depends on it. Two workable answers — pick one and write it into `CLAUDE.md`: run the script via `docker exec` inside the Coolify network, or reach it over Tailscale with a temporary port-forward. Decide now; discovering this on release night is worse.

### Session 2 — Clean both databases + dev environment (~2.5h)

After the cutover, Atlas *is* the dev database. Two jobs: get each database holding only what belongs in it, and make the separation enforced rather than nominal.

**2a. Production — prune to Grace's group only.**

Production currently holds 7 group documents. One belongs there.

| Group | Members | Tx | Keep in prod? |
|---|---|---|---|
| Grocery Savings Group (Grace's) | 25 | 11 | **Yes — the only one** |
| William's Group | 23 | 176 | No — dev/demo, carries the -K18,177 drift |
| Test group 1 | 1 | 2 | No |
| ZZZ_TEST Demo Grocery Group | 1 | 3 | No — throwaway, should have been cleaned up |
| Pamo Village Bank *(already soft-deleted)* | 2 | 0 | No |
| Dev Chama *(already soft-deleted)* | 1 | 2 | No |
| Mfinance Grocery Chilimba *(already soft-deleted)* | 1 | 0 | No |

**Step 1 — DONE 2026-09-09. Soft-deleted the three active ones via the Platform Admin Danger Zone.**
`adminGroupsController.softDeleteGroup` sets `deletedAt`, and there is a restore path that
nulls it. No script, no database access, no risk of hitting the wrong database — it runs
through the app's own supported path as super admin.

This **restored the audit gate**, confirmed by running the audit on production: one group
audited (Grace's), clean, `EXIT=0`. `--all` targets `Group.find({ deletedAt: null })`. Orphaned `BankBalance`
documents are report-only and never affect the exit code (verified in the script), so the
orphan count rising to 6 is cosmetic.

Checked: **super admin does not depend on group membership** — it resolves from the
`SuperAdmin` collection by `clerkUserId`, so removing William's Group from production
cannot lock anyone out.

**Step 2 — DONE 2026-09-09. Hard delete, after `scripts/deleteGroups.js` was fixed
(`01175f4`).** All six groups removed. Production went from 7 group documents to 1.

> **`deleteGroups.js` is incomplete and must not be run against production as it stands.**
> It clears 10 collections; **16 models currently carry a `groupId`** (17 once Session 4
> merges — the branch adds `Cycle`). The script predates the Contributions feature
> (2026-05-28) and was never updated. Running it as-is orphans six collections' worth of
> rows.

**Covered today (10):** `GroupMember`, `GroupSettings`, `BankBalance`, `Loans`, `Savings`,
`Transaction`, `Fine`, `Threshold`, `InviteToken`, `PendingInvite`.

**Missing (6):** `SocialFundBalance`, `SocialFundExpense`, `ContributionType`,
`Contribution`, `SupportRequest`, `AdminAuditLog`.

**Add after Session 4 merges (1):** `Cycle`.

Required behaviour for the fixed script:

1. Cover every `groupId`-bearing model. Derive the list by inspection, don't trust this
   doc to stay current — `grep -l groupId mern_vb_backend/models/*.js`.
2. **Target by `_id`**, not slug. The six ids are in the READ FIRST inventory above.
3. **Dry-run by default.** Print per-collection counts that *would* be deleted and exit
   without writing. Require an explicit `--apply` to write.
4. **Print the resolved database host before doing anything**, and refuse to `--apply`
   against an Atlas/`mongodb+srv` URI. Running this locally would delete the dev groups
   that are deliberately being kept — see the warning in READ FIRST.
5. Idempotent: re-running after a successful delete reports zero and exits 0.
6. Never touch `Group` documents not named in the id list, and never touch the
   `SuperAdmin` collection (no `groupId`; unrelated).

Take a fresh production `mongodump` immediately before `--apply`. Run via `docker exec`.

**Verified after the hard delete:** no orphan warnings, one group audited, `EXIT=0`.

---

**Step 3 — DONE 2026-09-09. Two problems the hard delete exposed.**

**(a) A latent super-admin scoping bug went live.** `middleware/resolveGroup.js`'s
super-admin branch called `next()` with `req.groupId` and `req.groupScope` left undefined
when the super admin had no `GroupMember` record. Controllers do
`find({ ...req.groupScope })` — spreading `undefined` yields `{}`, and Mongoose drops
undefined keys — so **every group-scoped query returned the entire collection**, and
`cycleController.resetForNewCycle`'s `deleteMany({ groupId, archived: { $ne: true } })`
would have deleted every non-archived Loan, Saving and Fine in the database. The dashboard
was rendering a live "Begin New Cycle" button at the time.

It fired for the first time because deleting William's Group removed his own `GroupMember`
record. Fixed in `af33073` — that branch now fails closed with the same `403 NO_GROUP` any
other groupless user gets, and additionally filters `deletedAt: null` and checks the group
is not deleted, which it previously skipped. Safe because no route in `routes/admin.js`
mounts `resolveGroup`. 64/64 backend tests pass.

**(b) 21 orphaned records, in both databases.** Records whose `groupId` pointed at no
existing Group, invisible in normal use because every query is group-scoped. Mostly
leftovers from throwaway test groups, plus one pre-multi-tenancy loan (K18,177) with no
`groupId` at all. New `scripts/cleanupOrphanedRecords.js` (`8fec431`) computes orphans at
run time rather than hardcoding ids, dry-runs by default, prints the resolved host, and
refuses to delete more than 100 without `--force`. Applied to both databases; both now
report zero.

> **Follow-up, not yet done — `createThrowawayTestUser.js --delete` is incomplete.** It
> removes the Group but not everything attached to it, which is where most of those 21
> orphans came from. Same defect class `deleteGroups.js` had. Worth fixing before Session
> 5, which leans on throwaway groups for verification, or the orphans simply refill.

**Leave all six in Atlas** — that is the dev database and they are dev groups.

**2b. Atlas — remove what does not belong in dev.**

1. **DONE.** Local `mern_vb_backend/.env` already points at Atlas — confirmed the only place it points (only two `.env` files in the repo: backend and frontend; frontend's has no DB connection string).
2. **DONE — see the READ FIRST outcome above for the corrected shape.** `scripts/utils/productionGuard.js` exports primitives, not a blanket rule; `deleteGroups.js`, `removeGraceCopyFromAtlas.js`, and `cleanupOrphanedRecords.js` each build their own database-specific check from them.
3. **DONE.** `.env.example` committed for both packages; `.gitignore`'s blanket `.env.*` pattern fixed with explicit `!.env.example` exceptions so it doesn't silently swallow them.
4. **DONE.** Cycle-reset William's Group via the app (blocked by an unrelated stale-Clerk-ID bug, found and fixed — see READ FIRST above); `removeGraceCopyFromAtlas.js --apply` executed and verified.
5. **DONE — resolved by explanation, not deletion.** See READ FIRST above.
6. **DONE.** `CLAUDE.md`'s database section, throwaway-test-user safety note, and production-audit access method are all current.

**Clerk — resolved, no action needed here.** Clerk was already split into Production and
Development instances; both Coolify services were verified on Production 2026-09-09. Local
dev is on the Development instance. Nothing in this session touches Clerk.

### Session 3 — Reconciliation with Simon (lunch block, human-facing) — DONE 2026-09-09

Nine questions sent, corrected workbook returned the same day, then a two-question
follow-up answered. All items closed; figures in section 3 are the signed-off set. **The
import gate is lifted.**

### Session 4 — Merge and deploy Phases 2–5 (~2.5h)

1. Merge `feature/configurable-group-rules-phase2` into `main`. **Expect friction:** the branch carries five commits (`24762bf`, `5a96ec4`, `235734b`, `5ec2e46`, `6b963ff`) that were already cherry-picked onto `main` as `52458db`, `b6da9f9`, `646e5e3`, `8f12a2c`, `4e87ad3`. Diff `origin/main..branch` before merging — the same discipline that caught the near-miss on 2026-08-28 (P-009).
2. Full verification loop: 96 backend tests, frontend build, `auditBankBalance.js` clean.
3. Verify live against a throwaway Clerk test group on the **grocery_chilimba** template before this touches Grace's group (technique: `systems/NS-020`).
4. Deploy to Coolify production.

### Session 5 — Named funds — DONE 2026-09-10

Design is section 7 — read it before writing code. Backend first; the Settings
fund-manager UI can follow after the import if the session runs out.

1. `GroupFund` model + backfill from existing `SocialFundBalance` docs.
2. `ContributionType.fundId`; backfill from `affectsMainBalance`.
3. `SocialFundExpense` → `FundExpense` with `fundId`; add `app_subscription` to the
   category enum.
4. `fund_credit`/`fund_debit` transaction types; audit script handles both at
   `balanceEffect = 0`.
5. Seed the App Subscription Fund platform-wide — every group, every template, plus a
   backfill for existing groups. Inactive by default.
6. Dashboard renders a card per active fund instead of the hardcoded Social Fund card.
7. Full verification loop. ~~`auditSocialFund.js` still passes, or is updated alongside~~ — **replaced**: it carried the same zero-`groupId` multi-tenancy defect `auditBankBalance.js` was fixed for in August and was never fixed alongside it. Now `scripts/auditFunds.js`, per-group and per-fund.

**Outcome.** All seven items done, plus a backfill (`scripts/backfillGroupFunds.js`, applied to Atlas, idempotent) and the throwaway-script fund seeding. 104/104 tests, clean build, both audits clean. **Verified live in a browser:** the App Subscription Fund seeded inactive and hidden; creating a contribution type pointed at it auto-activated it and it appeared as its own dashboard card; Phase 4's liability card picked up its K12 target with no extra wiring; recording K12 credited the fund and left `BankBalance` at K0; `fund_credit` correctly excluded from the main-pool formula.

**One defect the test suite caught during the work:** a legacy `ContributionType` with `affectsMainBalance: false` and no `fundId` would have routed to the **main lending pool**. On un-backfilled production data that is silent money misrouting. Destination resolution now falls back to the social fund for any type still carrying the deprecated boolean.

**Deferred, not blocking the import:** `Contributions.jsx` and `OperationsPage.jsx` still speak of "the social fund" and show a single pot. They keep working — the deprecated `/social-fund` routes delegate to `fundController` — but they should become fund-aware (a tab or filter per fund) before a group runs more than two pots in anger.

**Touchpoints — verified by grep 2026-09-09, confirm before editing.** `SocialFund*`
appears in 13 files:

| Area | Files |
|---|---|
| Models | `SocialFundBalance.js`, `SocialFundExpense.js`, `ContributionType.js`, `Contribution.js`, `Transaction.js` (enum) |
| Controllers | `socialFundController.js` (106 lines), `contributionController.js` (87), `contributionTypeController.js` (57), `groupController.js` (per-group seeding at creation), `adminGroupsController.js` |
| Scripts | `seedContributionDefaults.js`, `seedGroupTemplates.js`, `auditBankBalance.js`, `auditSocialFund.js` |
| Frontend | `components/ui/DashboardStatsCard.jsx`, `components/settings/ContributionTypesManager.jsx`, `pages/Contributions.jsx`, `pages/OperationsPage.jsx`, `features/contributions/RecordSocialFundExpenseForm.jsx` — "Social Fund" is hardcoded in 10 places across the first four |
| Tests | `tests/contributionController.test.js` |

**Non-negotiables:** `BankBalance` and its formula are not touched. Existing
`social_fund_credit`/`social_fund_debit` transaction rows are never migrated or rewritten.
`Contribution` keeps writing `affectsMainBalance` for one release alongside the new
`fundId`/`fundName` snapshots. Backfills are idempotent and dry-run against Atlas first.

**UI work follows `UI_SPEC.md`** — per `CLAUDE.md`, read the relevant section before
writing JSX, not after.

### Session 6 — Write and dry-run the import script (~2.5h)

**Source workbook structure** — 5 sheets, and two columns are easy to misread:

- `Membership` — membership-fee instalments per member per month (K250 target each).
- `Total Interest` — interest-quota tracking. Per month: `Loan Interest` (interest paid on
  a real loan) and `Added Interest` (cash paid against the notional loan). `Balance` counts
  down from K1,050.
- `June / July / August Contribution` — one row per member. Columns:
  - `Monthly Contribution` — always K700, the savings deposit.
  - `New Loan Requested` — new disbursement or top-up that month.
  - `Loan Repayment` — principal repaid.
  - `Loan Interest 10%` — interest **paid in cash**, not capitalised.
  - `Outstanding Loan Balance` — balance *after* adding that month's new loan.
  - **`New Loan total` — the CLOSING balance for the month.** This is the figure to import
    as each member's outstanding balance, not `Outstanding Loan Balance`.
  - `Membership Fee Paid`, `Added Interest` — as above.
  - `System` (August only) — K12/member for the Chama360 subscription. Routes to the App
    Subscription Fund, never the main balance. Mateba did not pay; total K288.
  - **`Total Balance` is that month's cash delta, NOT a running total.** -33 / -36 / +111.
    Simon confirmed it carries into the next month as opening balance with no interest, so
    the cumulative position at 31 Aug is **K42** from a zero opening.

Names: the workbook uses `Mwenzi` in June/July and `Malambo` in August — **one person**,
onboarded in the app as Malambo. The `Membership` sheet spells it lowercase `malambo`.
Match on a normalised name. Roster is 25.

1. Write `scripts/importGraceCycle.js` — idempotent, session-wrapped, writes a pre-import backup, and is explicitly one-off tooling rather than production code.
2. **Dry-run it against Atlas (dev)**, on a clone of Grace's group. This is now possible precisely because the databases are split — the first real payoff of Sessions 1–2.

Note on backdating: `Loan.createdAt` and `Loan.entries[].date` both use Mongoose `default: Date.now`, which only applies when the field is absent — an import script can set them explicitly. The "loans can't be backdated" issue in Known Issues is a *UI* limitation and does not block the script.

### Session 7 — Production import and verification (~2h)

1. Re-template Grace's existing group to `grocery_chilimba` and clear the trial data (confirmed with Simon: the trial figures are the same as the spreadsheet, so nothing is lost).
2. Import June, July, August against the signed-off figures.
3. Set each member's interest-obligation target to K1,050 and the membership-fee liability to K250.
4. Activate the group's App Subscription Fund and post August's K288 — 24 members at K12, Mateba outstanding.
5. Verify against the four independent checks in section 4.
6. Hand back to Simon: the group continues in-app from September onward.

---

## 3. Reconciliation — fully signed off by Simon, 2026-09-09

Simon returned a corrected workbook the same day, then answered a two-question follow-up.
Re-verified line by line against the new file; every correction ties. **No open items — the
import gate is lifted.**

**Closed:**

- **Malambo, not Mwenzi.** One person, renamed. The roster is **25**, and Malambo is the
  name onboarded in the app. The Membership sheet spells it lowercase `malambo`; the
  import script should match on a normalised name.
- **Athena is active.** She saves the K700 minimum each month and does nothing else,
  which the group permits. Her Membership "Total" cell is blank rather than 0 — cosmetic.
- **Membership fees fixed.** Miyoba June K100, Lucy August K88, Muya August K25 now
  present. Sheet totals agree: 842 / 702 / 601, **K2,145** collected against a K6,250
  liability (25 x K250).
- **Interest quota fixed.** Maluba 700/350, Patricia 512/538, Simon Peter 200/850,
  Emmanuel 250/800, Lucy 500/550, Tommy 550/500, Miyoba 150/900, Malambo 350/700. The
  Total Interest sheet's monthly columns now reconcile exactly with the monthly sheets
  in both directions (loan interest 0 / 1,800 / 3,922; added interest 125 / 675 / 1,750).
- **Outstanding loans at 31 August: K60,675.** Unchanged, confirmed.
- **September is a clean break.** Simon enters it in the app himself after the import.
  Nothing past 31 August gets migrated.

---

### RESOLVED — the cash figure is K42

Simon, 2026-09-09 (second round): *"It is carried into the next month as the opening
balance. No interest is charged on it."*

That settles it, and it supersedes his earlier "cash in pot should be K111". Combined with
his first-round answer to treat June's brought-forward as zero, the monthly balances chain:

```
June opening        0
June   0 + (18,467 - 18,500)  = -33
July  -33 + (21,077 - 21,113) = -69
Aug   -69 + (24,011 - 23,900) = +42
```

**Cash at 31 August 2026 = K42.** The K111 was August's own "Total Balance" row read as
the pot — his workbook has no cumulative row anywhere, which is exactly how that happens.
No K69 opening adjustment; nothing to invent.

Worth recording, because it will look odd later: **the -33 and -36 are not physically
possible** from a zero opening — they mean the group disbursed more cash in June and July
than it took in that month. Almost certainly recording artifacts (a loan rounded up on
paper, or a small receipt never entered). Simon has confirmed the figures carry as-is, so
**import them faithfully.** Reproducing the group's own book is the job; adding K69 to make
it look tidy would be inventing money.

**Consequence for the import script:** posting chronologically takes the group's
`BankBalance` negative at end-June (-33) and end-July (-69) before it recovers to +42.
Checked — **there is no insufficient-balance guard on loan disbursement**, so nothing
rejects those states. Post in date order anyway; the intermediate values are correct.

"No interest charged on it" is consistent with the grocery template's
`features.savingsInterest: false`. Nothing to build.

### RESOLVED — the "System" column

The August sheet's `System` column is **K12 per member**, collected in August to pay the
group's Chama360 subscription from 1 September. It is deliberately excluded from "Total
Monthly Income" — this money never enters the lending pool.

- 24 of 25 members paid. **Mateba has not**, so they collected **K288** against a
  K300 Standard-tier subscription — K12 short. Tell Simon.
- 25 x K12 = K300 exactly. The group priced the subscription per member and split it.
  That is a collections mechanic they invented themselves, and it is worth capturing
  in the second brain as a retention signal rather than leaving in a session log.

Design agreed 2026-09-09 — see **section 7**. Short version: named funds, subscription
tracking seeded for every group platform-wide, main balance untouched.

---

## 3a. Follow-up to Simon — sent and answered 2026-09-09

Both questions returned: Mateba did not contribute (import as-is), and the monthly balance
carries forward as the next month's opening balance with no interest. Folded into
section 3 above.

---

## 4. Verification — four independent checks, all must pass

1. `scripts/auditBankBalance.js --group <graceGroupId>` reports a discrepancy under ZMW 1.
2. Every member's outstanding loan balance in-app matches the signed-off August closing figure, member by member — and the total is **K60,675**.
3. The Interest Obligation report reproduces the corrected Balance column exactly, member by member. Spot-check the seven that changed: Maluba 350, Patricia 538, Simon Peter 850, Emmanuel 800, Lucy 550, Tommy 500, Miyoba 900.
4. The main bank balance lands on **K42**, from a zero opening at 1 June. The subscription fund shows **K288** and is excluded from that number. Intermediate month-end values should read -33 (June) and -69 (July).

If any of the four disagrees, stop and reconcile. Do not adjust a number to make a report match.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| Cutover loses or corrupts live customer data | Full `mongodump` kept as rollback; restore tested before any feature deploy (Session 1 step 6) |
| Phases 2–5 merge accidentally ships more than intended | Diff `origin/main..branch` before merging — the P-009 discipline |
| Phases 2–5 misbehave against Grace's real group | Deployed against a restorable database; verified on a throwaway grocery_chilimba group first |
| ~~Import built on unreconciled figures~~ | Closed — Simon signed off in full 2026-09-09 (section 3) |
| Production audit becomes unrunnable once Mongo is private | Access method decided and documented in Session 1, not later |
| Dev work still reaches customer data | Script-level production-URI guard (Session 2b step 2) |
| ~~Full copy carries dev groups into production~~ | **Realised.** All 7 groups came across; only Grace's belongs. Soft-delete restores the audit gate immediately; hard delete follows once `deleteGroups.js` is fixed (Session 2a) |
| `deleteGroups.js` orphans 6 collections | Fix to cover all 16 `groupId`-bearing models before it is ever pointed at production; fresh `mongodump` first |
| Named-funds refactor breaks existing contributions | Additive throughout: `BankBalance` untouched, old `social_fund_*` transaction rows never migrated, `affectsMainBalance` still written for one release. Backfills are idempotent, dry-run on Atlas first |
| Session 5 runs long and delays the import | Backend is the critical path; the Settings fund-manager UI can ship after the import. Funds are seeded from code, so nothing blocks on it |

---

## 6. Docs to update on completion

- `CLAUDE.md` — database section, throwaway-test-user safety note, production-audit access method, and the Configurable Group Rules architecture-notes section owed from `plan_configurable_group_rules.md` §8
- `CHANGELOG.md`
- `docs/PARKING_LOT.md` — the generic main-balance expense type and main-to-fund transfers, per section 7
- Second brain: `ventures/saas/chama360/_overview.md` items 0 and 1 close out; `RUNBOOK.md` is still a stub and the cutover is exactly what it should document

---

## 7. Agreed design — named funds (Option B)

Decided 2026-09-09. Replaces the earlier "relabel the social fund" suggestion, which was
not configurable and would not have survived the second group that asked for this.

### The problem

`ContributionType.affectsMainBalance` is a boolean with two hardcoded destinations —
`BankBalance` or `SocialFundBalance`. A subscription pot is a third, and any group-specific
pot after it is a fourth. A boolean cannot grow.

### The shape

Generalise the **side** of the ledger that is safe to generalise, and leave the main
balance alone.

- **`GroupFund`** — `{ groupId, key, name, balance, active }`. One row per named pot.
  Backfilled one-to-one from existing `SocialFundBalance` documents; that model is
  deprecated in place, not dropped (same pattern used for `resolutionNote` in the support
  work).
- **`ContributionType.fundId`** replaces `affectsMainBalance`. Points at the fund the
  credit lands in.
- **`SocialFundExpense` becomes `FundExpense`**, carrying `fundId`, with
  **`app_subscription` added to the category enum** — that enum is what makes subscription
  payments queryable and reportable the same way across every group, which is the actual
  requirement.
- **New transaction types `fund_credit` / `fund_debit`**, both `balanceEffect = 0` in the
  audit script, exactly like the existing pair. Existing `social_fund_credit` /
  `social_fund_debit` rows are never touched or migrated.
- **`Contribution` snapshots `fundId` + `fundName`** alongside the existing `typeName`,
  keeping the defensive denormalisation pattern. `affectsMainBalance` keeps being written
  for one release so historical rows stay readable.

### Platform layer vs template layer

This distinction is the point, and getting it wrong was the first draft's mistake.

| Layer | Decides | Examples |
|---|---|---|
| **Platform** | Things true of every Chama360 customer | App Subscription Fund |
| **Template** | Genuine group-model differences | fines, share-out, savings interest, social fund |

**Every group gets subscription tracking**, regardless of template, seeded by the same
code path that creates any group — plus a backfill for existing groups. Paying for the app
is not a group-model variation. The social fund stays template-driven, because having one
genuinely is a group-model variation.

Seeded **inactive by default** so groups that do not use it never see a permanent
zero-balance card. The treasurer switches it on; Grace's import switches it on for her.

The dashboard renders a card per active fund instead of the hardcoded Social Fund card.
A useful consequence: the fund's own `name` becomes the label, so the `vocabulary` block
Phase 1 built and never wired is no longer needed for this case. That deletes planned work
rather than adding it.

### Scope boundary — subscription money only ever lives in a pot

**Decided by William 2026-09-09.** Subscription contributions always route to a secondary
fund. There is no path where subscription money sits in the main balance and is expensed
out of it.

The consequence, stated so it is a decision and not an accident: **the only supported flow
is members contributing directly to the subscription fund, and the fund paying the bill.**
A group that wants to fund the subscription out of general group money is not supported —
it would need either a main-balance expense type or a main-to-fund transfer, and neither
exists. If a group asks for that later, it is a revisit, not a bug.

This is what keeps the design safe: **`BankBalance` and its formula are not touched at
all.** Given that file's documented history of drift bugs, that is the whole reason to
prefer this shape.

### Explicitly parked

- **A generic main-balance expense type** (bank charges, stationery, refreshments, or the
  subscription variant above). Previously sketched as "Option C" and considered committed
  until the scope boundary above removed the need. It is the only thing that would touch
  the balance formula, and nothing needs it today. Goes to `docs/PARKING_LOT.md`.
- **Main-to-fund transfers.** Same reasoning.
