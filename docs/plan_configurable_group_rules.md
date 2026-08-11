# Plan — Configurable Group Rules (Grocery Chilimba Retrofit)

**Status:** Approved for implementation
**Written:** 2026-08-10 (Opus planning session) · **Revised:** 2026-08-11 — Phases 0 and 0.5 shipped; Simon's answers folded in (§7), two of which changed the plan (§2.6 borrowing limit, Phase 2 payment allocation)
**Baseline:** v3.12.6, commit `e69ab23`
**Driver:** Grace Kalele's "Grocery Savings Group" — currently **trialing**, committed to subscribing at the end of the trial once the app is confirmed to match their group's rules. The trial exists precisely to establish that fit, so the work in this plan is what converts them. They will be Chama360's first paying customer. Migrating June–Nov 2026 cycle data.

---

## 1. Sources

Everything in this plan is derived from three real artefacts plus a walkthrough, not from assumption:

| Source | What it gave us |
|---|---|
| `Grocery Chilimba May Update.xlsx` (Dec 2025 – May 2026 cycle) | Full prior cycle: loans, interest, contributions, membership fees |
| `Grocery Chilimba July Updated.xlsx` (Jun – Nov 2026 cycle) | The cycle we are migrating; 26 members |
| `Grocery Champions July 2026 - Constitution.pdf` (80-member group, William's wife) | A second, independent grocery-chilimba's written rules |
| Walkthrough with Simon Peter (Grace's group treasurer), 2026-08-10 | Two live UI defects |

Second-brain context: `ventures/saas/chama360/_overview.md` — "Product Idea: Grocery-Pool Chamas", outreach log #25/#29/#30.

---

## 2. What the data actually established

### 2.1 Grace's loans are a revolving credit line, not an installment loan

Confirmed by William 2026-08-10 and corroborated by the workbook:

- Interest is **10% per month on the outstanding balance**.
- There is **no term, no installment count, no schedule**.
- The member **directs how each payment is allocated** — interest only, principal only, or a stated split. Confirmed by Simon 2026-08-11: *"it is allocated as per the user/member's instruction."* Allocation is an **input at payment time, not a fixed rule.**
- Anything unpaid **capitalises** — it becomes next month's loan balance and attracts 10% again. Confirmed by Simon as real, observed behaviour, not just a constitutional fallback.
- Members may **top up** an existing loan; the workbook's `New Loan Requested` + `New Loan total` columns merge old balance and new borrowing into one running figure (Mwiza, Feb: 3,500 + 1,400 → 4,900). Simon: *"it gets added to what is outstanding… and becomes a new bigger loan."*
- **There is a borrowing limit, and it is computable** — see §2.6. An earlier note in this plan said "no borrowing limit"; that was wrong and is corrected below.
- Loans may run to cycle end, but must be **settled 3 days before the cycle end date** so the buying team has all funds available in time.

This is incompatible with the current `Loan` model, which generates a fixed `installments[]` array at creation. Both existing `interestMethod` values (`reducing`, `flat`) are wrong for this group — not approximately wrong, structurally wrong.

Grocery Champions is different again: **25% flat over an 8-week term**, max K4,000, two payments, one loan at a time, guarantor required. Note the current `flat` branch in `loanCalculator.js` charges `amount × rate` on *every* installment, so it would bill Champions 25% twice. That is a latent bug for any flat-rate group, not only this one.

### 2.2 The mandatory interest quota is a real, recurring rule — not a one-group quirk

`CLAUDE.md` currently states the forced-minimum-borrowing rule is unique to William's group and must not be built. **Three groups now have this rule**, two of them in writing:

- **Grocery Champions** §16 "NIL LOAN" — members who never borrow must still pay **K1,000** toward "the interest being raised by every member," due 5 Dec. §21 lists it under mandatory payments.
- **Grace's group** — the `Total Interest` sheet mechanises it. `O4 = 1050` is the quota; every member's `Balance` starts at K1,050 and counts down as they generate interest, from either `Loan Interest` (interest paid on their own borrowing) or `Added Interest` (cash paid directly against the quota). Milimo finished at −30 (over-delivered); Ruth 2 and Tabitha finished at the full 1,050 (nothing delivered).

Note Champions' arithmetic: max loan K4,000 × 25% = K1,000. **The quota is priced as one member's full loan's worth of interest.** It is the same economic idea as forced borrowing, expressed as a payable liability instead of a compelled loan — and far simpler to build.

**Consequence for `CLAUDE.md`:** the "What NOT to Build" section needs amending. The *forced borrowing* mechanic stays parked; the *interest quota* mechanic ships.

**Enforcement (William, 2026-08-10):** a member who misses the quota receives groceries worth K1,050 less at share-out. Share-out itself happens off-app. **The app's only obligation is to report each member's quota shortfall at cycle end.** That is a report, not an engine.

### 2.3 Scope reductions confirmed by William

Three answers materially shrank this build:

- **Groceries and share-out are off-app.** The app tracks savings and loans only, and reports the pot. No share-out calculator is needed for Grace.
- **Grace's group has no fines at all.** Non-compliance is punished through the grocery share, not through fines. No fine catalogue needed for Grace.
- **Funds are pooled as one** and spent externally.

This decouples the share-out calculator from Grace's critical path. It remains genuinely required for **Julie Mwamba's group (December 2026 cycle end)** and is a blocker for the SACCO segment — it stays in the backlog, unchanged in priority, but it is **not** in this plan.

### 2.4 Per-cycle, not per-group, configuration

Grace's monthly contribution moved **K600 → K700** between cycles, and the roster changed (Ospy and Precious out; Emmanuel, Mateba, Tommy, Athena, Prudence, Ruth in). Configuration is a property of a *cycle*, not of a group for all time.

### 2.6 The borrowing limit — corrected 2026-08-11, and it is computable

An earlier answer during scoping was "no limit — members borrow whatever the pool can fund," and §2.1 originally recorded that. **Simon corrected it**, and his rule is precise:

> The maximum a member may borrow is **everything they are projected to contribute by the end of the cycle** — membership fee + interest obligation + (monthly contribution × months in cycle).

For Grace's June–Nov 2026 cycle:

```
K250 (membership fee) + K1,050 (interest obligation) + (K700 × 6) = K5,500
```

**The workbook confirms this exactly.** Across both migration months, the largest loans taken are Saasa K5,500 (June), Grace K5,500, Tommy K5,500 (July) — and **not one member exceeds K5,500**. Patricia's K5,113 sits just under it. A cap that three separate members hit to the ngwee and nobody breaches is not a coincidence.

Consequences for the plan:

- The `loanLimit` seam gains a strategy — **`projected_cycle_contribution`**, not `none`. Grace's group moves off `none` in the coverage table.
- The limit is **derived, not stored**: it is a function of three parameters this plan already tracks (fee, quota, contribution × cycle length). Change any of them for a cycle and the cap follows automatically. No new field.
- It is a **cycle-level** figure, reinforcing §2.4 — when contribution rises K700 → K800, the cap rises with it.
- Simon Peter's K12,000 in March 2026 sits in the **previous** cycle and far exceeds any such cap. Either the rule post-dates that cycle or it was an exception. **Worth one question**, but it does not affect the migration, which is June–Nov only.

### 2.5 Data-quality observation (sales asset, not a defect)

Grace's own sheets do not reconcile: `Total Balance` reads **−33** (June) and **−36** (July), and `May Contributions!F19` contains a corrupted string. Worth showing Simon — it is the argument for the product, sitting in his own file. It also means opening balances must be **agreed with Simon before import**, not derived unilaterally.

---

## 3. Architecture: parameters, policies, templates

The goal is not "no code for a new group" — that path ends in a rules engine expressed as JSON, where no group's arithmetic can be tested and no bug can be traced. The goal is:

> **A new group is config-only in the common case. A genuinely new policy is one new strategy file plus its tests, and never an edit to core.**

Three layers:

### 3.1 Parameters — pure data, infinite variation

Numbers, dates, names: interest rate, cycle length, contribution amount, quota amount, fee amount. Already mostly present in `GroupSettings`.

### 3.2 Policies — behavioural branches, finite, each needs code

Not "10% vs 25%" but "interest accrues on a schedule vs. on a revolving balance". From three real groups, seven seams cover everything observed:

```js
policies: {
  loanAccrual:        'scheduled_reducing' | 'scheduled_flat' | 'revolving_monthly' | 'term_flat',
  arrears:            'none' | 'capitalise',
  loanLimit:          'none' | 'fixed_cap' | 'savings_multiple' | 'projected_cycle_contribution',
  concurrentLoans:    'unlimited' | 'one_at_a_time',
  interestObligation: 'none' | 'per_member_quota',
  cycleEnd:           'pooled_external' | 'shareout_equal' | 'shareout_proportional',
  exit:               'settle_and_refund' | 'forfeit',
}
```

Coverage check:

| Seam | William's group | Grace | Champions |
|---|---|---|---|
| `loanAccrual` | `scheduled_reducing` | `revolving_monthly` ← **new** | `term_flat` ← new (later) |
| `arrears` | `none` | `capitalise` ← **new** | `none` |
| `loanLimit` | `savings_multiple` | `projected_cycle_contribution` ← **new** (§2.6) | `fixed_cap` (later) |
| `concurrentLoans` | `unlimited` | `unlimited` | `one_at_a_time` (later) |
| `interestObligation` | `per_member_quota` | `per_member_quota` ← **new** | `per_member_quota` |
| `cycleEnd` | `shareout_proportional` (unbuilt) | `pooled_external` ← **new** | `pooled_external` |
| `exit` | `settle_and_refund` | `settle_and_refund` | `forfeit` (later) |

**Five new strategy implementations get Grace live.** Champions adds four more when they convert.

Implementation shape — a registry, not a switch statement scattered through controllers:

```
mern_vb_backend/utils/strategies/
  loanAccrual/
    index.js              ← registry: { key → module }
    scheduledReducing.js  ← wraps existing loanCalculator.js
    scheduledFlat.js
    revolvingMonthly.js   ← new
  loanLimit/
  interestObligation/
```

Each accrual strategy exports the same interface:

```js
{
  key,
  onDisburse(loan, amount, ctx),      // create or top up
  accrue(loan, ctx),                  // period interest — NO cash movement
  applyPayment(loan, amount, ctx),    // allocation order
  outstanding(loan),                  // single source of truth for balance
}
```

Controllers resolve the strategy from settings and never branch on group identity.

### 3.3 Templates — named bundles, copied not referenced

New collection `GroupTemplate`, seeded, editable by super admin:

```js
{
  key:         'grocery_chilimba',
  name:        'Grocery Savings Group',
  description: 'Members save monthly and borrow from the pool; funds buy groceries in bulk at cycle end.',
  policies:    { ...as above },
  defaults:    { ...GroupSettings parameters },
  features:    { fines: false, shareOut: false, socialFund: true, savingsInterest: false },
  vocabulary:  { shareOut: 'Grocery Purchase Fund', savings: 'Monthly Contribution' },
}
```

**Copied into the group's own `GroupSettings` at creation. Never referenced live.** If groups pointed at a shared template, editing a template later would retroactively restate the arithmetic of every group using it — the same hazard as mutable settings. `Group.templateKey` retains the label for reporting only.

Three payoffs, in order of value:

1. **The onboarding wizard becomes short and relevant.** Today `GroupSettings` has ~15 required fields, several meaningless to Grace (`defaultLoanDuration`, `loanLimitMultiplier`, `savingsInterestRate`, `maximumSavingsFirst3Months`). Once policies declare which parameters are live, the wizard renders only those. Grace's setup is five fields: contribution amount, cycle dates, interest rate, quota amount, membership fee.
2. **It controls vocabulary and feature visibility.** Hiding Fines and relabelling cycle-end for Grace turns an 85–90% fit into a 100% fit at the cost of a config flag. That perception gap is most of what "doesn't fit our group" means in a demo.
3. **A new group type becomes data entry, not a deploy.** Composing existing policies stands up "SACCO" or "Investment Chilimba" without a release. Code is written only when a policy genuinely does not exist yet — from three groups, a rare event, not a per-customer event.

**Rule: template is locked once the current cycle has transactions.** Switching accrual mid-cycle would silently restate every open loan. Changes are permitted only at a cycle boundary, as an explicit confirmed action.

---

## 4. Phases

| Phase | Deliverable | Size | Blocks |
|---|---|---|---|
| 0 | Two walkthrough bug fixes | S | Nothing — ship immediately |
| 0.5 | Support ticket two-way visibility | M | Nothing — ship early, Simon is waiting on replies |
| 1 | Template + policy architecture | L | 2, 3, 4 |
| 2 | Revolving loan accrual | L | 7 |
| 3 | Interest quota tracking | M | 7 |
| 4 | Membership fee as a liability | S | 7 |
| 5 | Cycle model + per-cycle snapshot | M | 7 |
| 6 | Coolify production DB cutover | M | 7 |
| 7 | Grace's June–Nov data migration | M | — |

---

### Phase 0 — Walkthrough fixes (ship first, independently) — ✅ DONE 2026-08-11

Both fixes implemented and manually verified in a throwaway dev group (created and
deleted for the test — no real group data touched):
- 0.1: all 15 `userId?.username` sites replaced with `?.name` (`Loans.jsx`, `Reports.jsx`,
  `export.js`, `FinesModal.jsx`, `ManagePaymentModal.jsx`, `EditSavingsForm.jsx`). Where a
  value was shown twice or as a redundant export column, the duplicate was dropped rather
  than printed twice.
- 0.2: `ManagePaymentModal.jsx` now uses `MemberSelect` instead of a raw username input,
  on all three tabs. `MemberSelect` result cap raised from 5 to 8.
- Verified live: loan card name display, loan details dialog, savings record, and a full
  loan-repayment flow through the payment modal's member search — all render/resolve
  correctly. Frontend test suite (10/10) and `pnpm build` both pass.


Both are residue from the `User` → `GroupMember` migration. Neither is a regression from recent commits.

**0.1 — Blank member names.** `GroupMember` has `name`; it has no `username`. The frontend still reads `userId?.username`, which renders `undefined`. The backend populate is correct (`.populate('userId', 'name email')`).

13 sites. Simon saw one of them:

- `pages/Loans.jsx:94` — card header (his screenshot); also `:184`, `:220`, `:252` (details, reverse-payment, delete confirmations)
- **`lib/export.js:19`, `:45`** — member column blank in every exported loan and savings PDF/CSV
- **`pages/Reports.jsx:39`, `:75`, `:113`** — same for transaction, loan and savings report exports
- `components/ui/FinesModal.jsx:149`, `:209`, `:251`, `:290`
- `components/ui/ManagePaymentModal.jsx:140`
- `features/savings/EditSavingsForm.jsx:7` — edit form opens with an empty member field

**The exported reports are anonymous.** Simon has not hit this yet because he has been working on screen. Fix all 13 in one pass; replace `?.username` with `?.name`. Where both were printed (`Loans.jsx:184`, `ManagePaymentModal.jsx:140`), print `name` once.

**0.2 — Payment modal has no member search.** `components/ui/MemberSelect.jsx` already exists and does exactly what Simon wants — searchable, avatars, role badges, filters on both name and username, emits `member.name`, which is what the payment endpoint expects. `AddSavingsForm` uses it; that is why Savings behaves correctly.

`ManagePaymentModal.jsx:152` uses a raw `<input placeholder="Enter username">`. Drop-in swap, all three tabs (Loan Payment, Payout, Fine Payment).

While in the file: `MemberSelect` caps results at `.slice(0, 5)`. Raise to 8 and let the list scroll — thin for an 80-member group.

**Verification:** frontend tests; manually confirm a loan card shows a name and an exported PDF has a populated member column.

---

### Phase 0.5 — Support tickets are write-only for customers — ✅ DONE 2026-08-11

Ported the working pattern from NdalamaHub's `server/routes/tickets.js` rather than building
from scratch — it already had a real `messages[]` thread, scoped list/get/reply endpoints, and
a counterparty-notification helper, none of which the second brain's NS-005 doc had recorded as
existing. NS-005 itself has been flagged (via NdalamaHub's session) to link this implementation
so future ports don't rediscover it from zero.

Delivered: `SupportRequest.messages[]` + `userLastViewedAt`; `scripts/migrateSupportResolutionNotes.js`
(idempotent — migrated all 9 production tickets with a legacy `resolutionNote` on first run,
including Simon Peter's, confirmed 0 on re-run); `GET /api/support/requests`,
`GET /api/support/requests/:id` (marks read), `POST /api/support/requests/:id/messages` (user
reply, reopens a resolved/closed ticket); `POST /api/admin/support/:id/messages` (admin reply,
Resend email to the customer, best-effort); `SupportRequestDrawer.jsx` restructured into
list/form/thread views with an unread dot per ticket; `HelpSupport.jsx` FAB shows an unread
badge (refetches on mount + tab focus); `AdminSupportInbox.jsx`'s resolution-note textarea
replaced with a read-only thread + reply compose box, status update kept independent.

Verified live end-to-end as both a member and a super admin (throwaway Clerk accounts created
via the Backend API and deleted after — see chat log for the technique, since standard
signup/magic-link flows can't be driven headlessly): ticket created → admin replied → status
auto-transitioned to `in_progress` → unread dot appeared on the member's FAB → member saw the
threaded reply and replied back → admin inbox showed both messages correctly bubble-aligned.
64 backend tests and 10 frontend tests pass unchanged; `pnpm build` succeeds.

**Bug found during verification, out of scope, flagged separately:** switching to Platform
Admin mode changes the TopBar title correctly but the desktop sidebar keeps rendering the
regular group nav instead of `AdminSidebar` (mobile hamburger renders correctly — this is the
desktop-only counterpart of the bugs fixed in `e69ab23`/`79b606f`). A hard page reload was also
observed to silently reset `adminMode` before Clerk rehydrates. Filed as a follow-up task.

Original scoping notes below, kept for context.

Raised by William 2026-08-10: he replied to Simon's tickets in-app, and Simon has never seen a word of it.

**What the code actually shows — the gap is larger than "there is no page":**

1. **There is no read API at all.** `routes/support.js` exposes exactly one endpoint: `POST /request`. There is no `GET`. `listRequests` and `updateStatus` exist but are mounted under `routes/admin.js:56-57`, behind super-admin auth. A customer cannot retrieve their own tickets even by calling the API directly.
2. **There is no comment or reply feature anywhere.** `SupportRequest` has no thread, no messages array. What William has been writing is `resolutionNote` — a **single 2,000-character field, labelled "Optional note for this ticket…"** in `AdminSupportInbox.jsx:131`, that `updateStatus` **overwrites on every save** (`supportController.js:224`). So there is not even a hidden history to expose: each reply has been replacing the last one.
3. **There is no notification back to the user.** Notifications are outbound-only — Telegram/email/WhatsApp fire to William on ticket creation. Nothing ever goes to the customer, on any status change.

Net effect: a customer files a ticket and it disappears. For a group on a 15-day trial whose entire purpose is to establish whether the app fits — and whose subscription depends on that verdict — unanswered tickets are a conversion risk, not a feature gap.

**Deliverable — a two-way thread:**

- **`SupportRequest.messages[]`** — `{ body, authorType: 'user'|'admin', authorId, authorName, createdAt }`. Retain `resolutionNote` for now and migrate existing values in as the first admin message so Simon's history is not lost; deprecate the field afterwards.
- **`GET /api/support/requests`** — the authenticated user's own tickets. Identity resolved server-side from the session, never from a client-supplied id (same rule as `createRequest`). **Not gated by trial/subscription middleware**, per NS-005 §2 — an expired user must still be able to reach support.
- **`POST /api/support/requests/:id/messages`** — user reply, scoped so a user can only post to their own ticket.
- **Admin replies** move from the `resolutionNote` field to appending a message, in `AdminSupportInbox.jsx`.
- **"My Requests" page** — list with status badges and the thread. `components/support/HelpSupport.jsx` is the natural home; it currently has no ticket history at all.
- **Unread indicator** on the support FAB when an admin has replied. This is what closes the loop — without it the user has no reason to go back and look.
- **Notify the user on admin reply** — in-app badge at minimum. Email via the existing Resend integration is a small addition and worth doing, since these groups are not in the app daily.

**Reuse the existing conventions:** `Promise.allSettled` best-effort notification that never fails the write, and HTML-escaping of all user text before Telegram interpolation (NS-005 §2).

**On the NdalamaHub comparison:** William notes NdalamaHub already exposes tickets to lender administrators. That pattern is *not* recorded in NS-005 or in `ventures/nexus/clients/manifi-ndalamahub.md` — I could not verify it from the second brain. If NdalamaHub does have a working two-way thread, **read that implementation first and port it** rather than building fresh, and NS-005 needs updating: the scaffold it documents is outbound-only, and Chama360 is listed as its source implementation, so every future app built from it inherits this same dead end.

---

### Phase 1 — Template and policy architecture

1. **`models/GroupTemplate.js`** — schema per §3.3.
2. **`scripts/seedGroupTemplates.js`** — idempotent, following the `seedContributionDefaults.js` pattern. Seed `village_bank` (current behaviour, so existing groups are unaffected) and `grocery_chilimba`.
3. **`GroupSettings`** — add `policies` subdocument and `templateKey`. **All new fields default to the `village_bank` values**, so every existing group's behaviour is bit-identical after migration. Add a backfill script.
4. **`utils/strategies/`** — registry plus `scheduledReducing` and `scheduledFlat` wrapping today's `loanCalculator.js`. **No behaviour change in this phase.** `loanCalculator.js` stays as the reducing implementation; it is not rewritten.
5. **`controllers/loanController.js`, `paymentController.js`** — resolve strategy from settings instead of calling `calculateLoanSchedule` directly.
6. **`groupSettingsController.js`** — `allowedFields` (line 34) must be extended, or new settings will silently fail to save. Policy changes need their own guarded endpoint, not the general PUT.
7. **`pages/Onboarding.jsx`** — new step 1: template selection. Steps 2–3 render conditionally on the chosen template's policies.
8. **`controllers/groupController.js:57`** — copy template defaults instead of the current hardcoded literals (`defaultLoanDuration: 4`, `latePenaltyRate: 15`, `earlyPaymentCharge: 200`).

**Gate:** all 64 backend tests pass unchanged. This phase must be provably behaviour-neutral for existing groups.

---

### Phase 2 — Revolving monthly accrual

**`Loan` model additions** (all optional; scheduled loans untouched):

```js
accrualMode:      { type: String, enum: ['scheduled','revolving'], default: 'scheduled' },
principalBalance: { type: Number },   // revolving only
interestOutstanding: { type: Number, default: 0 },
entries: [{                            // revolving ledger
  date, periodLabel,                   // e.g. '2026-07'
  type,                                // disbursement | accrual | interest_payment | principal_payment | capitalisation
  amount, principalAfter, interestAfter,
  transactionId, recordedBy,
}],
```

**`utils/strategies/loanAccrual/revolvingMonthly.js`:**

- `onDisburse` — new loan, or **top up** an existing open one (increase `principalBalance`, append a `disbursement` entry). This is the `New Loan total` column.
- `accrue` — `interestOutstanding += principalBalance × rate`. **Creates no `Transaction` and does not touch `BankBalance`** — accrual is not a cash movement. This is the single most important correctness rule in the phase.
- `applyPayment` — **allocation is member-directed, supplied at payment time.** Corrected 2026-08-11: an earlier draft of this plan specified a fixed interest-first waterfall. Simon's rule is that the member instructs how their money is split — interest only, principal only, or a stated amount to each — and whatever remains outstanding simply carries. The strategy therefore takes an explicit `{ toInterest, toPrincipal }` allocation rather than deriving one.
  - The **payment form needs two amount fields**, not one, plus a default (interest first) for the common case and a validation that the parts sum to the amount received.
  - Interest-first must stay available as the default because it is what most payments do — but it cannot be the only behaviour, or the app will silently misrecord any member who directs otherwise, and the balances will diverge from Simon's sheet within a month.
  - Overpayment beyond total outstanding is rejected, not absorbed (this also closes audit finding #2 for the revolving path).
- `outstanding` — `principalBalance + interestOutstanding`, the only balance source.

**Capitalisation** (`policies.arrears === 'capitalise'`): at the next accrual, any `interestOutstanding` is folded into `principalBalance` and logged as a `capitalisation` entry before the new interest is charged. Gated on the policy so it can never fire for a scheduled group.

**New operation: "Run month-end interest."** A treasurer-triggered action that accrues every open revolving loan for the period, inside one MongoDB session, idempotent per `periodLabel` (re-running August must not double-charge). This mirrors their monthly meeting rhythm. Needs a confirmation screen listing what will be charged, since it moves every member's balance at once.

**UI:** `pages/Loans.jsx` renders a ledger for revolving loans instead of a repayment schedule. Duration, "Month 1", and the installment table are all meaningless here and must not render.

**Do not** change the `flat` branch of `loanCalculator.js` in this phase. Its double-charge defect belongs to `term_flat` (Champions), which is out of scope — record it in the parking lot.

---

### Phase 3 — Interest quota

**Design decision: derive, do not store.** A stored running total will drift from the transactions that feed it; a derived figure cannot. Store only the target.

- `GroupSettings.interestObligationAmount` — K1,050 for Grace, K1,000 for Champions. Read defensively (`Number(x) || 0`), never hardcoded.
- `ContributionType` — add `countsTowardInterestObligation: { type: Boolean, default: false }`.
- Seed a `Interest Top-Up` contribution type for grocery-chilimba groups (`affectsMainBalance: true`, `countsTowardInterestObligation: true`). This is the workbook's `Added Interest` column, and it reuses the existing contributions feature rather than adding a transaction type.

**Credited** = Σ(loan interest actually paid in cycle) + Σ(contributions of a `countsTowardInterestObligation` type in cycle).
**Shortfall** = `max(0, target − credited)`.

**Deliverable:** an "Interest Obligation" report — one row per member, showing target, credited (split by source), and shortfall. This is a direct replacement for the `Total Interest` sheet, including its `Balance` column, and it is the number Grace's group needs at cycle end to reduce a member's grocery share.

Show the same figure on the member dashboard so members can self-serve, which is most of the transparency pitch.

---

### Phase 4 — Membership fee as a liability

Grace's members pay a **K250** membership fee in instalments across months (Chitalu: 50+50+50+60+40). Today `ContributionType` records payments but has no notion of a target with a running balance.

- `ContributionType` — add `targetAmountPerMember: { type: Number, default: 0 }`. When `> 0`, the type is a per-member liability.
- Report and dashboard show paid / target / outstanding per member.

No new model, no new controller. Together with Phase 3, both features are small extensions to a schema that already exists — this is why the contributions architecture was worth building.

**Confirmed by Simon 2026-08-11:** K250 per member per cycle, payable in instalments across the cycle, **and expected to change cycle to cycle as the group's needs grow**. So it must be a per-cycle parameter, not a group constant — the same conclusion as the contribution amount (§2.4) and the interest quota.

**Deadline:** the fee must be cleared by the shared `cycleSettlementDeadlineDays` cut-off (3 days before cycle end), the same rule that applies to loans. One parameter, two consumers. Surface an outstanding-fee list against that date so the treasurer can chase before it bites.

---

### Phase 5 — Cycle model and configuration snapshot

Two known defects make the migration unsafe without this:

- **Audit finding #6** — loans cannot be backdated (`createdAt` defaults to now), which breaks a mid-cycle import.
- **Audit finding #3** — `beginNewCycle` lacks an `archived: { $ne: true }` filter, so a second reset overwrites cycle 1's records.

There is currently no `Cycle` model; `cycleNumber` is scattered across five schemas with no authoritative start/end dates. Grace's cycle runs **June–November 2026** with explicit boundaries, and the migration needs to place records inside it.

- **`models/Cycle.js`** — `{ groupId, cycleNumber, startDate, endDate, status, settingsSnapshot, closedAt }`.
- `settingsSnapshot` freezes the parameters and policies in force for that cycle. Editing settings mid-cycle must never restate history — the same defensive instinct already applied to `Contribution.typeName` and `overrodeDefault`, extended to rates and policies.
- Allow explicit `date` / `createdAt` on loan, savings and contribution creation, restricted to admin/treasurer and only within the open cycle's bounds.
- Fix the `archived` filter in `cycleController.js` while in the file.

`beginNewCycle` also still skips Contributions and Social Fund (audit finding #4). Fix in the same pass — Grace's group uses contributions heavily and will hit it at the November rollover.

---

### Phase 6 — Coolify production DB cutover

Decided 2026-08-09, reaffirmed 2026-08-10. **Atlas becomes the permanent dev/staging database; production moves to a new self-hosted Mongo on Coolify**, matching NdalamaHub and BazaBooks.

Grace's group is the first group whose real cycle data will live in the app, so it should be **born on Coolify, not migrated twice**. Cutover therefore precedes Phase 7.

1. Stand up Mongo on Coolify; verify network isolation and that it is not publicly reachable.
2. Export the current production data from Atlas; import to Coolify.
3. Swap `MONGODB_URI` in Coolify env vars for the API service; redeploy.
4. Verify: login, dashboard totals, `scripts/auditBankBalance.js` clean, both live groups' balances match pre-cutover figures.
5. Point local `.env` at Atlas and confirm it is now genuinely separate — **local runs and manual scripts must stop touching production**, which is the entire point.
6. Backups configured and one restore tested before Phase 7.

Off-peak window. Simon's and Grace's groups are live; announce it.

---

### Phase 7 — Migrate Grace's June–November cycle

**Prerequisite: reconciliation, agreed with Simon in writing before any import.** Her sheets carry a −33 / −36 imbalance and a corrupted cell; opening balances must be confirmed by the group, not inferred by us. Produce a reconciliation sheet showing our computed opening balance per member against theirs and resolve every difference first.

**Clean start, confirmed by Simon 2026-08-11:** import **June–November only**. The Dec–May cycle is not migrated. Trial data already entered is the same figures as the shared spreadsheets, so it can be cleared and re-imported rather than reconciled — no information is lost by wiping it.

1. **Re-template her existing trial group** to `grocery_chilimba`, and clear the trial data. It was created on village-bank defaults — this must happen before real data lands, or the records restate afterwards.
2. Reconcile and confirm opening balances.
3. Import 26 members from the `Membership` sheet (July workbook).
4. Import June and July: monthly contributions (K700), loan disbursements and top-ups, interest charged, repayments, membership fee instalments, and `Added Interest` payments as Interest Top-Up contributions.
5. Set each member's interest obligation target to K1,050.
6. **Verify** — every member's outstanding balance matches the agreed sheet; `auditBankBalance.js` clean; the Interest Obligation report reproduces the workbook's `Balance` column exactly.
7. Group continues in-app from August onward.

Script goes in `scripts/`, is idempotent, runs inside a session, and writes a pre-import backup. It is a one-off, not production code.

---

## 5. Testing

**Grace's workbook is the regression fixture.** This is the strongest verification asset in the project — real arithmetic, produced by an independent group over eight months.

- `tests/strategies/revolvingMonthly.test.js` — golden-file cases drawn from the workbook. Mwiza is the best single case: Feb 3,500 + 1,400 top-up → 4,900; March and April accrue 490 each with the balance unmoved (interest paid in cash); July accrues 440 on an opening 4,400 and a 400 principal repayment drops it to 4,000. That one member exercises disbursement, top-up, accrual, interest-only payment and principal payment.
- **Capitalisation is confirmed real** (Simon, 2026-08-11) — not a constitutional fallback. It needs first-class golden tests, not the synthetic case an earlier draft of this plan assumed. Build a case where interest goes unpaid, capitalises into principal, and the following month's 10% is charged on the larger figure.
- **Member-directed allocation** needs its own cases: interest-only, principal-only, and a split — asserting the balance after each, since a fixed waterfall would pass an interest-first test while being wrong for the other two.
- **The `projected_cycle_contribution` cap** is directly assertable from the workbook: K250 + K1,050 + (K700 × 6) = K5,500, and no member exceeds it across June and July. Assert the cap computes to 5,500 and that a K5,501 request is rejected.
- Phase 1 must leave all 64 existing backend tests passing **unchanged**. Any test that needs editing in Phase 1 signals an accidental behaviour change.
- Per `CLAUDE.md`, run `scripts/auditBankBalance.js` after every phase that touches money. Discrepancy > ZMW 1 stops work.

---

## 6. Explicitly out of scope

| Item | Why | Where it goes |
|---|---|---|
| Share-out calculator | Grace's share-out is off-app | Backlog — **still required for Julie's December cycle and for SACCOs**. Unchanged priority. |
| Fine catalogue with weekly recurrence | Grace has no fines | Backlog — Champions only |
| `term_flat` accrual + `flat` double-charge fix | Champions is not a customer yet | Parking lot |
| Guarantors, default-offset, exit forfeiture | Champions only | Parking lot |
| 80-member pricing tier | Champions only | Pricing decision, not code |
| Forced minimum borrowing | Still genuinely group-specific and hard to generalise | Stays parked |
| Audit findings #1 (rounding drift), #2 (overpayment, scheduled path) | Pre-existing, affect scheduled loans only | Backlog — before Julie's trial |

---

## 7. Answers from Simon — received 2026-08-11

All five scoping questions answered. **Two answers changed the plan** (§2.6 borrowing limit, §Phase 2 payment allocation); the rest confirmed it.

| # | Question | Answer | Effect |
|---|---|---|---|
| 1 | Top-up or separate loan? | Added to what's outstanding; becomes one bigger loan | Confirms plan |
| 2 | Has interest ever capitalised? | **Yes** — unpaid interest becomes part of the new balance and runs at 10% | Capitalisation is real → first-class tests, not synthetic |
| 3 | Payment allocation order? | **Member-directed** — interest only, principal only, or a stated split | **Changed the plan** — allocation is an input, not a rule |
| 4 | Borrowing limit? | **Fee + quota + (contribution × months)** = K5,500 this cycle | **Changed the plan** — new `projected_cycle_contribution` strategy (§2.6) |
| 5 | Loan deadline? | Cycle end, less a **3-day** allowance so the buying team has funds in time | New settlement-deadline parameter |
| 6 | Quota K1,050? | Confirmed, **and configurable per cycle** | Reinforces per-cycle snapshot (Phase 5) |
| 7 | Overshooting the quota? | No refund, no extra groceries — surplus stays in the pot or rolls over | Quota is a **minimum**; no credit-back logic needed |
| 9 | Membership fee K250? | Confirmed, payable in instalments, **changes cycle to cycle and likely to rise** | Reinforces per-cycle config |
| 10 | Fee deadline? | Same 3-day-before-cycle-end rule as loans | One shared deadline parameter covers both |
| 13 | Import Dec–May history? | **No — June–Nov only, clean start** | Simplifies Phase 7 |
| 14 | Trial data entered so far? | Same figures as the shared spreadsheets | Trial data can be cleared and re-imported without loss |

**Derived parameter, not a new field:** the borrowing cap and both deadlines fall out of values the plan already tracks. Add `cycleSettlementDeadlineDays` (default 3) and nothing else.

### 7.1 Still open

1. ~~**The definition of "Added Interest" does not match the data.**~~ **Resolved 2026-08-11 — and it unifies two features we thought were separate.** Simon confirms a member who never borrows can simply pay the K1,050. His framing is the important part:

   > *"It's treated like a forced loan where the member does not take the cash out of the pot and decides to simply pay the interest only."*

   **The interest quota is forced borrowing.** It is a *notional* loan — the member is deemed to have borrowed their share of the pool, declines the disbursement, and services the interest anyway. Every member therefore contributes an equal share of interest regardless of whether they wanted the money.

   This is the same mechanic `CLAUDE.md` has had parked for nine months as "unique to William's group," seen from the other side. The difference is only whether cash actually leaves the pot:

   | | Principal disbursed? | Interest owed |
   |---|---|---|
   | Real loan | Yes | On the balance |
   | **Notional loan (the quota)** | **No** | **On the deemed share — K1,050** |
   | William's forced borrowing | Yes, compelled | On the balance |

   **Effect on the plan: none structurally** — the Phase 3 design (a contribution type flagged `countsTowardInterestObligation`) still models this correctly and remains the simplest thing that works, because the quota is settled in cash and reported alongside loan interest either way. Two smaller consequences:
   - **Vocabulary.** Members understand this as interest on a share they chose not to draw, not as a "top-up contribution." Label it accordingly in the UI — the grocery template's `vocabulary` block is the right home.
   - **Forced borrowing gets cheaper later.** Once the obligation is modelled, William's variant is the same feature with the disbursement switched on. Worth knowing before that gets scoped as a from-scratch build.

2. **Simon Peter's K12,000 loan (March 2026)** far exceeds any `projected_cycle_contribution` cap. Previous cycle, so it doesn't affect the migration — but confirm whether the cap rule is new, or whether exceptions are permitted and by whom.
3. **Opening balances as at 31 July 2026** — Simon will walk through these with William once the modifications are in place. **Phase 7 gate; do not import before this.**
4. **The K33 / K36 imbalance** — to be resolved with Simon in the same session.

---

## 8. Documentation to update on completion

- **`CLAUDE.md`** — amend "What NOT to Build": the interest-quota mechanic is now a shipped, three-group feature; only forced borrowing stays parked. Add a "Configurable Group Rules" architecture-notes section in the style of the Contributions and Partial Payments sections.
- **`ventures/saas/chama360/_overview.md`** — move the grocery-chilimba product idea from "validating" to "scoped and building"; record the DB cutover as done.
- **`systems/NS-005-in-app-support-system.md`** — the documented scaffold is outbound-only: no read API, no thread, no user notification. Every app built from it inherits the dead end. Update the doc and `scaffold/support-feature/` with the two-way thread from Phase 0.5, and add it to §2 "load-bearing decisions" as a requirement rather than an extension.
- **`docs/PARKING_LOT.md`** — add the `flat` double-charge defect, guarantors, exit forfeiture, fine catalogue.
