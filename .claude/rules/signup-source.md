---
paths:
  - "**/*{ignupRef,otifyNewGroup,ttribution}*"
  - "mern-vb-frontend/src/main.jsx"
---

# Signup source tracking

Moved verbatim from CLAUDE.md on 2026-10-21; loads only when Claude works with matching files. Full prior file: `docs/history/CLAUDE-2026-10-21.md`.

## Signup Source Tracking — Architecture Notes

Added 2026-10-18 (`docs/plan_signup_source_tracking.md`; sister plan BazaBooks PLAN-17 uses the same `?ref=` contract). Key decisions recorded here to prevent regression:

1. **`Group.signupRef` (String, default null) is written once, in `groupController.createGroup`, and never updated by any other endpoint.** `adminGroupsController.createGroup` stores `'admin'`. No ref displays as `direct`; existing groups were not backfilled.

2. **The ref rule `^[a-z0-9][a-z0-9-]{0,39}$` (after trim + lower-case) lives twice, deliberately:** `mern_vb_backend/utils/signupRef.js` and `mern-vb-frontend/src/lib/signupRef.js`. The server re-validates and never trusts the client value. Change both together.

3. **Capture runs at module top level in `src/main.jsx`, before `createRoot`.** It cannot move into a component: `/` and `*` both `<Navigate>` away, dropping the query string before any route component would see it. Stored in `localStorage` key `c360_signup_ref` as `{ref, at}`, first touch wins for 30 days, every access in try/catch. Onboarding sends it in the `POST /groups` body and clears it on success.

4. **`utils/notifyNewGroup.js` sends the new-group Telegram alert.** It is called after `res.status(201).json(...)`, outside the transaction, without `await`, and never throws — an alert failure must never block or fail group creation. No phone or email in the message.

5. **`adminGroupsController.listGroups` builds its response field by field, so any new `Group` field the admin list needs must be added to that map explicitly** (this nearly shipped with Source always showing `direct`).

---

*Last updated: 2026-10-18 — Signup Source Tracking added*
*Next review: April 7 (Week 1 checkpoint)*
