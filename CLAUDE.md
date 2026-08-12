# CLAUDE.md — Chama360 (Village Banking App)
> AI assistant instructions for this project. Read this file before touching any code.

---

## Project Identity

**App name:** Chama360 (formerly Village Banking App, repo still named `mern_vb_app`)
**What it does:** Village banking group management — savings, loans, fines, reports, cycle management
**Who uses it:** Group treasurers, loan officers, admins, members in Zambia
**Current version:** 3.10.0
**Sprint context:** 30-day commercial launch sprint, April 1–30 2026. Target: 2 paying groups at ZMW 150–250/month.

---

## Second Brain Context

William's cross-venture context lives in a separate repo:
`/Users/williammweemba/Dev_Projects/wsm-second-brain` — read-only from here.

At the start of a new session, or when a task needs context beyond this
file, read:
- `WILLIAM.md` — priorities, constraints, time budget, what NOT to suggest
- `systems/NS-001-manual-payment-flow.md` — if touching billing/subscription logic
- `systems/NS-002-security-audit.md` — before any deploy or when asked to
  run a security pass
- `systems/NS-005-in-app-support-system.md` — if touching the support
  ticket system (Chama360 is its source implementation)

Do not read the whole second-brain repo by default — it's a large
multi-venture knowledge base and most of it (other ventures, relationships,
admin) is irrelevant to Chama360 work. Pull specific files only when the
task calls for them.

If a session surfaces something that looks like it belongs in the second
brain (a new gotcha, a completed milestone, a system worth extracting),
flag it to William explicitly rather than writing it there yourself.

---

## Repository Structure

```
mern_vb_app/                    ← monorepo root
├── package.json                ← root scripts (concurrently runs both)
├── mern_vb_backend/            ← Express/Node.js API
│   ├── server.js               ← entry point
│   ├── controllers/            ← business logic
│   ├── models/                 ← Mongoose schemas
│   ├── routes/                 ← Express route definitions
│   ├── middleware/             ← auth.js (JWT), roles.js (RBAC)
│   ├── utils/loanCalculator.js ← CRITICAL: interest calculation logic lives here
│   ├── scripts/                ← one-off audit/repair scripts (not production)
│   └── tests/                  ← Jest + Supertest
└── mern-vb-frontend/           ← React + Vite PWA
    └── src/
        ├── App.jsx             ← route definitions + auth guards
        ├── features/           ← domain-grouped components (loans, savings, etc.)
        ├── components/         ← shared UI components
        ├── pages/              ← page-level components
        ├── store/              ← Zustand state management
        └── lib/                ← utilities (export.js = PDF/CSV generation)
```

---

## Tech Stack

### Backend
- **Runtime:** Node.js, Express 5.1.0
- **Database:** MongoDB via Mongoose 8.x, hosted on **MongoDB Atlas** (`mern-vb-cluster`, db `mern_vb_app`) — this is the real, live production database, confirmed 2026-08-09 by reading the `MONGODB_URI` env var directly off the running `api.chama360.nxhub.online` container on Coolify. (A 3.12.2 changelog entry briefly claimed the opposite — that production had moved to a self-hosted Mongo on Coolify — based on a mixup with a different app on the same host; that was wrong and is corrected here.) **Local `.env` `MONGODB_URI` points at this same production database** — there is currently no separate dev/staging DB, so local runs and manual scripts touch real user data. **Decided migration plan (2026-08-09, urgent):** Atlas becomes the permanent dev/staging database going forward; production moves to a new, separate self-hosted Mongo on Coolify (matching NdalamaHub/BazaBooks). Must happen before onboarding any more groups, and before the current live groups (Simon Peter's / Grace Kalele's) accumulate more transaction data — not yet scheduled, but a blocking prerequisite for further growth, not a someday item.
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **Package manager:** pnpm

### Frontend
- **Framework:** React 19, Vite 7
- **Styling:** Tailwind CSS 4, shadcn/ui components (@radix-ui)
- **State:** Zustand 5
- **Forms:** react-hook-form + Zod 4 validation
- **Routing:** React Router DOM 7
- **Icons:** lucide-react + react-icons
- **Dates:** dayjs
- **Notifications:** sonner (toast)
- **Reports/Export:** jspdf + jspdf-autotable (frontend-side PDF), xlsx (Excel)
- **PWA:** vite-plugin-pwa + Workbox service worker

### Deployment
- **Frontend:** Coolify (Vite static build served via Caddy)
- **Backend:** Coolify (Node.js server, nixpacks build)
- **Live URL:** https://chama360.nxhub.online/
- **API URL:** https://api.chama360.nxhub.online/

### Development
```bash
pnpm start          # runs both frontend + backend via concurrently
cd mern_vb_backend && pnpm dev    # backend only (nodemon)
cd mern-vb-frontend && pnpm dev   # frontend only (vite)
```

---

## Domain Model & Core Schemas

### Current Models (mern_vb_backend/models/)

| Model | File | Purpose |
|-------|------|---------|
| User | User.js | Members, roles, auth |
| Loans | Loans.js | Loan records + installment schedules |
| Savings | Savings.js | Member savings deposits |
| BankBalance | BankBalance.js | Group bank balance (single document) |
| Transaction | Transaction.js | Full audit trail of all money movement |
| Fine | Fine.js | Fines/penalties with paid/unpaid status |
| Threshold | Threshold.js | Loan eligibility thresholds |
| ContributionType | ContributionType.js | Treasurer-configured catalog of contribution kinds (e.g. "Admin Fee", "Social Fund"); per-group; soft-deleted only |
| Contribution | Contribution.js | One row per recorded contribution; denormalized `typeName` snapshot; resolved `affectsMainBalance` + `overrodeDefault` stored at record time |
| SocialFundBalance | SocialFundBalance.js | Single-doc social fund pot per group (mirrors BankBalance structure) |
| SocialFundExpense | SocialFundExpense.js | Debit side of social fund mini-ledger; amount stored positive; direction implied by transaction type |

---

## Financial Logic — Read This Before Touching Calculations

### Bank Balance Formula
```
Bank Balance (lending pool) = Starting Balance (cycle_reset)
             + All Savings Deposits              (saving)        (+)
             + All Loan Payments                 (loan_payment)  (+)
             + All Fine Payments                 (fine, paid)    (+)
             + All Main-Balance Contributions    (contribution)  (+)  ← NEW
             - All Loan Disbursements            (loan)          (-)
             - All Payouts                       (payout)        (-)
```

**social_fund_credit** and **social_fund_debit** are NOT part of the main balance.

```
Social Fund Balance = Σ social_fund_credit  (contributions where affectsMainBalance=false)  (+)
                    - Σ social_fund_debit    (expenses)                                      (-)
```

### Transaction Types (Transaction model enum)
`['loan', 'saving', 'fine', 'payment', 'loan_payment', 'payout', 'cycle_reset', 'contribution', 'social_fund_credit', 'social_fund_debit']`

### Interest Calculation (utils/loanCalculator.js)
**This is the most critical file in the backend. Treat with extreme care.**

**Reducing balance (current method — William's group):**
- Each installment = equal principal slice + interest on *remaining* outstanding principal
- As loan shrinks, interest portion shrinks
- Fairer for borrowers

**Flat rate (to be added for other groups):**
- Interest charged on *original* loan amount every installment regardless of repayments
- Simpler to explain, higher effective cost to borrower

When adding flat rate support, add a branch in loanCalculator.js:
```js
if (interestMethod === 'flat') {
  // interest = originalAmount * (rate/100) / durationMonths — every installment
} else {
  // existing reducing balance logic
}
```

### Payment Processing Rules
- Payments are applied sequentially: Month 1 → Month 2 → Month 3 → Month 4
- Overpayments roll to next installment automatically
- All payment operations MUST use MongoDB sessions (atomic transactions)
- Failed operations must automatically rollback — this was a hard bug pre-v2.0.4

### Data Integrity Non-Negotiables
- Never update bank balance without logging a Transaction record simultaneously
- Never skip MongoDB sessions on payment operations
- The `scripts/` folder contains audit tools — use them to verify balance integrity

---

## Authentication & Authorization

### JWT Flow
- Tokens stored in localStorage (frontend)
- Axios interceptors auto-inject tokens
- Auto-logout on expiration

### Roles & Permissions

| Role | Can Do |
|------|--------|
| admin | Everything + user management + cycle resets + delete all fines |
| treasurer | Bank balance, payments, reports, fines |
| loan_officer | Loans, savings, member ops, repayments |
| member | Read-only personal data |

### Auth Middleware
- `middleware/auth.js` — JWT verification
- `middleware/roles.js` — role-based access control
- All API routes must use both middleware in order

---

## PWA Configuration

The app is a fully installable PWA:
- Service worker via Workbox (generated by vite-plugin-pwa)
- Manifest at `mern-vb-frontend/public/`
- Icons: 192x192 and 512x512 SVG
- Offline support for static assets
- Install banner/snackbar in UI

**When modifying vite.config.js:** Do not break the PWA plugin configuration. Test `pnpm build` after any vite config change.

---

## Frontend Architecture Patterns

### UI Spec Compliance — Mandatory

**Any frontend UI work — new components, edited components, new pages — must follow
`UI_SPEC.md` exactly, unless the user explicitly instructs otherwise for that specific
change.** Read `UI_SPEC.md` before writing JSX, not after. This is not a style
preference; treat it the same as a functional requirement.

This was added 2026-08-11 after an audit found every `<select>` in the app (16 files)
rendering as a bare native dropdown — correct height/border/radius in most cases, but
missing §6.8's required custom chevron, so every dropdown showed the browser's own OS
arrows instead. The pattern had been copy-pasted file to file for months because
nothing forced a check against the spec at write time. Concretely:

- **Before adding or editing any input, select, button, card, badge, drawer, or nav
  element, check `UI_SPEC.md` §6 (Component Library) for an existing pattern first.**
  If one exists, use it (or the shared component it maps to) — don't hand-roll a new
  Tailwind className string that happens to look similar.
- **Dropdowns:** use `components/ui/Select.jsx` — never a raw `<select>`. It already
  implements §6.8 (height, border, radius, custom chevron, focus state). See its
  header comment for `className` (wrapper sizing) vs `selectClassName` (escape hatch).
- **Colour, spacing, radius, typography:** pull from the tokens in `UI_SPEC.md` §2–4
  (`--color-*`, `--space-*`, `--radius-*`, `--text-*`), via the Tailwind classes in
  §11.1, not arbitrary hex values or one-off pixel sizes.
- **Before marking any frontend task done, re-read the relevant `UI_SPEC.md` section
  once more against the diff** — the same way the test suite gates a backend change,
  spec conformance gates a frontend one.
- If a legacy file is already off-spec in ways beyond what the current task touches
  (e.g. `pages/Users.jsx` is styled with raw Tailwind defaults throughout), fix what
  the task's own component type touches (per the sweep above, that meant every select
  in the file) and flag the rest rather than silently expanding scope to a full
  rewrite — but don't ship a *new* off-spec element into an already-off-spec file
  either.

### State Management
- **Zustand** for global state (store/)
- Local component state for UI-only state
- Global event system for cross-component updates:
  ```js
  // Dispatch after successful payment
  window.dispatchEvent(new Event('loanDataChanged'));
  // Listen in Loans page / Dashboard
  window.addEventListener('loanDataChanged', refetchLoans);
  ```

### Form Patterns
- All forms use **react-hook-form** + **Zod** for validation
- Don't add raw `<form>` with manual state — use the established pattern

### Export/Reports
- PDF generation is **frontend-only** (jspdf + jspdf-autotable in `src/lib/export.js`)
- Excel export also frontend-only (xlsx)
- **Do not** add backend PDF generation routes — this was intentionally moved to frontend

### Component Organisation
```
src/features/loans/        ← loan-related components
src/features/savings/      ← savings-related components
src/components/ui/         ← shared UI primitives (modals, cards, etc.)
src/pages/                 ← page-level route components
```

---

## Known History & Gotchas

These have caused bugs before. Don't repeat them.

1. **Bank balance drift** — caused by non-atomic payment operations. Always use MongoDB sessions. Audit scripts exist in `scripts/` if drift is suspected.

2. **Loan payment misallocation** — repayments must target the most recent active loan in the current cycle. See `paymentController.js` for correct implementation.

3. **Route ordering in Express 5** — static routes (`/export`) must come before dynamic routes (`/:userId`). Getting this wrong causes crashes on startup.

4. **Custom loan duration ignored** — was a bug in `createLoan`. Duration must be read from `req.body`, not inferred from amount thresholds. Fixed in 2.1.0 — don't regress this.

5. **PDF generation** — was moved from backend to frontend in Aug 2025. If you see backend PDF routes being added, that's wrong.

6. **Fines** — only credit bank balance when **paid**, not when issued. This distinction matters for balance accuracy.

7. **Partial payment state** — `paid===false` with `paidAmount>0` is VALID after v3.10.0. This state means an installment has been partially paid (typically interest covered, principal outstanding). It is only a corruption signal if `paidAmount > installment total`. The old `scripts/fixCorruptedLoan.js` has been retired — do not restore or re-run it. See `RETIRED_fixCorruptedLoan.js` for history.

8. **`GroupMember` has `name`, not `username`** — residue from the `User` → `GroupMember` migration left 15 frontend sites reading `userId?.username`, which rendered blank on loan cards, savings/loans exports, fines dialogs, and the payment modal. Fixed 2026-08-11 (Phase 0 of `docs/plan_configurable_group_rules.md`). If you see a blank member name anywhere, grep for `?.username` first before assuming it's a new bug.

---

## What NOT to Build (Sprint Constraints)

> **Scope rules here are evidence-based, not permanent.** Each entry records the evidence
> that justified it. When new customer data arrives, re-test these rules against it rather
> than treating them as fixed — one entry below has already been overturned this way.
> See `patterns/cross-product-dev-patterns.md` P-003 in the second brain.

**Forced minimum borrowing rule** — William's group compels members who haven't hit their
loan threshold to borrow from surplus. Still parked, but **no longer for the reason
originally given.** Simon Peter (Grace's group treasurer) confirmed 2026-08-11 that the
interest quota below *is* forced borrowing — a **notional** loan, where the member is
deemed to have borrowed their share, declines the cash, and services the interest anyway.
The only difference is whether principal actually leaves the pot. So the mechanic is not
group-specific at all; what remains parked is narrower — **actually disbursing the
compelled principal**, which is the part that confuses groups in demos.
**Evidence: 1 group needs the disbursement (William's); 3 need the obligation.**
Once the interest obligation ships (Phase 3), this becomes the same feature with
disbursement switched on — scope it as an extension, not a from-scratch build.

**Mandatory interest quota — NO LONGER PARKED (2026-08-10). Build this.**
Previously folded into the rule above and rejected as one-group-specific. That was wrong.
**Evidence: 3 groups.** Grocery Champions §16 "NIL LOAN" (K1,000, in their written
constitution), Grace Kalele's group (K1,050, mechanised in their `Total Interest`
spreadsheet), and William's own group. Every member owes a fixed amount of interest per
cycle, satisfiable either by interest paid on their own borrowing or by a direct cash
payment against a notional loan they never drew (see the entry above — these are one
mechanic, not two). Specified in
[`docs/plan_configurable_group_rules.md`](docs/plan_configurable_group_rules.md) Phase 3.

Anything genuinely out of scope goes to `docs/PARKING_LOT.md`.

---

## Sprint Week 1 Technical Priorities (April 1–7)

In order:
1. **Map calculation files** — find where interest, bank balance, fines logic live
2. **Fix any balance discrepancies** found in numbers audit
3. **Build GroupSettings model** — schema + seed William's group values
4. **Wire calculations to GroupSettings** — no more hardcoded values
5. **Add Clerk auth OR improve existing JWT** for multi-group data isolation
6. **Build 4-step onboarding wizard** — self-serve group setup

---

## Code Style & Conventions

- **No TypeScript** — project is plain JavaScript throughout
- **ES modules** on frontend (Vite), CommonJS on backend
- **Async/await** throughout — no raw Promise chains
- **Error handling:** try/catch in controllers, return proper HTTP status codes
- **Commits:** use conventional commits — `feat:`, `fix:`, `refactor:`, `docs:`
- **No console.log** left in production code — use it for debugging, remove before commit
- **Environment variables:** never hardcode URLs, secrets, or connection strings

---

## Environment Setup

### Backend `.env` (mern_vb_backend/.env)
```
MONGODB_URI=your_mongodb_connection_string
PORT=5000
JWT_SECRET=your_jwt_secret
```

### Frontend `.env` (mern-vb-frontend/.env)
```
VITE_API_URL=https://your-backend-on-render.com/api
```

### CORS
Backend must allow the `chama360.nxhub.online` frontend domain. Check `server.js` cors config when deploying changes.

---

## Testing

```bash
# Backend tests
cd mern_vb_backend && pnpm test
cd mern_vb_backend && pnpm test:coverage

# Frontend tests
cd mern-vb-frontend && pnpm test
```

Test files:
- `mern_vb_backend/tests/` — auth middleware, loan/savings controllers, reports, smoke test
- `mern-vb-frontend/src/__tests__/` — component tests (Testing Library)

Run tests after any change to calculation logic. The loanSavingsController.test.js and reportController.test.js are the most critical.

---

## Dev Test Accounts — Headless Browser Verification

Verifying a UI change in a real browser needs a signed-in session, but Clerk's real
sign-up/sign-in flows both end in a magic link or an emailed OTP — no good for an
agent with no inbox. `mern_vb_backend/scripts/createThrowawayTestUser.js` implements
the documented workaround (full technique + gotchas: second brain
`systems/NS-020-clerk-headless-test-session.md`):

```bash
# No group — lands on /welcome → /onboarding (for testing the onboarding wizard)
node scripts/createThrowawayTestUser.js

# With a group — lands straight on an authenticated page
node scripts/createThrowawayTestUser.js --group "ZZZ_TEST My Group" --template village_bank

# Cleanup (always do this — see below)
node scripts/createThrowawayTestUser.js --delete <clerkUserId> [--groupId <id>]
```

It creates a pre-verified Clerk user via the Backend API (no email ever sent), then
sign in through the real `/sign-in` form with the printed email/password — a "new
device" OTP challenge fires, satisfied by the fixed Clerk test code **424242**
(only works because the email uses the `+clerk_test@` convention; this does NOT work
around the *signup* flow's magic-link step, only the *sign-in* OTP step).

**Safety:**
- The script refuses to run unless `CLERK_SECRET_KEY` starts with `sk_test_` — never
  point this at a live Clerk instance.
- MongoDB is currently still the shared production Atlas database (see the DB section
  above) — every `--group` run creates a real `Group`/`GroupMember`/`GroupSettings`/
  `BankBalance`/`SocialFundBalance`/`ContributionType` set of documents. **Always
  clean up with `--delete` when done**, and prefix test group names with `ZZZ_TEST`
  so they're easy to spot if a cleanup is ever missed.
- `Clerk.setActive({ session })` from the browser console does **not** reliably work
  for this — a session minted via the Backend API isn't bound to the browser's own
  Clerk `client`, so `__client_uat` stays `0` and the app never sees it as signed in.
  Use the real `/sign-in` form + OTP path above instead.

---

## Model Switching Protocol (Claude Code on Pro)

Use Opus when the task requires it. Default to Sonnet.

### Use `claude --model claude-opus-4-5` when:
- Designing a new schema that touches financial calculations
- Figuring out a bug in payment/balance logic
- Planning a multi-step refactor (write the plan to `docs/plan_[feature].md` first)
- Anything where getting it wrong means data corruption

### Stay on Sonnet (default) for:
- Implementing a plan that's already been written out
- Building UI components and forms
- Writing tests
- Fixing CSS/layout issues
- Routine CRUD endpoints

### The discipline:
1. Before a complex task → switch to Opus → ask it to produce a `docs/plan_[task].md`
2. Review the plan yourself — does it make sense?
3. Switch back to Sonnet → implement the plan step by step
4. Run tests after implementation

This keeps Opus usage focused and your context clean.

---

## Verification Loop — Run After Every Change

After completing any task, before reporting done, run this sequence in order.
Do not skip steps. Do not say "done" until all steps pass.

### Step 1 — Tests
```bash
# If you touched backend code:
cd mern_vb_backend && pnpm test

# If you touched frontend code:
cd mern-vb-frontend && pnpm test

# If you touched both:
cd mern_vb_backend && pnpm test && cd ../mern-vb-frontend && pnpm test
```
All tests must pass. If any fail — fix before proceeding.

### Step 2 — Financial Audit (only if financial logic was touched)
Touched any of these? → `loanCalculator.js`, `paymentController.js`,
`bankBalanceController.js`, `loanController.js`, `GroupSettings`:
```bash
cd mern_vb_backend && node scripts/auditBankBalance.js
```
Confirm the script output matches the app-reported balance.
Discrepancy > ZMW 1 = stop and investigate before marking done.

### Step 3 — Console.log sweep
```bash
# Backend
grep -r "console.log" mern_vb_backend/controllers mern_vb_backend/utils mern_vb_backend/routes

# Frontend
grep -r "console.log" mern-vb-frontend/src
```
Remove any console.log statements added during this session before committing.

### Step 4 — Hardcoded value check
If you added or modified financial logic, confirm no raw numbers for:
- Interest rates
- Fine amounts
- Loan limits
- Cycle lengths
All of these must be read from `groupSettings`, not hardcoded.

### Step 5 — State the result
After running the above, explicitly report:
```
✓ Tests passed (backend / frontend / both)
✓ Balance audit clean — no discrepancy (or: not applicable)
✓ No console.log statements
✓ No hardcoded financial values
Ready to commit.
```
If anything is not clean, state what failed and fix it first.

---

## Quick Reference

| Task | File to look at |
|------|----------------|
| Interest calculation | `mern_vb_backend/utils/loanCalculator.js` |
| Payment processing | `mern_vb_backend/controllers/paymentController.js` |
| Bank balance update | `mern_vb_backend/controllers/bankBalanceController.js` |
| Fine logic | `mern_vb_backend/controllers/loanController.js` + Fine model |
| Auth middleware | `mern_vb_backend/middleware/auth.js` |
| Role middleware | `mern_vb_backend/middleware/roles.js` |
| Frontend routes + auth guards | `mern-vb-frontend/src/App.jsx` |
| Global state | `mern-vb-frontend/src/store/` |
| PDF/Excel export | `mern-vb-frontend/src/lib/export.js` |
| Balance audit scripts | `mern_vb_backend/scripts/auditBankBalance.js` |
| Social fund audit | `mern_vb_backend/scripts/auditSocialFund.js` |
| Contribution recording | `mern_vb_backend/controllers/contributionController.js` |
| Social fund expense | `mern_vb_backend/controllers/socialFundController.js` |
| Contribution type config | `mern_vb_backend/controllers/contributionTypeController.js` |
| Backfill existing groups | `mern_vb_backend/scripts/seedContributionDefaults.js` |

---

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

## Support Ticket Threading — Architecture Notes

Added 2026-08-11 (Phase 0.5 of `docs/plan_configurable_group_rules.md`). Key decisions recorded here to prevent regression:

1. **`resolutionNote` is deprecated, not removed.** `SupportRequest.messages[]` (`{ authorType: 'user'|'admin', authorId, authorName, body, createdAt }`) is now the single source of truth for the thread. `resolutionNote` is kept only so historical reads don't break; nothing writes to it anymore. `scripts/migrateSupportResolutionNotes.js` backfills any legacy note in as the first admin message — idempotent (gated on `messages.length === 0`), safe to re-run.

2. **"Unread" is derived, never stored.** `hasUnreadAdminReply()` in `supportController.js` compares the latest admin message's `createdAt` against `SupportRequest.userLastViewedAt`. `userLastViewedAt` is set to `now()` only when the ticket's own user fetches `GET /support/requests/:id` or posts a reply — never by an admin action.

3. **User-facing routes are ownership-scoped, never trust the client.** `GET /support/requests`, `GET /support/requests/:id`, `POST /support/requests/:id/messages` all filter by `clerkUserId` resolved server-side from the session (`getAuth(req)`), same discipline as `createRequest`. No trial/subscription gate on any of them — an expired user must still be able to reach support (NS-005 §2 in the second brain).

4. **A user reply reopens a resolved/closed ticket automatically** (`addUserMessage` flips status to `in_progress`). An admin reply on an `open` ticket also auto-advances it to `in_progress`. Neither path touches `resolvedAt`/`resolvedBy` — those are still write-once, per the existing status-transition rule.

5. **Notification failures are logged, not surfaced on the ticket document.** Unlike ticket-creation notifications (which write to `notifyError`), reply notifications (`notifyAdminOfReply` Telegram ping, `notifyUserOfReply` Resend email) fail silently to `console.error` and never block the reply itself — mixing reply-notification failures into the creation-time `notifyError` field would conflate two different events.

6. **Ported from NdalamaHub, not built from scratch.** `~/Dev_Projects/ndalamahub_lms_app/server/routes/tickets.js` already had a working two-way thread (`Ticket.messages[]`, scope-filtered list/get, `POST /:id/messages`, counterparty notification) that NS-005 in the second brain didn't know about. Chama360's version omits NdalamaHub's multi-tenant `ticketScopeFilter`/`isHandler` machinery (not needed — Chama360 has one flat customer-vs-admin relationship, not lender/employer/borrower tenancy) but keeps the same shape. If a future app needs this pattern, check `docs/plan_configurable_group_rules.md` Phase 0.5 and NS-005 first.

---

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

*Last updated: 2026-08-12 — Phase 4 (configurable group rules: membership fee as a liability) added*
*Next review: April 7 (Week 1 checkpoint)*
