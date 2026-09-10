# Plan — permanent demo environment

**Written:** 2026-09-10
**Trigger:** a prospective client wants a demo. William needs to sign in from several
devices, walk different roles through different workflows, and let prospects click around
— without touching production, which now holds exactly one live paying customer's data.
**Related:** `ventures/saas/chama360/_overview.md` Next Steps items 3 and 6 in the second
brain already called for "a demo-account setup (3 Clerk accounts, seeded fictional group)"
and "a permanent demo environment, reusable rather than a one-off." This is that.

Independent of `docs/plan_db_cutover_and_grace_migration.md` — it touches no production
resource and can run in parallel with that plan's Session 4.

---

## READ FIRST

- **Demo runs on Coolify, against Atlas, on a separate Clerk instance.** Nothing here
  touches production Mongo, production Clerk, or the live app.
- **Do not build a second authentication path.** See section 3. Clerk is configured to
  give simple username/password sign-in; the app's auth code is not forked.
- Atlas is the dev/staging database (since the 2026-09-09 cutover). Demo shares it with
  dev groups. That is fine and intended.

---

## 1. Hosting — Coolify, not Vercel

**Decision: two new Coolify resources on the existing Hetzner box.**

Vercel was considered and rejected. The backend is a stateful Express app holding a Mongo
connection pool; on serverless, every cold start renews connections against Atlas, which
is a known source of pain. It would also still need a backend host somewhere, so the only
thing Vercel adds is a second platform to reason about. William already owns the box,
Traefik, and `nxhub.online` DNS.

**Watch the box, though.** It has hit disk-capacity problems twice (see
`infrastructure/coolify-redis-misconf-incident-and-monitoring-setup.md` in the second
brain, and the 2026-08-09 maintenance that cleared 6.5GB of Docker cache at 80% full).
Two more images and one more Node process is not much, but check headroom before adding
and keep an eye on it afterwards.

| Resource | Domain |
|---|---|
| Demo frontend (static Vite build) | `demo.chama360.nxhub.online` |
| Demo backend (Node) | `api-demo.chama360.nxhub.online` |

Both DNS records point at the Hetzner IP, same as the production pair.

---

## 2. No code changes required

**Verified 2026-09-10:** `server.js` uses `cors({ origin: true })`, which reflects any
origin, so a new frontend domain works with no change.

> Noted separately, not part of this plan: `origin: true` with credentials means any site
> can call the API with a signed-in user's session. That belongs in the next security pass
> (`systems/NS-002-security-audit.md`), not here.

### Environment variables

**Demo backend**

| Variable | Value |
|---|---|
| `MONGODB_URI` | Atlas (`mern-vb-cluster`) — the dev/staging database |
| `CLERK_SECRET_KEY` | the **demo** Clerk instance's secret key |
| `CLERK_PUBLISHABLE_KEY` | the demo instance's publishable key |
| `FRONTEND_URL` | `https://demo.chama360.nxhub.online` |

**Demo frontend**

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://api-demo.chama360.nxhub.online/api` |
| `VITE_CLERK_PUBLISHABLE_KEY` | the demo instance's publishable key |

`.env.example` in both packages (added Session 2b) is the reference for the full list.

**Never point the demo at production Mongo or production Clerk.** The whole value of this
environment is that a prospect clicking around cannot reach a customer's data.

### Deployment setting — pin it, do not auto-deploy

Deploy from `main`, but **turn auto-deploy off.** If demo tracks `main` automatically, then
merging Phases 2–5 ships them to demo unannounced — useful when you want it, and a broken
demo an hour before a client call when you don't. Redeploy demo deliberately, after
checking it still works.

---

## 3. Authentication — configure Clerk, do not fork the app

**A separate username/password path was considered and rejected.**

### Why not

- **It is a fork, not a flag.** Clerk appears at **16 `getAuth()` call sites across 20
  backend files and in 35 frontend files** (counted 2026-09-10). A parallel auth path
  touches all of it.
- **It is an auth bypass living in a production codebase.** A demo login route gated by an
  environment flag is one mis-set Coolify variable away from unauthenticated access to real
  member financial data. This is the same shape as `CLAUDE.md` gotcha #9 — a dormant branch
  that was harmless until the data changed, and then was one click from deleting a live
  group.
- **A demo that authenticates differently is not demoing the product.** A treasurer
  evaluating a financial app will ask how members sign in, and the answer has to match what
  they would actually get.

### What to do instead

**Create a separate Clerk application for the demo** — its own instance, its own keys,
configured independently of the one real members use. In its dashboard:

1. Enable **username + password** as the sign-in strategy. No magic link, no email code.
2. Disable email verification for demo accounts.
3. Relax or disable the new-device challenge if the setting allows — otherwise sign in on
   each device *before* the meeting, since sessions persist.

That produces exactly the simple sign-in the demo wants, with no application code changed
and no second auth path in the codebase.

A separate application also sidesteps the development-instance branding that can appear in
Clerk components — **verify what your instance actually renders on a real domain before
putting it in front of a prospect** rather than assuming either way.

---

## 4. Demo accounts and data

### Three permanent accounts, not churn

Create one account per role — **treasurer, loan officer, member** — with fixed, memorable
passwords that never rotate. Sign into each on the devices you will demo from, ahead of
time. There is then no account creation, deletion or password reset during a demo at all.

### Two small script additions

Most of what is needed already exists. `scripts/createThrowawayTestUser.js` creates a
pre-verified Clerk user with a generated password printed to stdout, seeds a full group
with settings and balances, and tears it down with `--delete`.

1. **Add `--set-password <clerkUserId> <password>`** — one Clerk Backend API call
   (`clerkClient.users.updateUser(id, { password })`). Closes the last gap.
2. **Fix `--delete`.** It removes the `Group` but not everything attached — the known
   incompleteness recorded in `CLAUDE.md` (Dev Test Accounts section) and the source of
   most of the 21 orphaned records cleaned up on 2026-09-09. Same defect class
   `deleteGroups.js` had; fix it the same way, and check the model list against
   `grep -l groupId mern_vb_backend/models/*.js`.

Note the script's existing safety check — it refuses to run unless `CLERK_SECRET_KEY`
starts with `sk_test_`. Confirm the demo instance's key satisfies that, or widen the check
deliberately rather than by accident.

### `scripts/seedDemoGroup.js` — new

A fictional group that looks like a real one mid-cycle, wipeable and re-seedable so every
demo starts from the same state after prospects have clicked things.

Content should include: a plausible member roster with real-looking Zambian names, several
months of monthly contributions, two or three loans at different stages (one fresh, one
part-repaid, one fully repaid), some interest paid, a contribution or two, and a
**positive** bank balance.

> Do **not** demo from `ZZZ_TEST Demo Grocery Group` or `Test group 1`, which are still
> sitting in Atlas carrying **negative** balances (K-2,900 and K-1,000). They reconcile
> correctly, so they are not broken — they just look wrong, and a treasurer will notice a
> negative pot immediately.

Choose the template deliberately. `grocery_chilimba` matches the live customer and the
current prospect pipeline; `village_bank` is the more general story. Seed whichever fits
the prospect, or seed one of each if the box has room.

---

## 5. Sessions

**Session A — stand it up (~2h).** DNS records, two Coolify resources, env vars, deploy,
confirm sign-in works end to end from one device. Auto-deploy off.

**Session B — Clerk and accounts (~1.5h).** Create the demo Clerk application, configure
username/password sign-in, create the three role accounts, sign in from every device that
will be used. Add `--set-password`; fix `--delete`.

**Session C — demo data (~2h).** Write `seedDemoGroup.js`, seed it, walk each role's
workflow end to end and confirm the numbers look sensible on screen.

A demo script — what to click, in what order, and which story each screen tells — is worth
writing but is sales work, not engineering, and belongs with the prospect prep.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Demo accidentally points at production Mongo or Clerk | Env vars set once and checked; `.env.example` documents the split |
| Coolify box runs out of disk | Check headroom before adding; the box has hit capacity twice before |
| Broken `main` breaks the demo mid-pitch | Auto-deploy off; redeploy deliberately and verify |
| Clerk dev branding visible to a prospect | Separate Clerk application; verify rendering on the real domain first |
| Prospect leaves the demo data in a mess | `seedDemoGroup.js` wipes and re-seeds |
| Demo drifts from the product over time | Deploy from `main`, never a long-lived demo branch |

---

## 7. Explicitly out of scope

- **A second authentication path.** Section 3.
- **Anonymous or no-login demo mode.** Same objection — it is a bypass in a codebase that
  handles real money.
- **Demo data in production.** The point of this environment is that it is not there.
