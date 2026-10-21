---
paths:
  - "mern_vb_backend/scripts/createThrowawayTestUser.js"
  - "mern_vb_backend/scripts/cleanupOrphanedRecords.js"
  - "mern_vb_backend/scripts/deleteGroups.js"
  - "mern_vb_backend/scripts/utils/**"
---

# Dev test accounts and cleanup scripts

Moved verbatim from CLAUDE.md on 2026-10-21; loads only when Claude works with matching files. Full prior file: `docs/history/CLAUDE-2026-10-21.md`.

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
- **Atlas is the dev/staging database (since the 2026-09-09 cutover — see the DB
  section above), not production.** Every `--group` run still creates a real
  `Group`/`GroupMember`/`GroupSettings`/`BankBalance`/`SocialFundBalance`/
  `ContributionType` set of documents there, so **still clean up with `--delete` when
  done**, and prefix test group names with `ZZZ_TEST` so they're easy to spot if a
  cleanup is ever missed — but a missed cleanup no longer risks live customer data,
  only dev-database clutter.
- **`--delete` is known incomplete** — it removes the `Group` document but not
  everything attached to it, the same defect class `deleteGroups.js` had before it was
  fixed. This is where most of the 21 orphaned records found 2026-09-09 came from
  (`scripts/cleanupOrphanedRecords.js` cleans these up after the fact — see Known
  History & Gotchas #10). Worth fixing before Session 5 of
  `docs/plan_db_cutover_and_grace_migration.md`, which leans on throwaway groups for
  verification, or the orphans simply refill.
- `Clerk.setActive({ session })` from the browser console does **not** reliably work
  for this — a session minted via the Backend API isn't bound to the browser's own
  Clerk `client`, so `__client_uat` stays `0` and the app never sees it as signed in.
  Use the real `/sign-in` form + OTP path above instead.

## Gotcha

10. **Cleanup scripts rot as the schema grows.** `deleteGroups.js` enumerated 10 collections when 16 models carried a `groupId`; `createThrowawayTestUser.js --delete` still misses several. Phase 5's `Cycle` made it 17 — both `deleteGroups.js` and `cleanupOrphanedRecords.js` were updated to cover it when that branch merged on 2026-09-10, which is exactly the rot this entry warns about happening again within a month. Neither fails loudly — they just leave rows nothing can reach, because every normal query is group-scoped and an orphan belongs to no group. 21 such records accumulated across both databases before anyone noticed. **Fixed structurally 2026-09-10:** `scripts/utils/groupScopedModels.js` derives the list at run time by reading the models directory and keeping whatever declares a `groupId` path. `deleteGroups.js`, `cleanupOrphanedRecords.js` and `createThrowawayTestUser.js` all use it — do not reintroduce a hardcoded list in any script that sweeps group data.
