# Plan — Coolify production DB cutover + Grace's group data migration

**Written:** 2026-09-09
**Supersedes the sequencing in:** `docs/plan_configurable_group_rules.md` Phases 6 and 7 (which remain the spec for *what* to do; this doc is the *order*, the *gates* and the *session breakdown*).
**Source data:** `Grocery Chilimba Group Data-Migration-Sep2026.xlsx` (Simon Peter, 2026-09-09) — Google Drive, `Client Details/Grocery Chilimba/Grace Group/`.

---

## 0. The thing that changes the plan

**Phases 2–5 are not in production.** `main` (commit `4e87ad3`, v3.13.2) has no `revolvingMonthly` strategy, no `Loan.accrualMode`/`principalBalance`/`entries[]`, no interest-quota tracking, no membership-fee liability, no `Cycle` model. All of it sits unmerged on `feature/configurable-group-rules-phase2`.

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

### Session 1 — Coolify Mongo + cutover (~2.5h, off-peak, announce downtime)

Grace's 25 members are live and paying. This is a real maintenance window, not a quiet change.

1. Stand up MongoDB as a Coolify service on the Hetzner box, alongside NdalamaHub's. Confirm it is **not publicly reachable** — internal Docker network only.
2. `mongodump` from Atlas (`mern-vb-cluster`/`mern_vb_app`). Keep the dump; it is the rollback.
3. `mongorestore` into Coolify Mongo. **Full copy, not selective** — cheaper, reversible, and preserves every `_id` reference. Pruning Atlas down to demo-only data is Session 2 work, done on the copy that is no longer production.
4. Swap `MONGODB_URI` on the API service in Coolify. Redeploy.
5. Verify: sign in as a real user; Grace's group dashboard totals match the pre-cutover figures recorded in step 2; `auditBankBalance.js --all` reproduces the same per-group numbers as before the move (including William's Group's known ~K18,177 gap — it should still be exactly K18,177, unchanged, which is itself a good integrity check).
6. Configure backups on the Coolify Mongo **and test one restore.** Not optional — Phase 6 point 6 of the original plan, and the reason for doing the cutover before the feature deploy.

**Open item to solve in this session, not after:** once Coolify Mongo is private, how do you run `auditBankBalance.js` against production? The `CLAUDE.md` verification loop depends on it. Two workable answers — pick one and write it into `CLAUDE.md`: run the script via `docker exec` inside the Coolify network, or reach it over Tailscale with a temporary port-forward. Decide now; discovering this on release night is worse.

### Session 2 — Dev environment (~1.5–2h)

After the cutover, Atlas *is* the dev database. Very little needs to move; the work is making the separation real rather than nominal.

1. Local `mern_vb_backend/.env` already points at Atlas — leave it. Confirm it is the only place it points.
2. **Add a production-URI guard to `scripts/`.** The whole point of the split is that a local script can no longer hit customer data, and today nothing enforces that. Add a shared check that refuses to run if `MONGODB_URI` resolves to the production Coolify host, with an explicit `--i-know` style override for the rare deliberate case. Cheap, and it closes the class of accident the cutover exists to prevent.
3. Commit a `.env.example` for both packages so the split is documented in the repo, not just in someone's memory.
4. **Clean Atlas down to dev/demo data.** Cycle-reset William's Group (clears the ~K18,177 test-session drift, as agreed). Decide what to do with the copy of Grace's real group now sitting in the dev database — recommendation: soft-delete it rather than keeping live customer PII in a database that throwaway test accounts get created against daily.
5. Resolve the two orphaned `BankBalance` documents `auditBankBalance.js` reports.
6. Update `CLAUDE.md`: the database section, the throwaway-test-user safety note (its warning about touching production stops being true), and the production-audit access method from Session 1.

**Flagged, not resolved here — Clerk is not being split.** Local uses `sk_test_`/`pk_test_`. If production runs on the same test instance, then the dev/prod separation is database-only: a sign-up in dev still creates a user visible to production's auth. If production runs a live instance, then Atlas-as-dev holds members bound to Clerk IDs dev cannot authenticate as. Either way it is worth knowing which. **Verify what `CLERK_SECRET_KEY` actually is on the Coolify API service during Session 1**, while you are already in the env vars. Splitting Clerk is a separate decision, not a blocker for this migration.

### Session 3 — Reconciliation with Simon (lunch block, human-facing) — DONE 2026-09-09

Nine questions sent, corrected workbook returned the same day, then a two-question
follow-up answered. All items closed; figures in section 3 are the signed-off set. **The
import gate is lifted.**

### Session 4 — Merge and deploy Phases 2–5 (~2.5h)

1. Merge `feature/configurable-group-rules-phase2` into `main`. **Expect friction:** the branch carries five commits (`24762bf`, `5a96ec4`, `235734b`, `5ec2e46`, `6b963ff`) that were already cherry-picked onto `main` as `52458db`, `b6da9f9`, `646e5e3`, `8f12a2c`, `4e87ad3`. Diff `origin/main..branch` before merging — the same discipline that caught the near-miss on 2026-08-28 (P-009).
2. Full verification loop: 96 backend tests, frontend build, `auditBankBalance.js` clean.
3. Verify live against a throwaway Clerk test group on the **grocery_chilimba** template before this touches Grace's group (technique: `systems/NS-020`).
4. Deploy to Coolify production.

### Session 5 — Named funds (~2.5–3h, may run long)

Build section 7. Backend first; the Settings fund-manager UI can follow after the import if the session runs out.

1. `GroupFund` model + backfill from existing `SocialFundBalance` docs.
2. `ContributionType.fundId`; backfill from `affectsMainBalance`.
3. `SocialFundExpense` → `FundExpense` with `fundId`; add `app_subscription` to the category enum.
4. `fund_credit`/`fund_debit` transaction types; audit script handles both at `balanceEffect = 0`.
5. Seed the App Subscription Fund platform-wide — every group, every template, plus a backfill for existing groups. Inactive by default.
6. Dashboard renders a card per active fund instead of the hardcoded Social Fund card.
7. Full verification loop. `auditSocialFund.js` still passes, or is updated alongside.

### Session 6 — Write and dry-run the import script (~2.5h)

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
| Dev work still reaches customer data | Script-level production-URI guard (Session 2 step 2) |
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
