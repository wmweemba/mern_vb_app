# Plan — Signup Source Tracking (`?ref=`) for Chama360

**Status:** READY TO BUILD (written 2026-10-16, Opus) · **Build session:** Sonnet, separate session
**Deadline:** live in production before **Mon 2026-10-26** (Campaign 2 launch)
**Depends on:** nothing unbuilt · **Sister plan:** `payrush_saas_app/docs/plans/PLAN-17-signup-source-tracking.md` (BazaBooks, same `?ref=` contract)

> **How to use this document.** Work through the steps in order. Every ⏸ is a hard stop:
> report to William and wait before starting the next step. Where this plan gives exact
> code, use it as written. Where it gives a rule, don't improvise around it. If something
> in the codebase contradicts this plan, stop and report it. Don't "fix" either one
> silently. Read `CLAUDE.md` and `UI_SPEC.md` first.

---

## 1. Why this exists

Campaign 2 (26 Oct–20 Dec 2026) markets Chama360 to treasurers, chairpersons and group
admins on Facebook, TikTok, Instagram, WhatsApp, and through **referral partners**
(existing users and contacts who push the app to other groups: Katongo, Kayula, Simon,
Maluba). William is also considering paying partners K50–K100 per referred group that
signs up and pays. That only works if the app can say which link a group came through.

Today it can't: a group appears in the super-admin list with a created date and nothing
else, and **no alert fires when a new group is created**, so a self-serve signup can go
unnoticed for days.

**What "done" looks like:**
1. A link like `https://chama360.nxhub.online/?ref=p-maluba` is remembered through
   Clerk sign-up and onboarding, and stored on the `Group` the user creates.
2. William gets a Telegram alert the moment any group is created, naming the source.
3. The super-admin groups list and group detail show the source.

## 2. Decisions (don't re-litigate)

| # | Decision |
|---|---|
| D1 | **Format.** A ref is `^[a-z0-9][a-z0-9-]{0,39}$` after lower-casing and trimming. Anything else is ignored (treated as no ref), never stored, never echoed. Same rule as BazaBooks PLAN-17. |
| D2 | **First touch, 30 days.** The first valid ref a browser sees is kept for 30 days; a later ref doesn't overwrite it while fresh. |
| D3 | **Client storage = `localStorage` key `c360_signup_ref`**, value `{"ref":"fb","at":"<ISO>"}`. All access in try/catch; failure means "no ref", never an error. |
| D4 | **Captured at app boot**, in `main.jsx`, **before** React Router renders. `/` and `*` both `<Navigate>` away (to `/dashboard`, then Clerk's `/sign-in`) and drop the query string, so a component-level capture would miss it. |
| D5 | **Stored on `Group.signupRef`** (String, default `null`), set once in `createGroup`. Never updated by any other endpoint. |
| D6 | **Server re-validates** with the same D1 rule; invalid → `null`. |
| D7 | **Super-admin-created groups** (`adminGroupsController.createGroup`) store `signupRef: 'admin'`. |
| D8 | **Referral-partner refs use `p-<firstname>`** (e.g. `p-maluba`). First names only, no phone numbers or emails (D1 also forbids `@` and `+`). |
| D9 | **No ref = `direct`** in every display. Existing groups are not backfilled. |
| D10 | **The new-group Telegram alert never blocks or fails group creation.** Fired after `withTransaction` resolves and after `res.json`, fire-and-forget, never inside the transaction (it can retry; CLAUDE.md Reversal note #5). |
| D11 | **Out of scope:** the referral reward itself (payouts, a partner dashboard). This plan only records the source; payouts are worked out by hand from the admin list until the programme is decided. |

## 3. Codebase facts this plan relies on (verified 2026-10-16, v3.19.0)

- Monorepo. Backend `mern_vb_backend/`: Express 5 + Mongoose 8, **CommonJS**, Jest + Supertest (`pnpm test` in that folder). Transactional tests use `MongoMemoryReplSet`; `tests/contributionController.test.js` has the harness and a `createGroup` test ("Group seeding", test 10) with `@clerk/express` mocked. Copy that pattern.
- Frontend `mern-vb-frontend/`: React 19 + Vite 7 + Tailwind 4, **ES modules**, React Router 7, Clerk (`@clerk/clerk-react`). Entry `src/main.jsx` (renders `ClerkProvider` → `BrowserRouter` → `AuthProvider` → `App`).
- `src/App.jsx` routes: `/sign-in/*`, `/sign-up/*`, `/invite`, `/welcome`, `/onboarding` (`OnboardingRoute`, signed-in), `/` → `<Navigate to="/dashboard" replace />`, `*` → `/dashboard`.
- `src/pages/Onboarding.jsx` posts `axios.post(\`${API_BASE_URL}/groups\`, { groupName, treasurerName, phone, ..., templateKey })` at ~line 131, then `refreshMembership()`.
- `controllers/groupController.js` `exports.createGroup` destructures `req.body`, runs everything in `session.withTransaction`, creates the `Group` with `Group.create([{ name, slug, clerkAdminId, trialExpiresAt, isPaid: false }], { session })`, and ends with `res.status(201).json(result)`.
- `controllers/adminGroupsController.js` has its own `createGroup` (~line 88) creating a `Group` the same way, and `listGroups` (~line 11) returning `Group.find(filter).sort({ createdAt: -1 }).lean()` (all fields).
- `models/Group.js` — plain schema with `timestamps: true`; no `signupRef`.
- Telegram today is sent inline with `fetch('https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage', ...)`, `parse_mode: 'HTML'`, guarded by `TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID`, with an `escapeHtml` helper (`utils/notifyBilling.js`). Reuse that exact shape.
- `src/pages/admin/AdminGroupsList.jsx` renders a table (Group · Members · Status · Expires · Created · Actions) and a mobile card list (~line 215). `src/pages/admin/AdminGroupDetail.jsx` shows one group.
- The demo environment (`demo.chama360.nxhub.online`) deploys from the same code. Harmless; demo groups are seeded, not created through onboarding.

---

## Step 0 — Branch ⏸

`git checkout -b feat/signup-source-tracking` from up-to-date `main`. Run backend `pnpm test`
and frontend `pnpm build` on the untouched branch as the baseline. Report and wait.

## Step 1 — Ref rule, backend · model: haiku · risk: low

Create `mern_vb_backend/utils/signupRef.js`:

```js
// Signup source tracking. Same rule as the frontend capture and as
// BazaBooks PLAN-17. The server never trusts the client's value.
const REF_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

function normaliseRef(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return REF_RE.test(v) ? v : null;
}

module.exports = { normaliseRef };
```

Add `tests/signupRef.test.js` covering: `' FB '`→`'fb'`, `'p-maluba'`→`'p-maluba'`, `'-bad'`, `'has space'`, `'<script>'`, 41 chars, `'+260977'`, `undefined` → `null`.

**Acceptance:** `pnpm test -- signupRef` exits 0.

## Step 2 — Model and `createGroup` · model: sonnet · risk: high (tenancy-adjacent write path)

1. `models/Group.js`: add `signupRef: { type: String, default: null },`.
2. `controllers/groupController.js` `createGroup`:
   - Add `signupRef` to the `req.body` destructure.
   - Before the transaction: `const ref = normaliseRef(signupRef);`
   - In `Group.create([{ ... }])` add `signupRef: ref`.
   - **After** `res.status(201).json(result)` (still inside the `try`, after the transaction has resolved): fire `notifyNewGroup({ groupName, treasurerName, templateKey: template ? template.key : 'village_bank', ref })` **without `await`**, with `.catch(err => console.error('[createGroup] notifyNewGroup failed:', err))`.
3. `controllers/adminGroupsController.js` `createGroup`: add `signupRef: 'admin'` to its `Group.create` (D7). No alert for admin-created groups.
4. Create `utils/notifyNewGroup.js` (CommonJS), modelled on `utils/notifyBilling.js`:
   - Local `escapeHtml` (same three replacements).
   - `async function notifyNewGroup({ groupName, treasurerName, templateKey, ref })`: if `TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID`, POST to Telegram with HTML text:
     ```
     🆕 <b>New Chama360 group</b>

     <b>Group:</b> {escaped groupName}
     <b>Created by:</b> {escaped treasurerName}
     <b>Template:</b> {escaped templateKey}
     <b>Source:</b> {escaped ref || 'direct'}
     <b>Trial ends:</b> {date 15 days from now, YYYY-MM-DD}
     ```
     Use `AbortSignal.timeout(8000)` on the fetch. Catch everything; `console.error` only; **never throw**. No phone number or email in the message.
   - `module.exports = { notifyNewGroup };`
5. Tests, in a new `tests/groupSignupRef.test.js` (copy the harness and the `@clerk/express` mock from `contributionController.test.js` "Group seeding"; mock `../utils/notifyNewGroup` with `jest.fn().mockResolvedValue()`):
   - POST `/api/groups` with `signupRef: 'P-Maluba'` → 201, saved `Group.signupRef === 'p-maluba'`, `notifyNewGroup` called once with `ref: 'p-maluba'`.
   - With `signupRef: '<script>'` → 201, `signupRef === null`, alert called with `ref: null`.
   - With no `signupRef` → 201, `null`.
   - `notifyNewGroup` mocked to reject → still 201 and the group exists (D10).

**Acceptance:** backend `pnpm test` (whole suite) exits 0. **Opus diff read required before commit.**

## Step 3 — Capture in the browser · model: sonnet · risk: low

1. Create `mern-vb-frontend/src/lib/signupRef.js` (ES module, no React):
   ```js
   // Signup source tracking. Captured once at boot (main.jsx), before the router
   // redirects drop the query string, and read at group creation (Onboarding).
   const KEY = 'c360_signup_ref';
   const TTL_MS = 30 * 24 * 60 * 60 * 1000;
   const REF_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

   export function normaliseRef(value) {
     if (typeof value !== 'string') return null;
     const v = value.trim().toLowerCase();
     return REF_RE.test(v) ? v : null;
   }

   function readStored() {
     try {
       const raw = localStorage.getItem(KEY);
       if (!raw) return null;
       const { ref, at } = JSON.parse(raw);
       const t = Date.parse(at);
       if (!normaliseRef(ref) || Number.isNaN(t) || Date.now() - t >= TTL_MS) return null;
       return ref;
     } catch {
       return null;
     }
   }

   export function captureRefFromUrl(search) {
     try {
       const ref = normaliseRef(new URLSearchParams(search).get('ref'));
       if (!ref || readStored()) return;
       localStorage.setItem(KEY, JSON.stringify({ ref, at: new Date().toISOString() }));
     } catch {
       /* storage unavailable: no ref */
     }
   }

   export function getStoredRef() {
     return readStored();
   }

   export function clearStoredRef() {
     try { localStorage.removeItem(KEY); } catch { /* ignore */ }
   }
   ```
2. `src/main.jsx`: import `captureRefFromUrl` and call `captureRefFromUrl(window.location.search);` at **module top level**, before `createRoot(...)` (D4).
3. `src/pages/Onboarding.jsx`: add `signupRef: getStoredRef() || undefined` to the `axios.post(\`${API_BASE_URL}/groups\`, {...})` body. After the post succeeds (before `refreshMembership()`), call `clearStoredRef()`. No UI change.
4. If `src/lib/signupRef.js` can be covered by the frontend's existing Jest setup without new config, add `src/lib/signupRef.test.js` mirroring the backend cases plus a fresh/stale storage case. If it needs new config or dependencies, **skip it and say so** (no new deps in this build).

**Acceptance:** frontend `pnpm build` exits 0 (and `pnpm test` if step 3.4 was added).

## Step 4 — Super-admin visibility · model: sonnet · risk: low

1. `AdminGroupsList.jsx`: add a **Source** column after *Created* in the desktop table showing `g.signupRef || 'direct'`, and the same value as a small secondary line on the mobile card. Use existing text tokens (`text-text-secondary`, same `text-xs` style as neighbours). No new component.
2. `AdminGroupDetail.jsx`: one line in the group's summary block: `Source: {group.signupRef || 'direct'}`.
3. `listGroups` and the detail route already return all `Group` fields (`.lean()`), so no backend change. **Confirm** that by reading the controller; if a projection excludes it, add the field.

Follow `UI_SPEC.md`. Use `components/ui/Select.jsx` for any dropdown (none expected).

**Acceptance:** frontend `pnpm build` exits 0.

## Step 5 — Local verification ⏸

Run backend + frontend locally against **Atlas (dev/staging)**, never production. Use a
throwaway Clerk test user (see `scripts/createThrowawayTestUser.js` pattern); never a real
member's account.

| # | Do | Expect |
|---|---|---|
| 1 | Fresh browser profile: open `http://localhost:<port>/?ref=p-test` | Redirects as usual; `localStorage.c360_signup_ref` holds `p-test` |
| 2 | Sign up the throwaway user, complete onboarding | New `Group.signupRef === 'p-test'`; Telegram alert (if dev Telegram vars set; else log shows the attempt) with `Source: p-test`; `c360_signup_ref` removed |
| 3 | Fresh profile: `/?ref=%3Cscript%3E`, onboard a second throwaway user | `signupRef: null`, alert says `direct` |
| 4 | Super-admin view `/admin/groups` and the detail page | Source column shows `p-test`, `direct` |

Afterwards soft-delete the throwaway groups through the super-admin Danger Zone (same
fields the UI uses). Report the table to William and **wait.**

## Step 6 — Production ⏸ (William's go-ahead each)

No migration is needed: Mongoose adds `signupRef` on new documents, and existing groups
read as `null` → `direct`.

1. ⏸ Confirm `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set on the **production backend** in Coolify (they already are for billing alerts; just confirm).
2. ⏸ Merge to `main`, push (William's explicit yes), deploy via Coolify. Remember the demo resources have **auto-deploy off**; leave them unless William asks.
3. Smoke: William opens `https://chama360.nxhub.online/?ref=smoke-test` in a private window and confirms `localStorage.c360_signup_ref` is set. **Do not create a production group.** The first real campaign or referral signup is the live test.
4. `CHANGELOG.md`: new minor version entry (3.20.0, Feature: signup source tracking + new-group alert). Bump root `package.json` version to match. Add a short "Signup source tracking" note to `CLAUDE.md` naming `Group.signupRef`, `utils/signupRef.js`, `src/lib/signupRef.js`, the boot-time capture and why (D4).

## Follow-ups (not in this plan)

- Referral programme mechanics (D11): eligibility (signed up **and paid**), amount (K50 or K100), payout method, and a partner view. William is still deciding; tracked in the second brain at `ventures/saas/chama360/referral-partners.md`.
- Demo requests arrive by WhatsApp, not through the app. Their source is tracked with pre-filled `wa.me` messages per channel (campaign plan), not by this code.
