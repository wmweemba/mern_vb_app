---
paths:
  - "mern_vb_backend/middleware/**"
  - "mern_vb_backend/controllers/authController.js"
  - "mern_vb_backend/routes/auth*.js"
  - "mern-vb-frontend/src/App.jsx"
  - "mern-vb-frontend/src/main.jsx"
---

# Auth, roles and tenant scope

Moved verbatim from CLAUDE.md on 2026-10-21; loads only when Claude works with matching files. Full prior file: `docs/history/CLAUDE-2026-10-21.md`.

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

## Gotchas

9. **Tenant scope must fail closed — an unscoped query returns EVERYTHING, not nothing.** Controllers query with `find({ ...req.groupScope, ... })`. If `req.groupScope` is undefined, spreading it yields `{}` and Mongoose drops undefined keys, so the query silently widens to every group in the database. `middleware/resolveGroup.js` did exactly this for a super admin with no `GroupMember` record — dormant for months, and it went live on 2026-09-09 the moment the super admin's own group was hard-deleted. The read leak was the mild half: `cycleController.resetForNewCycle`'s `deleteMany({ groupId, archived: { $ne: true } })` would have wiped every non-archived Loan, Saving and Fine in the database. **Never let scope-resolving middleware call `next()` without setting `req.groupScope`** — refuse the request instead. And treat a latent branch as live code: ask what data currently stops it executing, because deleting that data is a deploy.

11. **A `GroupMember.clerkUserId` can point at a Clerk user that no longer exists, and nothing detects it.** Found 2026-09-10: William's Group's own admin record referenced a Clerk ID that returned 404 from `GET https://api.clerk.com/v1/users/<id>` — dead, likely left over from before the Development/Production Clerk split. `resolveGroup.js` only checks "does *some* `GroupMember` match this `clerkUserId`," so the symptom isn't an error — it's either a clean `403 NO_GROUP` (if the live Clerk ID matches nothing) or, worse, silently landing in the *wrong* group (if the live Clerk ID happens to already be linked elsewhere, e.g. a throwaway test membership). No amount of signing out, incognito, or switching auth methods fixes this — the fix is data, not session state. **Diagnose by asking Clerk directly, not by guessing:** `GET /v1/users?email_address=<email>` to find the live ID, `GET /v1/users/<id>` on the ID stored in Mongo to confirm it's actually dead, then repoint the `GroupMember.clerkUserId` to the live one. If that live ID is already active elsewhere, deactivate the conflicting membership too (`active: false`) — `resolveGroup`'s `findOne` isn't deterministic across two active matches.
