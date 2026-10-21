# CLAUDE.md — Chama360 (Village Banking App)

This file holds **current reality and standing rules only**. It loads into every session, so keep it short (under about 200 lines).

- History, per-release detail and lessons: `CHANGELOG.md`. Plans: `docs/plan_*.md` and `docs/build/`. Parked ideas: `docs/PARKING_LOT.md`.
- Area detail loads automatically from `.claude/rules/` when you touch matching files: `financial-logic`, `database-ops`, `auth`, `frontend`, `test-accounts`, `contributions-funds`, `payments-corrections`, `support`, `group-rules`, `subscriptions`, `signup-source`.
- The full previous version of this file is preserved verbatim at `docs/history/CLAUDE-2026-10-21.md` (indexed in `docs/history/README.md`).

**Last updated:** 2026-10-21

---

## What it is

Chama360 (repo `mern_vb_app`, formerly Village Banking App) manages village banking groups in Zambia: savings, loans, fines, contributions, named funds, reports and cycles. Users are group treasurers, loan officers, admins and members. Multi-group, self-serve onboarding, paid subscriptions (manual or Lipila mobile money). Current version: see the top of `CHANGELOG.md` (3.20.0 on 2026-10-18).

## Second brain

William's cross-venture context is in `/Users/williammweemba/Dev_Projects/wsm-second-brain` and is **read-only from here**. Pull specific files only when needed: `WILLIAM.md` (priorities, what not to suggest), `systems/NS-001-manual-payment-flow.md` (billing), `systems/NS-002-security-audit.md` (before deploys), `systems/NS-005-in-app-support-system.md` (support; Chama360 is its source), `systems/NS-020-clerk-headless-test-session.md` (test sessions). Flag anything that belongs in the second brain to William rather than writing it yourself.

## Repository

```
mern_vb_app/
├── mern_vb_backend/   Express 5 API: controllers/, models/, routes/, middleware/, utils/, scripts/, tests/
└── mern-vb-frontend/  React 19 + Vite 7 PWA: src/{App.jsx, features/, components/, pages/, store/, lib/}
```

- Backend: Node, Express **5**, Mongoose 8, MongoDB, CommonJS. Frontend: React 19, Vite 7, Tailwind 4, shadcn/ui, Zustand 5, react-hook-form + Zod 4, React Router 7, dayjs, sonner, jsPDF + xlsx (exports are frontend-only), vite-plugin-pwa.
- Auth: **Clerk** (`@clerk/express`). `middleware/auth.js` verifies the session; `middleware/resolveGroup.js` sets `req.groupScope` and `req.role`; `requireRole` checks it. Roles: `admin`, `treasurer`, `loan_officer`, `member`, plus super admin. Detail: `.claude/rules/auth.md`.
- pnpm. `pnpm start` runs both apps; `pnpm dev` in either folder runs one.

## Production and deployment

- Live at `https://chama360.nxhub.online`, API `https://api.chama360.nxhub.online`, both on Coolify (Hetzner).
- **Auto Deploy is ON: `git push origin main` is a production deploy**, with no manual gate. The Verification Loop below is the pre-push gate. The demo environment (`docs/plan_demo_environment.md`) is the one resource with Auto Deploy off.
- Scripts in `scripts/` ship to the production container on every push. Any guard in a data-changing script must assume it could be run against production by mistake.
- Production Mongo is a self-hosted Coolify instance that is **not reachable from a local machine**. Run production scripts with `docker exec` on the box. Atlas is the dev/staging database (the local `.env` target). Detail: `.claude/rules/database-ops.md`.
- **Production Mongo must be a replica set.** Seven controllers use transactions, and every write path fails on a standalone. After any Coolify database redeploy, check `curl -s https://api.chama360.nxhub.online/api/health` (503 with `transactionsAvailable: false` means broken).

## Non-negotiables

- **Money**: every payment operation runs in a MongoDB session (atomic, rolls back on failure). Never change a bank balance without writing a `Transaction` in the same session. Fines credit the balance only when **paid**. `utils/loanCalculator.js` is the most critical file; read `.claude/rules/financial-logic.md` before touching any calculation.
- **No hardcoded financial values**: interest rates, fine amounts, loan limits and cycle lengths come from `groupSettings`.
- **Tenant scope fails closed**: controllers query `{ ...req.groupScope, ... }`, and an undefined scope widens to every group. Scope middleware must refuse the request rather than call `next()` without setting `req.groupScope`.
- **Express 5 route order**: static routes (`/export`) before dynamic ones (`/:userId`).
- **Frontend UI follows `UI_SPEC.md` exactly** unless William says otherwise for that change. Use `components/ui/Select.jsx`, never a raw `<select>`. Detail: `.claude/rules/frontend.md`.
- Never add backend PDF routes; PDF and Excel export live in `src/lib/export.js`.

## Conventions

No TypeScript. ES modules on the frontend, CommonJS on the backend. `async/await`, no raw promise chains. try/catch in controllers with proper status codes. Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`). No `console.log` left in production code. Never hardcode URLs, secrets or connection strings.

Environment variable names are in `mern_vb_backend/.env.example` (Mongo, Clerk, invite JWT, super admin, Resend, Telegram, Lipila) and `mern-vb-frontend/.env.example` (`VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`). Backend CORS must allow `chama360.nxhub.online`.

## Model use

Opus plans anything that touches financial schema, payment or balance bugs, or multi-step refactors: write the plan to `docs/plan_<feature>.md` (or a `/build` plan) first. Sonnet implements written plans, UI, tests and routine CRUD.

## Verification Loop: run before every push to main

1. **Tests**: `cd mern_vb_backend && pnpm test` and/or `cd mern-vb-frontend && pnpm test`. All must pass. `loanSavingsController.test.js` and `reportController.test.js` matter most.
2. **Financial audit**, if you touched `loanCalculator.js`, `paymentController.js`, `bankBalanceController.js`, `loanController.js` or `GroupSettings`: `cd mern_vb_backend && node scripts/auditBankBalance.js --all`. A discrepancy over ZMW 1 on a group you touched means stop and investigate. William's Group carries a known ~K18,177 test-data drift.
3. **console.log sweep**: `grep -r "console.log" mern_vb_backend/controllers mern_vb_backend/utils mern_vb_backend/routes mern-vb-frontend/src`.
4. **Hardcoded values**: none in financial logic.
5. **Report** each step's result explicitly before committing.

## Headless browser verification

Use `mern_vb_backend/scripts/createThrowawayTestUser.js` (needs a `sk_test_` Clerk key). Sign in through the real `/sign-in` form with OTP **424242**. Prefix groups `ZZZ_TEST` and always clean up with `--delete`. Detail and caveats: `.claude/rules/test-accounts.md`.

## Scope

Scope rules are evidence-based and get re-tested when new customer data arrives (second brain P-003). Still parked: actually **disbursing** compelled forced-borrowing principal. The interest obligation itself is built (group rules Phase 3). Anything else out of scope goes in `docs/PARKING_LOT.md`.

## Quick reference

| Task | File |
|---|---|
| Interest calculation | `mern_vb_backend/utils/loanCalculator.js` |
| Payments / bank balance / loans and fines | `controllers/{payment,bankBalance,loan}Controller.js` |
| Contributions / funds / contribution types | `controllers/{contribution,fund,contributionType}Controller.js` |
| Auth and scope middleware | `middleware/{auth,resolveGroup,roles}.js` |
| Frontend routes and guards / global state / export | `src/App.jsx`, `src/store/`, `src/lib/export.js` |
| Balance and fund audits | `scripts/auditBankBalance.js`, `scripts/auditFunds.js` |
| Lipila client, webhook, collection, activation | `utils/lipilaClient.js`, `controllers/lipilaWebhookController.js`, `utils/subscriptionCollection.js`, `utils/subscription.js` |
| Stuck payments / dev webhook | `scripts/listPendingSubscriptionPayments.js`, `scripts/devSimulateLipilaWebhook.js` |

## Maintaining this file

Edit sections in place so the file always describes current reality. Put what happened in `CHANGELOG.md`. Put a durable rule here only if it applies to every session; otherwise put it in the matching `.claude/rules/` file.
