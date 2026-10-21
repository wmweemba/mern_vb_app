---
paths:
  - "mern_vb_backend/server.js"
  - "mern_vb_backend/scripts/**"
  - "mern_vb_backend/utils/assertReplicaSet.js"
  - "mern_vb_backend/config/**"
  - "**/docker-compose*.yml"
---

# Production database operations

Moved verbatim from CLAUDE.md on 2026-10-21; loads only when Claude works with matching files. Full prior file: `docs/history/CLAUDE-2026-10-21.md`.

- **Database:** MongoDB via Mongoose 8.x, hosted on a **self-hosted Coolify Mongo instance** on the Hetzner box (container `bw0k4sgwsw8kkkg4skkc8ksw`, db `mern_vb_app`) — cut over from MongoDB Atlas on 2026-09-09 (Session 1 of `docs/plan_db_cutover_and_grace_migration.md`). It is a dedicated instance, separate from NdalamaHub's Mongo on the same box (deliberately — sharing one instance means sharing one root credential across two apps' data; see the plan doc's Session 1 discussion). Private, `coolify` Docker network only — **not reachable directly from a local machine or script.** Full `mongodump`/`mongorestore` cutover verified via `auditBankBalance.js --all`: every group's numbers (including William's Group's known ~K18,177 drift) matched the pre-cutover baseline exactly, byte-for-byte in the script's own output. **Atlas is now the dev/staging database** (`mern-vb-cluster`, still the target of local `.env` `MONGODB_URI` — unchanged, no local config edit needed). Atlas still holds a full pre-cutover copy of every group (including live customer data) pending Session 2's cleanup (cycle-reset William's Group, soft-delete/remove Grace's copy) — until that happens, local runs and manual scripts against Atlas can still see real (if stale) customer data.

- **Running production audit/maintenance scripts post-cutover** — the database is no longer reachable from a local machine, so `node scripts/<script>.js` can't be run locally against production anymore. Use `docker exec` into the running backend container on the Coolify box instead:
  ```bash
  ssh -i ~/.ssh/hetzner_coolify root@78.47.128.95 "docker exec <backend-container-name> node scripts/auditBankBalance.js --all"
  ```
  Get the current backend container name with `docker ps --format '{{.Names}}' | grep '^jgk8cwgs4s0w844cw8ksw80s'` — Coolify renames it on every redeploy (new numeric suffix), so don't hardcode the old name. Confirmed working 2026-09-09 as part of the cutover verification.

## Gotchas

9. **Tenant scope must fail closed — an unscoped query returns EVERYTHING, not nothing.** Controllers query with `find({ ...req.groupScope, ... })`. If `req.groupScope` is undefined, spreading it yields `{}` and Mongoose drops undefined keys, so the query silently widens to every group in the database. `middleware/resolveGroup.js` did exactly this for a super admin with no `GroupMember` record — dormant for months, and it went live on 2026-09-09 the moment the super admin's own group was hard-deleted. The read leak was the mild half: `cycleController.resetForNewCycle`'s `deleteMany({ groupId, archived: { $ne: true } })` would have wiped every non-archived Loan, Saving and Fine in the database. **Never let scope-resolving middleware call `next()` without setting `req.groupScope`** — refuse the request instead. And treat a latent branch as live code: ask what data currently stops it executing, because deleting that data is a deploy.

10. **Cleanup scripts rot as the schema grows.** `deleteGroups.js` enumerated 10 collections when 16 models carried a `groupId`; `createThrowawayTestUser.js --delete` still misses several. Phase 5's `Cycle` made it 17 — both `deleteGroups.js` and `cleanupOrphanedRecords.js` were updated to cover it when that branch merged on 2026-09-10, which is exactly the rot this entry warns about happening again within a month. Neither fails loudly — they just leave rows nothing can reach, because every normal query is group-scoped and an orphan belongs to no group. 21 such records accumulated across both databases before anyone noticed. **Fixed structurally 2026-09-10:** `scripts/utils/groupScopedModels.js` derives the list at run time by reading the models directory and keeping whatever declares a `groupId` path. `deleteGroups.js`, `cleanupOrphanedRecords.js` and `createThrowawayTestUser.js` all use it — do not reintroduce a hardcoded list in any script that sweeps group data.

12. **Production MongoDB MUST be a replica set — the app cannot function on a standalone.** Seven controllers use `session.withTransaction()`: `paymentController`, `contributionController`, `loanController`, `fundController`, `cycleController`, `groupController`, `adminGroupsController`. On a standalone every one of them fails with *"Transaction numbers are only allowed on a replica set member or mongos"* — meaning no repayments, no contributions, no new loans, no cycle resets, and **no new group onboarding at all**. The 2026-09-09 Atlas→Coolify cutover moved production from Atlas (always a replica set) to a standalone and silently broke every write path; it went unnoticed for a day because the only live group was mid-migration and not transacting, and because all local testing runs against Atlas. Fixed 2026-09-10: the Coolify Mongo runs `mongod --replSet rs0 --bind_ip_all --keyFile /etc/mongo-keyfile` as a single-node set.
    - **A replica set with authentication requires a keyFile.** Adding `--replSet` alone crash-loops with `security.keyFile is required when authorization is enabled with replica sets`. The keyfile lives at `/data/coolify/databases/<id>/mongo-keyfile`, mode 400, owned by uid 999.
    - **`rs.initiate()` must advertise the container hostname, not `localhost`** — the API connects as `bw0k4sgwsw8kkkg4skkc8ksw:27017`, and a set advertising `localhost` is unreachable from the API container.
    - **Now configured natively in Coolify, so it survives a redeploy** (done 2026-09-10; the first manual fix was a compose edit, and the very next redeploy proved the hazard by regenerating that file and discarding it). Two Coolify settings on the MongoDB resource:
      - **Custom MongoDB Configuration** → written by Coolify to `/data/coolify/databases/<id>/mongod.conf`, mounted read-only at `/etc/mongo/mongod.conf`, and the command becomes `mongod --config /etc/mongo/mongod.conf`:
        ```yaml
        replication:
          replSetName: "rs0"
        security:
          authorization: enabled
          keyFile: /tmp/mongodb/replica.key
        ```
      - **Volume mount** `/data/coolify/mongo-keyfiles/chama360` → `/tmp/mongodb`. The keyfile lives in its own directory deliberately: Coolify mounts a *directory*, and mounting the compose directory would expose `docker-compose.yml` — which contains the Mongo root password — inside the container.
      - **Do not add `net: bindIp:`** to that config. Coolify supplies binding itself, and setting both makes mongod refuse to start.
    - **Known Coolify bugs to watch:** the custom config is sometimes silently ignored (coollabsio/coolify#5456, mongod starts as `mongod --auth --bind_ip_all`), and there is a permission-denied variant (#2862). Either drops you back to a standalone, which is what the startup check below exists to catch.
    - **`GET /api/health` is the canary.** `utils/assertReplicaSet.js` runs at boot, logs a banner naming every broken write path and fires a Telegram alert if the database is not a replica set. The endpoint returns 503 with `transactionsAvailable: false`. Check it after any Coolify database redeploy: `curl -s https://api.chama360.nxhub.online/api/health`.
    - **Verify transactions, not just the replica set**: connect with the app's own `MONGODB_URI` and run a `withTransaction` that commits and one that throws, confirming rollback.
