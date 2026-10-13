# Build: lipila-subscription-collection

**Goal:** Let a group's admin or treasurer renew the Chama360 subscription from `/upgrade` by
mobile money (Lipila PIN prompt), activating the group automatically through the same `Group`
fields the super-admin manual path uses. Manual super-admin control stays fully intact and
remains the fallback of record. The feature ships dark (`LIPILA_ENABLED` unset).

**Repo:** /Users/williammweemba/Dev_Projects/mern_vb_app · **Branch:** build/lipila-subscription-collection · **Base:** 9e78b37 (main, 2026-10-13)
**Status:** building (approved 2026-10-13)
**Source plan (authoritative for every detail):** `docs/plan_lipila_subscription_collection.md`
This build covers its Steps 1–5, 7a, 7b (simulated rows), 8, 9, 10. **Not in this build:**
Step 0a/0b/0c and Step 6 and matrix rows 18–19 (William, real money), Step 11 (push/merge/deploy,
William's go-ahead), Step 12 (renewal email: separate branch after Lipila is live).

## Context

Subagents: read this section, your own unit, and the source-plan sections your unit cites.
Where the source plan gives exact code, use it as written. If the codebase contradicts the
source plan, **stop and report in your summary**; don't "fix" either one.

- **Stack:** Express 5 + Mongoose 8 (CommonJS) backend in `mern_vb_backend/`; React 19 + Vite 7
  + Tailwind 4 + Zustand frontend in `mern-vb-frontend/` (ES modules). pnpm. Jest + Supertest;
  transactional tests use `MongoMemoryReplSet` (copy the harness from
  `tests/contributionController.test.js`). No new npm dependencies in this build. Node global
  `fetch` + `AbortSignal.timeout`, `crypto`, and the existing `resend` package cover everything.
- **Decisions D1–D12 and design rules 1–10:** source plan §2. Don't re-litigate them.
- **Lipila API facts:** source plan §3. **The BazaBooks code is the API source, not Lipila's docs:**
  `~/Dev_Projects/payrush_saas_app/client/src/lib/lipila/client.js`, `.../lib/billing/msisdn.js`,
  `.../lib/billing/subscriptionCollection.js`, `.../components/billing/UpgradePage.js` (LipilaPayCard),
  and `~/Dev_Projects/lipila-sandbox-spike/src/webhookVerify.js`. Port them (ESM → CommonJS).
- **Design:** source plan §4.1–4.4 (model shape, `extendGroupSubscription`, concurrency).
- **Middleware:** group-facing routes use `verifyToken` (`middleware/auth.js`), `resolveGroup`
  (`middleware/resolveGroup.js`, sets `req.groupId`/`req.role`/`req.member`), and
  `requireRole(['admin','treasurer'])`. `requireRole` takes an ARRAY and is not variadic.
  **Never `checkTrial` on billing routes** (an expired group must be able to pay).
- **Transactions:** never call Lipila, Telegram or Resend inside `withTransaction` (it can
  retry). `res.json` only after `withTransaction` resolves (CLAUDE.md Reversal note #5).
- **Never touch** `GroupFund`, `FundExpense`, `BankBalance`, `Transaction` (D5), `markUnpaid`,
  or the trial-expiry edit (`PATCH /api/admin/groups/:groupId`).
- **Secrets/PII:** never log or commit a key, secret or full MSISDN; mask as `•••123`
  everywhere outside the `SubscriptionPayment` document. Tests use fake numbers (`0975551234`)
  and secrets generated in the test.
- **Frontend:** read `UI_SPEC.md` before writing JSX; use `components/ui/Select.jsx` for any
  dropdown, tokens rather than hex values. API calls go through the existing axios instance used
  by `pages/UpgradePage.jsx`.
- **Conventions:** no `console.log` left in code (`console.error` for real errors is fine);
  try/catch in controllers with `{ data }` / `{ error }` bodies; conventional commits; no
  `Co-Authored-By`.
- **Production state (Step 0d, read 2026-10-13):** `/api/health` → `transactionsAvailable: true`.
  One non-deleted group: *Grocery Savings Group*, `plan: standard`, `isPaid: true`,
  `paidUntil: 2026-11-01`, 25 active members. No no-expiry groups, none over 40, none on a too-small
  plan. Its renewal is due 2026-11-01, so this is the first real customer of the feature.

## Units

| ID | Title | Model | Risk | Depends on | Owns (files) | Status |
|---|---|---|---|---|---|---|
| U1 | Model + cleanup-script opt-out | sonnet | high | — | `models/SubscriptionPayment.js`, `models/Group.js`, `scripts/utils/groupScopedModels.js`, `tests/groupScopedModels.test.js` | done |
| U2 | MSISDN + Lipila client port | sonnet | high | — | `utils/msisdn.js`, `utils/lipilaClient.js`, `tests/msisdn.test.js`, `tests/lipilaClient.test.js`, `.env.example` | done |
| U3 | `extendGroupSubscription` + activate refactor | sonnet | high | — | `utils/subscription.js`, `controllers/adminBillingController.js`, `tests/adminBilling.test.js` | done |
| U4 | Resolver + notifications | sonnet | high | U1 U2 U3 | `utils/subscriptionCollection.js`, `utils/notifyBilling.js`, `tests/subscriptionCollection.test.js` | done |
| U5 | Initiate route | sonnet | high | U4 | `controllers/subscriptionPaymentController.js`, `routes/subscriptionPaymentRoutes.js`, `server.js`, `tests/subscriptionPaymentInitiate.test.js` | done |
| U6 | Attempt / latest / history routes | sonnet | high | U5 | same controller + routes files, `tests/subscriptionPaymentRead.test.js` | done |
| U7 | Lipila webhook route | sonnet | high | U4 | `routes/webhookRoutes.js`, `controllers/lipilaWebhookController.js`, `tests/lipilaWebhook.test.js` | todo |
| U8 | Dev webhook simulator script | sonnet | high | U7 | `scripts/devSimulateLipilaWebhook.js` | todo |
| U9 | Admin payments endpoint + pending-payments script | sonnet | low | U1 | `controllers/adminBillingController.js` (new handler only), `routes/admin.js`, `scripts/listPendingSubscriptionPayments.js`, `tests/adminBilling.test.js` (append) | todo |
| U10 | `/me` fields + renewal banner | sonnet | low | — | `controllers/authController.js`, `components/TrialBanner.jsx`, frontend auth store if it maps `/me` fields, `src/__tests__/TrialBanner.test.jsx` | todo |
| U11 | Upgrade page: Lipila pay card | sonnet | high | U6 U10 | `src/features/billing/LipilaPayCard.jsx`, `pages/UpgradePage.jsx` | todo |
| U12 | Upgrade page: plan guards, role messaging, payment history | sonnet | low | U11 | `src/features/billing/PaymentHistory.jsx`, `pages/UpgradePage.jsx` | todo |
| U13 | Admin Billing tab payments list | sonnet | low | U9 | `pages/admin/AdminGroupDetail.jsx` (BillingTab only) | todo |
| U14 | Docs, runbook, version | haiku | low | all | `CLAUDE.md`, `CHANGELOG.md`, `package.json` (root version), `docs/plan_lipila_subscription_collection.md` (findings/status only) | todo |

Backend paths are relative to `mern_vb_backend/`, frontend paths to `mern-vb-frontend/src/`
unless written with `src/`. U1, U2 and U3 have no shared files and no dependency, so they are
parallel candidates (max 2 at once, worktrees).

### U1 — Model + cleanup-script opt-out
- **Brief:** Source plan Step 1b + 1c. Create `models/SubscriptionPayment.js` exactly per §4.2,
  with the four indexes and schema option `retainOnGroupDelete: true`. Follow the existing models'
  `autoIndex` convention. Add `lastPaymentAttemptAt: { type: Date, default: null }` to
  `models/Group.js`. In `scripts/utils/groupScopedModels.js`, skip any model whose
  `schema.options.retainOnGroupDelete === true`, and update the header comment with why (payment
  records are proof of real money and MNO refs, must outlive their group; BazaBooks precedent).
  Then read `scripts/deleteGroups.js`, `scripts/cleanupOrphanedRecords.js`,
  `scripts/createThrowawayTestUser.js` and confirm all three get their model list only from
  `groupScopedModels()`. Report what you found for each (a hardcoded list = stop and report).
- **Contracts:** model name `SubscriptionPayment`, collection `subscriptionpayments`, fields as §4.2.
- **Acceptance:** `cd mern_vb_backend && pnpm test` exits 0; new test asserts `SubscriptionPayment`
  is absent from `groupScopedModels()` while `Saving` is present.

### U2 — MSISDN + Lipila client port
- **Brief:** Source plan Step 2a–2d. `utils/msisdn.js`: port `normalizeZambianMsisdn`, `maskMsisdn`
  verbatim from BazaBooks. `utils/lipilaClient.js`: port BazaBooks `lib/lipila/client.js` to
  CommonJS (code, not a re-description). Env vars read inside functions only. Keep
  `initiateCollection` (→ `pending|failed|ambiguous`), `checkCollectionStatus`
  (→ `pending|success|failed|unknown`; 404/non-JSON → `unknown`), `mapLipilaStatus`,
  `classifyFailureReason` (timeout checked before pin), `verifyWebhookSignature`. 20 s timeout via
  `AbortSignal.timeout`. Cross-check signature verification against
  `~/Dev_Projects/lipila-sandbox-spike/src/webhookVerify.js`. Add the six `LIPILA_*` names, empty,
  to `mern_vb_backend/.env.example`. **Do not open or copy from any `.env` file.**
- **Contracts:** exports exactly the five functions above (+ `normalizeZambianMsisdn`, `maskMsisdn`).
- **Acceptance:** `pnpm test` exits 0, including Step 2a's MSISDN cases and Step 2c's cases
  (valid; tampered body; `v1,bad v1,<good>`; timestamp > 300 s old; missing header;
  `mapLipilaStatus`; `classifyFailureReason` on the five §3 messages). `initiateCollection` tests
  mock `global.fetch` to cover 200 Pending, 500 generalErrors (failed), 429 (failed), timeout
  (ambiguous), unparseable 5xx (ambiguous).

### U3 — `extendGroupSubscription` + activate refactor
- **Brief:** Source plan Step 3a–3c. `utils/subscription.js` exactly per §4.3. Rewire
  `adminBillingController.activate` per Step 3b's code. Validation, response shape and audit-log
  row stay **identical**; the `customPaidUntil` NaN check stays before the transaction.
  `markUnpaid` untouched. **Hard requirement:** behaviour-identical apart from the transaction.
- **Contracts:** `extendGroupSubscription(session, { groupId, plan, durationMonths, customPaidUntil })`
  → `null | { group, before, paidUntil }`; must be called inside a transaction.
- **Acceptance:** `pnpm test` exits 0, with new `tests/adminBilling.test.js` covering Step 3c's
  five cases (trial group activate; paid-up group extends from old expiry; customPaidUntil;
  invalid plan → 400; markUnpaid unchanged). Existing admin tests unchanged.

### U4 — Resolver + notifications
- **Brief:** Source plan Step 5a, 5c, 5d. `utils/subscriptionCollection.js` exports
  `resolveAttempt(attemptId, result)` and `reconcileAttempt(attemptId)` plus a post-commit
  `afterResolve(outcome)` (or equivalent) that sends 5c + 5d only on activation. Port the logic
  from BazaBooks `subscriptionCollection.js`; Postgres locking becomes the §4.4 claim
  (`findOneAndUpdate({ _id, status: { $ne: 'success' } })` + `extendGroupSubscription` in the same
  transaction). All six warning flags per 5a/5c. `utils/notifyBilling.js`:
  `notifyAdminSubscriptionCollected` (Telegram + Resend, `Promise.allSettled`, escaped names, never
  throws) and `sendPaymentReceipt`. Copy the Telegram/Resend call shape from
  `controllers/billingController.js` / `controllers/supportController.js`; don't refactor those.
- **Contracts:** `resolveAttempt` returns `{ transitioned, activated, attempt, warnings }`;
  `reconcileAttempt` returns the (possibly updated) attempt. U5–U7 call these.
- **Acceptance:** `pnpm test` exits 0, covering Step 5e's resolver cases: three identical
  successes → one extension; late success activates with `wasLateSuccess`; amount mismatch
  activates and flags; failed never extends; `unknown` < 30 min stays pending, > 30 min fails with
  `not_found_at_provider`; concurrent `resolveAttempt` + `extendGroupSubscription` (admin activate
  path) on the same group → two months total, none lost; group missing → success +
  `group_missing`. Notifications mocked, asserted called only on activation.

### U5 — Initiate route
- **Brief:** Source plan Step 4a (all 8 points) and the initiate half of 4e. New
  `routes/subscriptionPaymentRoutes.js` mounted in `server.js` as `/api/billing/lipila` **after**
  `express.json()`; each route `verifyToken, resolveGroup, requireRole(['admin','treasurer'])`, no
  `checkTrial`. Member count for D10 uses the same counting as `utils/planLimits.js`. Payer email:
  `req.member.email`, else Clerk primary email via the existing `clerkClient` usage in the codebase,
  else empty. Lipila is called **after** commit.
- **Contracts:** `POST /api/billing/lipila/initiate` `{ plan, msisdn }` →
  `201 { data: { attemptId, status, amount, currency, maskedMsisdn, resumed } }`; errors
  `503 UNAVAILABLE`, `400 INVALID_MSISDN`, `409 NO_EXPIRY_GROUP|PLAN_TOO_SMALL|ATTEMPT_IN_PROGRESS`,
  `429 TOO_MANY_ATTEMPTS`, `502 COLLECTION_REJECTED { attemptId, failureKind }`.
- **Acceptance:** `pnpm test` exits 0 with `jest.mock('../utils/lipilaClient')`, covering: role
  guard (member, loan_officer → 403); kill switch → 503; invalid MSISDN; NO_EXPIRY_GROUP;
  PLAN_TOO_SMALL at 21 + starter; exactly 20 + starter allowed; resume within 90 s (Lipila called
  once); different plan → 409; throttle 429 by group (5) and by MSISDN (3); test amount ignored when
  `NODE_ENV=production` and when base URL is `blz.lipila.io`; failed → 502 with no raw text;
  ambiguous → stays pending, 201; expired-trial group can initiate.

### U6 — Attempt / latest / history routes
- **Brief:** Source plan Step 4b, 4c, 4d and their 4e cases. Reconcile throttle: pending, older
  than 20 s, `lastCheckedAt` null or older than 15 s → `reconcileAttempt`. `failureKind` from
  `classifyFailureReason`; raw provider text never returned. `/latest` returns `{ enabled, attempt }`
  with the resume rules in 4c. `/history` per 4d, MSISDN masked.
- **Contracts:** `GET /attempts/:attemptId` → `{ data: { status, amount, currency, plan, failureKind, paidUntil } }`;
  `GET /latest` → `{ data: { enabled, attempt|null } }`; `GET /history` → `{ data: [...] }` (4d shape).
- **Acceptance:** `pnpm test` exits 0, covering: another group's attempt → 404; malformed id → 404;
  stale pending triggers reconcile (mock) at most once per 15 s; `/latest` hides pending > 10 min
  and anything > 24 h; `/history` only `success`, newest first, max 24, masked; role guard 403.

### U7 — Lipila webhook route
- **Brief:** Source plan Step 5b, all 7 points. `POST /api/webhooks/lipila/subscriptions` in
  `routes/webhookRoutes.js` with `express.raw({ type: () => true })` on the route. Handler in
  `controllers/lipilaWebhookController.js`. Exceptions in resolve → 500 (so Lipila retries). The
  webhook does **not** check `LIPILA_ENABLED` (money that arrives always activates).
- **Acceptance:** `pnpm test` exits 0, covering Step 5e's webhook cases: bad signature 401; replay
  (old timestamp) 401; signed-but-unparseable 200; `type: Disbursement` 200, nothing written;
  unknown ref 200, nothing written; valid Successful → attempt success + group extended; forced
  resolver throw → 500. Supertest sends the raw body against the real `server.js` mount order or an
  app built the same way (webhooks before `express.json()`).

### U8 — Dev webhook simulator script
- **Brief:** Source plan Step 7a. `scripts/devSimulateLipilaWebhook.js` with all flags listed there
  and all three refusal guards (Atlas dev URI only and never the Coolify container host;
  `NODE_ENV !== 'production'`; target URL host `localhost`/`127.0.0.1`). Inserts or reuses an
  attempt (`--attempt <id>` or `--group <id> --plan <key>`), signs with `LIPILA_WEBHOOK_SECRET` from
  env, POSTs. Prints status codes and the attempt's resulting status only; never prints the secret.
- **Acceptance:** `node scripts/devSimulateLipilaWebhook.js --help` exits 0;
  `NODE_ENV=production node scripts/devSimulateLipilaWebhook.js --group x` exits non-zero with a
  refusal; `MONGODB_URI=mongodb://bw0k4sgwsw8kkkg4skkc8ksw:27017/x node ...` exits non-zero with a
  refusal; a target URL that isn't localhost is refused. (The orchestrator runs it live at G2.)

### U9 — Admin payments endpoint + pending-payments script
- **Brief:** Source plan Step 8b (backend half) and Step 10.3's script. New handler
  `listPayments` in `adminBillingController` (don't touch `activate`/`markUnpaid`);
  `GET /api/admin/groups/:groupId/billing/payments` in `routes/admin.js` behind the existing
  `requireSuperAdmin`, placed alongside the other billing routes (mind Express 5 static-before-dynamic
  ordering). Returns every attempt, all statuses, newest first: date, plan, amount, currency, status,
  `failureReason` (raw is fine, admin only), masked MSISDN, `providerExternalId`, `isTestAmount`,
  `amountMismatch`, `wasLateSuccess`, `initiatedByName`, `paidUntilAfter`.
  `scripts/listPendingSubscriptionPayments.js`: read-only, lists pending > 15 min and failed with
  `not_found_at_provider`, masked MSISDN, no writes.
- **Acceptance:** `pnpm test` exits 0, with appended tests: super admin gets the list; non-super-admin
  403; malformed groupId → 404 or 400 (not 500); MSISDN masked in the response.

### U10 — `/me` fields + renewal banner
- **Brief:** Source plan Step 9a–9c. `/me` adds `paidUntil` and `planKey`, existing fields unchanged.
  Extend `components/TrialBanner.jsx` (it is the one shown layout-wide; confirm and say so). Branches
  per 9b, `RENEWAL_WARNING_DAYS = 7` named constant. Fix the lapsed-paid wording. Never for super
  admins, `paidUntil` null, or year ≥ 2099. If the frontend auth store whitelists `/me` fields, add
  the two new ones there.
- **Acceptance:** backend `pnpm test` and frontend `pnpm test` exit 0; new frontend test covers:
  admin within 7 days → renew link; > 7 days → nothing; lapsed paid admin → new wording + link;
  lapsed paid member → "Ask your admin or treasurer" with no link; expired trial → today's message;
  super admin → nothing; 2099 → nothing.

### U11 — Upgrade page: Lipila pay card
- **Brief:** Source plan Step 8a points 1, 3, 4, 5, 6, 7, 8, 10. New
  `features/billing/LipilaPayCard.jsx` (state machine idle → pending → success | failed | timed-out,
  modelled on BazaBooks `LipilaPayCard`), rendered by `UpgradePage.jsx` above the existing manual
  form, which stays unchanged. Resume from `GET /billing/lipila/latest`; hidden when `enabled: false`.
  Display the server's `amount`. Poll every 3 s for 150 s with setup and cleanup in **one**
  `useEffect` and no `didInit` ref. On success refresh `/me` via the existing auth store so banners
  update without reload. Exact copy strings from Step 8a.6–8.
- **Acceptance:** frontend `pnpm test` and `pnpm build` exit 0 (PWA build intact); a component test
  with mocked axios covers idle → pending → success, failed (`pin`), timeout after 150 s (fake
  timers), and `enabled: false` → card not rendered.

### U12 — Upgrade page: plan guards, role messaging, payment history
- **Brief:** Source plan Step 8a points 1 (non-admin/treasurer message, no `/latest` call), 2 (plan
  cards disabled by member count; > 40 → "Contact us to subscribe" WhatsApp link as on today's
  confirmation screen; no-expiry group → no Pay UI), 9 (`features/billing/PaymentHistory.jsx` from
  `GET /billing/lipila/history`).
- **Acceptance:** frontend `pnpm test` and `pnpm build` exit 0; tests cover member role (message, no
  pay card, `/latest` not called), 21 members → Starter disabled with the Step 8a.2 sentence,
  41 members → contact-us, history renders rows.

### U13 — Admin Billing tab payments list
- **Brief:** Source plan Step 8b (frontend half). Additive read-only "Payments" list in
  `AdminGroupDetail.jsx`'s `BillingTab`, labelled "Paid automatically (Lipila)", status and
  test/mismatch/late badges per `UI_SPEC.md`. Activate/Extend and Mark Unpaid untouched.
- **Acceptance:** frontend `pnpm test` and `pnpm build` exit 0; `git diff` on `AdminGroupDetail.jsx`
  shows no removed lines inside the activate/mark-unpaid handlers.

### U14 — Docs, runbook, version
- **Brief:** Source plan Step 10.1–10.4. Fill the source plan's Step 0 findings (from §Context
  above; 0a–0c "pending William") and Step 7 matrix (orchestrator supplies results). New CLAUDE.md
  section "Automated Subscription Collection (Lipila)" with exactly the points in 10.2, `LIPILA_*`
  in the env block, new files in Quick Reference, update "Last updated". Runbook for the weekly
  stuck-payment check in CHANGELOG or `docs/`. Minor version bump (3.18.2 → 3.19.0) + CHANGELOG entry.
- **Acceptance:** `grep -c "Automated Subscription Collection (Lipila)" CLAUDE.md` ≥ 1;
  `grep '"version": "3.19.0"' package.json`; no secrets in the diff.

## Gates
| Gate | After | Opus reads | Note |
|---|---|---|---|
| G1 | U1–U3 | `utils/subscription.js`, `adminBillingController.js` diff, `utils/lipilaClient.js` signature code | Hard-requirement checkpoint (source Step 3 ⏸): manual activate behaviour-identical. Plus source Step 1/2 ⏸ reports. |
| G2 | U4–U9 | `utils/subscriptionCollection.js`, initiate handler, webhook handler | Backend complete. Orchestrator runs the simulator against Atlas dev with local backend: matrix rows 1–13 and 15–16 (source Step 5/7 ⏸). Report to William, who can then do Step 6 (real sandbox K1) whenever convenient. |
| G3 | U10–U13 | `LipilaPayCard.jsx`, `UpgradePage.jsx` | Frontend complete; UI_SPEC re-read against the diff. Then Phase 3 (e2e states, reviewer, `/ship --preflight`). |

## E2E flows
Throwaway user against Atlas dev (check the local Clerk key mode first, per memory):
`cd mern_vb_backend && node scripts/createThrowawayTestUser.js --group "ZZZ_TEST Lipila" --template village_bank`,
sign in via `/sign-in` + OTP 424242. Local backend with `LIPILA_ENABLED=true` and the sandbox
base URL, simulated webhooks via U8 (no real initiate: Lipila is mocked by not calling it, i.e.
the e2e uses an attempt inserted by the simulator, resumed through `/latest`).
1. `/upgrade` as admin, kill switch off → today's page unchanged, no pay card.
2. Kill switch on → plan cards + pay card; pending attempt resumes into waiting state; simulator
   Successful → success state, banner updates without reload.
3. Failed attempt → PIN message + Try again; manual request form still works.
4. Group with 21 active members → Starter disabled with sentence.
5. Member role → "Ask your admin or treasurer", no pay card.
6. Renewal banner at 375 px and desktop for `paidUntil` = now + 5 days.
7. Super admin Billing tab → Payments list; Activate/Extend and Mark Unpaid still work (source Step 3d).
   Needs a super-admin session in dev: if unavailable headlessly, record as a William check.
Cleanup: `createThrowawayTestUser.js --delete`, then delete the dev-only simulated
`SubscriptionPayment` rows by `reference`.

**William's real-money checks (not run by Claude):** Step 6 (K1 sandbox happy path), matrix
row 18 (wrong PIN), row 19 (lost webhook: stop tunnel, approve, poll resolves).

## Log
- 2026-10-13 session start. Source plan read; codebase claims spot-checked (all match). Step 0d run
  read-only on production (results in §Context). Branch name deviates from the source plan's
  `feat/lipila-subscription-collection` to `/build`'s `build/<slug>` convention.
- 2026-10-13 plan approved by William. Step 0a done (production wallet "Chama360 Subscriptions"
  created). Branch name approved. **Pauses: stop only at points that move real money**; G1–G3 are
  reviewed and logged but don't wait for William. Build-session start time logged below.
- 2026-10-13 07:58 build session 1 start (U1)
- U1 done: all 3 cleanup scripts confirmed to use groupScopedModels() only. 153 tests pass.
- U2 done: BazaBooks client ported, no deviations from §3. 184 tests pass.
- U3 done: 194 tests pass. Accepted deviations: audit `before` gains `plan` (from source §4.3's exact code, additive); invalid customPaidUntil + missing group now 400 not 404 (NaN check moved before the transaction, as Step 3b specifies). Response body, error strings, markUnpaid unchanged.
- **G1 (after U1–U3):** Opus read the activate diff and `utils/subscription.js` line by line: same arithmetic as before, now inside a transaction; malformed groupId still a CastError → 500 as before (pre-existing). Lipila signature code matches the spike scheme. Step 3d (manual activate/extend/mark-unpaid/trial edit in the dev UI as super admin) is deferred to Phase 3 E2E flow 7. PASS.
- U4 done after one Opus-requested fix-up: group_missing now notifies William (was silent); post-commit notifications detached so a hung Telegram/Resend can't hang the webhook or poll. 213 tests pass. Note for U5–U8: Mongoose timestamps strip createdAt from $set — backdate test rows via Model.collection.updateOne.
- U5 done: 231 tests pass. Opus read the controller: post-commit attempt.save() writes only modified paths, so it can't clobber a concurrent webhook success.
- U6 done: 249 tests pass. /latest returns attempt:null without querying when the kill switch is off.
