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
- **Database:** MongoDB via Mongoose 8.x
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
- **Frontend:** Netlify (deploy `dist/` folder)
- **Backend:** Render (Node.js server)
- **Live URL:** https://villagebanking.netlify.app/

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

---

## What NOT to Build (Sprint Constraints)

**Forced minimum borrowing rule** — William's group has a rule where members who haven't hit their loan threshold are compelled to borrow from surplus. This rule is:
- Unique to one group
- Too complex to configure generically
- Will confuse every other group in demos
- **Parked as a future premium feature post-10 group onboarding**

Do not implement this. Do not design around it. If it comes up, add it to the parking lot.

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
Backend must allow the Netlify frontend domain. Check `server.js` cors config when deploying changes.

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

*Last updated: 2026-05-29 — partial payments + auto-fine feature added*
*Next review: April 7 (Week 1 checkpoint)*
