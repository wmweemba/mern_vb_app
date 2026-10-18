# Build: signup-source-tracking

**Goal:** Remember a `?ref=` link through Clerk sign-up and onboarding, store it on the
`Group` the user creates (`Group.signupRef`), fire a Telegram alert on every self-serve
group creation naming the source, and show the source in the super-admin groups list and
detail page. Must be live before Mon 2026-10-26 (Campaign 2).
**Repo:** /Users/williammweemba/Dev_Projects/mern_vb_app · **Branch:** build/signup-source-tracking · **Base:** c7ef533 (main)
**Status:** building
**Source spec:** `docs/plan_signup_source_tracking.md` (Opus, 2026-10-16). Decisions D1–D11 there are final. Its exact code blocks are to be used as written.

## Context

- Monorepo. Backend `mern_vb_backend/`: Express 5 + Mongoose 8, **CommonJS**, Jest + Supertest (`pnpm test`). Transactional tests use `MongoMemoryReplSet`; `tests/contributionController.test.js` "Group seeding" (test 10) has the harness and the `@clerk/express` mock for `POST /api/groups`.
- Frontend `mern-vb-frontend/`: React 19 + Vite 7, **ES modules**, Jest 30 + babel-jest + jsdom already configured (`jest.config.js` testMatch `**/src/**/*.test.js`; existing tests in `src/__tests__/`). No new dependencies in this build.
- **Ref rule (D1):** `^[a-z0-9][a-z0-9-]{0,39}$` after trim + lower-case; anything else → `null`. Server re-validates (D6).
- **First touch, 30 days (D2/D3):** `localStorage` key `c360_signup_ref`, value `{"ref","at"}`, every access in try/catch.
- **Captured at module top level in `main.jsx` before `createRoot` (D4)** — the `/` and `*` routes `<Navigate>` away and drop the query string.
- **`Group.signupRef`** String default `null`, set once in `groupController.createGroup` (D5). Super-admin-created groups store `'admin'` (D7). No ref displays as `direct` (D9). No backfill.
- **Alert never blocks or fails creation (D10):** fired after `withTransaction` resolves and after `res.status(201).json`, no `await`, `.catch` → `console.error`. Never inside the transaction. No phone or email in the message.
- CLAUDE.md rules: no `console.log` left in code (`console.error` is fine), follow `UI_SPEC.md` tokens for any UI, conventional commits.
- Verified facts (orchestrator, 2026-10-17): `createGroup` at `groupController.js:12`, `Group.create` at :73, `res.status(201)` at :157; admin `createGroup` `Group.create` at `adminGroupsController.js:102`; `main.jsx` `createRoot` at :69; Onboarding post at :131, `refreshMembership()` at :146; Telegram shape + `escapeHtml` in `utils/notifyBilling.js`.
- Branch is `build/signup-source-tracking` (the /build convention), not the source spec's `feat/…` name.

## Units

| ID | Title | Model | Risk | Depends on | Owns (files) | Status |
|---|---|---|---|---|---|---|
| U0 | Baseline | verifier | — | — | none | todo |
| U1 | Backend ref rule | haiku | low | U0 | `mern_vb_backend/utils/signupRef.js`, `mern_vb_backend/tests/signupRef.test.js` | todo |
| U2 | Model, createGroup, alert | sonnet | **high** | U1 | `models/Group.js`, `controllers/groupController.js`, `controllers/adminGroupsController.js`, `utils/notifyNewGroup.js`, `tests/groupSignupRef.test.js` (all under `mern_vb_backend/`) | todo |
| U3 | Browser capture | sonnet | low | U0 | `mern-vb-frontend/src/lib/signupRef.js`, `src/main.jsx`, `src/pages/Onboarding.jsx`, `src/__tests__/signupRef.test.js` | todo |
| U4 | Super-admin visibility | sonnet | low | U2 | `mern-vb-frontend/src/pages/admin/AdminGroupsList.jsx`, `src/pages/admin/AdminGroupDetail.jsx` (+ backend admin controller projection only if one excludes the field) | todo |
| U5 | Docs + version | haiku | low | U1–U4 | `CHANGELOG.md`, root `package.json` version, `CLAUDE.md` | todo |

### U0 — Baseline
- Backend `pnpm test` and frontend `pnpm build` + `pnpm test` on the untouched branch. Record pass counts here so later failures can be attributed.

### U1 — Backend ref rule
- **Brief:** Source spec Step 1, code as written. Tests: `' FB '`→`'fb'`, `'p-maluba'`→`'p-maluba'`; `'-bad'`, `'has space'`, `'<script>'`, 41 chars, `'+260977'`, `undefined`, `null`, a number → `null`. Also a 40-char valid ref passes.
- **Contracts:** `const { normaliseRef } = require('../utils/signupRef')` → `string | null`.
- **Acceptance:** `cd mern_vb_backend && pnpm test -- signupRef` exits 0.

### U2 — Model, createGroup, alert
- **Brief:** Source spec Step 2 items 1–5 exactly. The alert call goes after `res.status(201).json(result)` inside the `try`, so the 409 / error paths never alert. Template key passed as `template ? template.key : templateKey` fallback per spec (`'village_bank'`). `notifyNewGroup` uses `AbortSignal.timeout(8000)`, catches everything, never throws.
- **Contracts:** `Group.signupRef` (String|null); `notifyNewGroup({ groupName, treasurerName, templateKey, ref })` → Promise<void>, never rejects in practice.
- **Acceptance:** `cd mern_vb_backend && pnpm test` (whole suite) exits 0 with the 4 new cases in `tests/groupSignupRef.test.js` (valid mixed-case ref stored lower-case + alert called once with it; `<script>` → null + alert with `ref: null`; no ref → null; alert mocked to reject → still 201 and group exists). Plus a 5th: admin `createGroup` stores `signupRef: 'admin'` if the existing admin test harness makes that cheap; otherwise state why not. **Opus diff read before commit.**

### U3 — Browser capture
- **Brief:** Source spec Step 3, code as written. Test goes in `src/__tests__/signupRef.test.js` (existing Jest setup; no new config or deps — if it would need any, skip the test and say so). Cases: normalise cases as U1; capture stores a valid ref; invalid ref stores nothing; first touch wins while fresh; a stale (>30 days) stored ref is replaced; corrupt JSON in storage → `getStoredRef()` null; `clearStoredRef` removes it.
- **Contracts:** `captureRefFromUrl(search)`, `getStoredRef()`, `clearStoredRef()`, `normaliseRef()`. Onboarding posts `signupRef` in the `/groups` body.
- **Acceptance:** `cd mern-vb-frontend && pnpm test && pnpm build` exits 0; `grep -n captureRefFromUrl src/main.jsx` shows the call before the `createRoot(` line.

### U4 — Super-admin visibility
- **Brief:** Source spec Step 4. Source column after Created (desktop) + secondary line on the mobile card; one `Source:` line on the detail summary. `g.signupRef || 'direct'`. Existing tokens only. Confirm `listGroups` and the detail endpoint return the field (no projection excludes it); report what you found.
- **Acceptance:** `cd mern-vb-frontend && pnpm test && pnpm build` exits 0.

### U5 — Docs + version
- **Brief:** CHANGELOG 3.20.0 entry (signup source tracking + new-group alert), bump root `package.json` version to 3.20.0 (and CLAUDE.md "Current version"), add a short "Signup Source Tracking — Architecture Notes" section to CLAUDE.md naming `Group.signupRef`, `utils/signupRef.js`, `utils/notifyNewGroup.js`, `src/lib/signupRef.js`, the boot-time capture and why (D4), and D10.
- **Acceptance:** `git diff --stat` touches only the three owned files; `node -e "require('./package.json').version==='3.20.0'||process.exit(1)"` exits 0.

## Gates
| Gate | After | Opus reads | Note |
|---|---|---|---|
| G1 | U2 | `groupController.js` diff, `notifyNewGroup.js`, `groupSignupRef.test.js` | |
| G2 | U5 (before Phase 3) | `git diff --stat c7ef533..HEAD`, `src/lib/signupRef.js`, `main.jsx` diff | |

## E2E flows
Local only, against Atlas (dev/staging), throwaway Clerk user via `scripts/createThrowawayTestUser.js` (no `--group`, so it lands on onboarding). Never production.
1. Fresh profile → `http://localhost:<port>/?ref=p-test` → `localStorage.c360_signup_ref` holds `p-test` after the redirect.
2. Sign in the throwaway user (OTP 424242), complete onboarding → new `Group.signupRef === 'p-test'`; alert attempted with `Source: p-test`; `c360_signup_ref` removed.
3. Fresh profile → `/?ref=%3Cscript%3E` → nothing stored; second throwaway onboarding → `signupRef: null`.
4. Super-admin `/admin/groups` + detail → Source shows `p-test` / `direct`.
5. Cleanup: delete throwaway Clerk users and groups (`--delete`, then `cleanupOrphanedRecords.js` dry run).

## Out of scope
Referral rewards/payouts/partner dashboard (D11), backfilling existing groups (D9), production deploy, Coolify env checks, demo environment. Spec Step 6 items 1–3 are post-build, William's go-ahead each.

## Log
- 2026-10-17 session start (Opus orchestrator). No prior build dir. Uncommitted change in `docs/build/lipila-subscription-collection/plan.md` pre-dates this build — left untouched, not to be committed here.
- 2026-10-18 plan approved by William; branch created; build start 12:17
