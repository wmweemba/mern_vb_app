# Plan — Automated Subscription Collection via Lipila (mobile money)

**Status:** written 2026-10-13, not started · **Written by:** Opus, from the second brain's
Lipila research and BazaBooks PLAN-15 (live since 2026-09-30) · **Executes in:** a separate
session, step by step · **Risk:** high. It touches money and the group subscription gate.
Auto Deploy is ON, so a push to `main` goes straight to production.

> **How to use this document.** Work through the steps in order. Every ⏸ is a hard stop:
> report to William and wait for him before the next step. Where this plan gives exact code,
> use it as written. Where it gives a rule, don't improvise around it. If the codebase
> contradicts this plan, **stop and report it**. Don't silently "fix" either one. Steps
> marked **[WILLIAM]** are manual actions only William can take: dashboards, Coolify, his
> phone, real money.

---

## 0. Sources (read before Step 1)

| Source | Why |
| --- | --- |
| `~/Dev_Projects/payrush_saas_app/docs/plans/PLAN-15-automated-subscription-collection.md` | The proven reference implementation (Next.js + Postgres). This plan ports it to Express 5 + Mongoose. Read its §2, §4, Step 8 results, "Post-review fixes" and Appendix. Every one of those items was a real defect caught before or after launch. |
| `~/Dev_Projects/payrush_saas_app/client/src/lib/lipila/client.js` | Working Lipila client: `initiateCollection`, `checkCollectionStatus`, `verifyWebhookSignature`, `mapLipilaStatus`, `classifyFailureReason`. **Port it rather than rewrite it** (ESM → CommonJS). |
| `~/Dev_Projects/payrush_saas_app/client/src/lib/billing/msisdn.js` | `normalizeZambianMsisdn`, `maskMsisdn`. Port verbatim. |
| `~/Dev_Projects/payrush_saas_app/client/src/lib/billing/subscriptionCollection.js` | `resolveAttempt` / `reconcileAttempt`. Port the logic; the Postgres locking becomes Mongo transactions (§4.4). |
| `~/Dev_Projects/payrush_saas_app/client/src/components/billing/UpgradePage.js` (`LipilaPayCard`) | UI state machine: idle → pending → success / failed / timed-out with "Try again". |
| `~/Dev_Projects/lipila-sandbox-spike/` (`src/webhookVerify.js`, `logs/events*.jsonl`) | Ground truth when anything above is unclear. **Logs beat Lipila's docs** (pattern P-026). |
| `wsm-second-brain/intelligence/market-research/payment-gateways/03-lipila-sandbox-spike.md` | "API facts for implementers" section. |
| `wsm-second-brain/systems/NS-003-security-first-build.md` | Read before Step 4 (payments + user data). |
| This repo's `CLAUDE.md` | Gotchas #9 (fail-closed scope), #10 (cleanup scripts), #12 (replica set), Reversal note #5 (`res.json` after commit), UI Spec Compliance. |

**Do not** use Lipila's public docs as a source for any API detail. Use the BazaBooks code
and the spike logs.

---

## 1. What this builds

Chama360 subscriptions are activated by hand today (NS-001). A group admin taps Subscribe on
`/upgrade`, `POST /api/billing/request` sends William a Telegram and an email (it **stores
nothing**), the group pays by MoMo or bank outside the app, and William activates the group
from the Platform Admin **Billing** tab (`POST /api/admin/groups/:groupId/billing/activate`
→ `isPaid`, `paidUntil`, `plan`, `trialExpiresAt = 2099-12-31`).

This plan adds a **second, automated trigger into the same `Group` fields.** On `/upgrade`,
an admin or treasurer picks a plan, enters a mobile money number, gets a PIN prompt, approves
it, and the group is activated within seconds. The money lands in Nexus's own Lipila wallet.
This is "Track 1" (Nexus collecting its own revenue): no custody question, no disbursement.

### Hard requirement (William, 2026-10-13)

**Super-admin manual control stays fully intact.** Activate/extend, mark-unpaid, and the
trial-expiry edit (via `PATCH /api/admin/groups/:groupId`) must keep working exactly as
today. The manual "Request + pay by MoMo/bank" path on `/upgrade` also stays visible as the
fallback for a Lipila failure. The only permitted changes to manual code are the Step 3
refactor (behaviour-identical, plus a transaction) and the additive read-only payments list
in Step 8. Nothing automated may ever cancel, reverse, or overwrite a manual action.

---

## 2. Decisions (made with William 2026-10-13; don't re-litigate)

| # | Decision |
| --- | --- |
| D1 | **Nexus absorbs Lipila's 2.5% fee.** The group pays list price: Starter K200, Standard K300 (`config/plans.js`). K195 / K292.50 lands. |
| D2 | **Only `admin` and `treasurer` can pay.** Other roles see plan status and "Ask your admin or treasurer to renew", with no Pay button. Enforced server-side, not just hidden. |
| D3 | **Monthly only.** One payment adds one month. Prepaying = paying again, which extends from the current expiry. |
| D4 | **Mobile money only.** Card (BazaBooks PLAN-16) is unproven and out of scope. |
| D5 | **The App Subscription fund (`GroupFund` key `app_subscription`) is never touched.** Lipila takes money from a phone, not from the pot. If the treasurer reimburses that phone from the pot, they record a FundExpense by hand as today. |
| D6 | **Plan switching is allowed.** Paying for the other plan flips `Group.plan` immediately and extends `paidUntil` by one month from `max(now, paidUntil)`. No proration. Same as admin activate. |
| D7 | **In-app renewal banner** (Step 9), shown to admin/treasurer when `paidUntil` is within 7 days, or lapsed. **Plus an email reminder 7 days before expiry** (Step 12, added by William 2026-10-13), built on the existing Resend setup and run once a day by a Coolify Scheduled Task. It ships as its own deploy after Lipila is live. |
| D8 | **Production smoke test on a throwaway `ZZZ_TEST` group**, K200 Starter from William's phone. The group is soft-deleted afterwards. Its payment records are kept because the money was real. |
| D9 | **New dedicated production wallet "Chama360 Subscriptions"**, with Collection + Settlements on and everything else off. Not shared with BazaBooks. |
| D10 | **Plan-too-small guard:** before any PIN prompt, refuse a plan whose `memberLimit` is below the group's current active member count (`409 PLAN_TOO_SMALL`). Groups over 40 members (larger than every plan) see "Contact us to subscribe" instead of Pay, and William handles them manually. |
| D11 | **Visibility of a successful payment:** (a) super admin group **Billing** tab lists every attempt; (b) the group's admin/treasurer see a **Payment history** list on `/upgrade`, and the payer gets a **receipt email**; (c) William gets **Telegram + email** on every success, with warnings. |
| D12 | **Dev testing uses sandbox wallet 4154** (the spike/BazaBooks dev wallet). Its webhook URL is repointed at the Chama360 dev tunnel during testing. |

### Design rules carried over from PLAN-15 (each was a real defect there)

1. **The webhook is the source of truth; polling is the fallback.** One idempotent
   `resolveAttempt()` is called by both. No cron.
2. **Plan, price and period are locked on the attempt at initiation**, never re-derived at
   webhook time. Price always comes from `config/plans.js` server-side. The client's
   `planPrice` is ignored.
3. **Money that arrived always activates.** A `Successful` result activates even if the
   attempt was already `failed` (late success) and even on an amount mismatch (flagged, not
   withheld). Only `success` is terminal.
4. **Ambiguous initiation errors (timeout, network, unparseable 5xx) leave the attempt
   `pending`, not `failed`.** A PIN prompt may already be on the phone. Only a definitive
   rejection (`errors.generalErrors`, any 4xx, 429) is `failed`.
5. **Automation never edits a manual action.** If William already activated the group by
   hand, a Lipila success still extends by another month (it's real money) and the admin
   notice warns "possible double payment".
6. **Kill switch `LIPILA_ENABLED=true`**, otherwise the feature is invisible and initiate
   returns `503`. Production ships dark.
7. **Dev test amount `LIPILA_TEST_AMOUNT`** applies **only when both** `NODE_ENV !==
   'production'` **and** `LIPILA_BASE_URL` contains `lipila.dev` (sandbox). That's a double
   guard so a misconfigured production container can never charge K1 for a month.
8. **Abuse throttle:** at most 5 initiations per group per hour and 3 per MSISDN per hour
   (`429`).
9. **Claude never initiates real money movement.** Every real PIN prompt is fired by
   William, by tapping Pay in the browser. Claude reads back the DB, logs and webhook results.
   Locally signed **simulated** webhooks against the dev database are fine.
10. **Never log, print or commit a key, secret or full MSISDN.** Mask MSISDNs as `•••123`
    everywhere outside the attempt document itself.

---

## 3. Lipila ground truth (from the spike logs and BazaBooks production)

| Fact | Value |
| --- | --- |
| Hosts | Sandbox `https://api.lipila.dev` (dashboard `dashboard.lipila.dev`); production `https://blz.lipila.io` (dashboard `dashboard.lipila.io`). Separate keys and secrets. |
| Auth | Header **`x-api-key: <Lsk… wallet key>`** |
| Callback | Request **header** `callbackUrl` **and** the wallet's webhook URL (Wallet → Security). Set both to the same URL. BazaBooks' production smoke test confirmed delivery. |
| Collect | `POST /api/v1/collections/mobile-money`, body `{ referenceId, amount (number), narration, accountNumber: "2609XXXXXXXX", currency: "ZMW", email? }`. The operator is inferred from the number. |
| Accepted | HTTP 200, `{ status: "Pending", identifier: "LPLXC-…", paymentType, … }` |
| Rejected | HTTP **500** for business errors: `{ errors: { generalErrors: ["…"] } }`. No callback follows. |
| Status check | `GET /api/v1/collections/check-status?referenceId=…` returns the same shape as the webhook payload. An unknown reference gives HTTP 404 with a **non-JSON** body, so treat it as `unknown`. |
| Statuses | Capitalised: `Pending` / `Successful` / `Failed`. Map via `mapLipilaStatus`, and never compare lowercase. |
| Webhook | Standard Webhooks headers `webhook-id`, `webhook-timestamp`, `webhook-signature` (`v1,<b64>`, possibly several space-separated). HMAC-SHA256 over `` `${id}.${timestamp}.${rawBody}` `` with the base64-decoded secret (strip `whsec_`), reject anything older than 300 s, constant-time compare. |
| Payload | `{ referenceId, currency, amount, accountNumber, status, paymentType, type: "Collection"\|"Disbursement", identifier, externalId (MNO ref, "" on failure), message, … }` |
| Failure messages seen | `"Incorrect pin has been entered."`, `"User did not enter their pin."`, `"PIN verification failed"`, `"PIN verification could not be completed due to a timeout."`, `"Failed"`. Classify **timeout before pin**. |
| Latency | Webhook arrives ~12–40 s after initiation (16 s in BazaBooks production). |
| Dismissed PIN prompt | Stays `Pending` for **~1 hour** before `Failed`. Hence the 10-min resume window and 90 s re-initiate window below. |
| Sandbox | **No fake numbers.** Every sandbox collection takes real money from a real phone. Use K1. |
| IP whitelist | Per wallet. Whitelist the Hetzner box's static egress IP `78.47.128.95/32` (the same box BazaBooks uses). |

---

## 4. What exists, and the design

### 4.1 Existing code this plugs into (verified 2026-10-13)

- `models/Group.js`: `isPaid`, `paidUntil`, `plan` (enum `starter|standard`),
  `trialExpiresAt`, `deletedAt`, `suspendedAt`.
- `config/plans.js`: `{ starter: { name, price: 200, currency, memberLimit: 20 }, standard: { …300, 40 } }`.
- `controllers/adminBillingController.js`: `activate` (extends from `max(now, paidUntil)`,
  sets `plan`, `isPaid`, `trialExpiresAt = 2099-12-31`, `logAdminAction`) and `markUnpaid`.
  **Not in a transaction today.**
- `middleware/checkTrial.js`: a lapsed `isPaid` group falls through to trial/read-only. **The
  new billing routes must NOT be behind `checkTrial`**, because an expired group has to be
  able to pay.
- `middleware/resolveGroup.js`: fail-closed group resolution, sets `req.groupId`/`req.role`.
  Use it on every new group-facing route. The old `billingController` does its own
  `GroupMember.findOne` and has no role check. Don't copy that.
- `middleware/auth.js`: `requireRole` takes a **single role or an array**, and is **not
  variadic** (Phase 3 note #7). Use `requireRole(['admin', 'treasurer'])`.
- `utils/planLimits.js`: `getMemberLimitStatus(group)`. It counts active, non-deleted members.
- `server.js`: `/api/webhooks` is mounted **before** `express.json()`. `routes/webhookRoutes.js`
  uses `express.raw` per route (Clerk/svix). The Lipila route goes in the same router.
- `controllers/authController.js` (`/me`): returns `isPaid`, `trialActive`, `trialExpiresAt`,
  `plan` (**name**, not key), `memberCount`, `memberLimit`. It does **not** return
  `paidUntil` or the plan key. Step 9 adds both.
- `components/TrialBanner.jsx`: always says "Your 15-day free trial has ended", even for a
  lapsed paid group. Step 9 fixes the wording.
- `scripts/utils/groupScopedModels.js`: any model with a `groupId` path is swept by
  `deleteGroups.js`, `cleanupOrphanedRecords.js` and `createThrowawayTestUser.js --delete`.
  **A payment record must never be destroyed** (BazaBooks kept its smoke-test account for
  exactly this reason). Step 1 adds an opt-out.
- Notifications: `billingController.requestUpgrade` and `supportController` call Telegram and
  Resend inline. There's no shared helper.
- Tests: Jest; `contributionController.test.js` / `paymentController.test.js` show the
  in-memory replica-set harness used for transaction tests. Follow that.

### 4.2 New model: `models/SubscriptionPayment.js` (collection `subscriptionpayments`)

```js
{
  groupId:            { type: ObjectId, ref: 'Group', required: true, index: true },
  initiatedByMemberId:{ type: ObjectId, ref: 'GroupMember', required: true },
  initiatedByName:    String,              // denormalized, same pattern as Fine.username
  payerEmail:         String,              // for the receipt
  plan:               { type: String, enum: ['starter', 'standard'], required: true },
  periodMonths:       { type: Number, required: true, default: 1 },
  amount:             { type: Number, required: true },   // amount actually requested from Lipila
  currency:           { type: String, default: 'ZMW' },
  isTestAmount:       { type: Boolean, default: false },
  msisdn:             { type: String, required: true },   // 2609XXXXXXXX; never returned to the client unmasked
  reference:          { type: String, required: true, unique: true }, // sent as Lipila referenceId
  status:             { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  providerIdentifier: String,              // LPLXC-…
  providerExternalId: String,              // MNO transaction id
  failureReason:      String,              // raw provider text — admin only, never sent to the browser
  amountMismatch:     { type: Boolean, default: false },
  wasLateSuccess:     { type: Boolean, default: false },
  rawResponse:        Schema.Types.Mixed,
  paidUntilAfter:     Date,                // Group.paidUntil after this payment applied
  lastCheckedAt:      Date,
  completedAt:        Date,
}, { timestamps: true }
```

Indexes: `{ reference: 1 }` unique, `{ groupId: 1, createdAt: -1 }`,
`{ msisdn: 1, createdAt: -1 }`, `{ status: 1, createdAt: 1 }`.

Schema option **`retainOnGroupDelete: true`** (see Step 1c).

Reference format: `` `c360-${Date.now()}-${crypto.randomBytes(6).toString('hex')}` ``
(31 chars, within the length BazaBooks proved works).

Add to `Group`: `lastPaymentAttemptAt: { type: Date, default: null }`. It's a write target
used to serialise concurrent initiations (§4.4), with no business meaning.

### 4.3 Shared activation helper: `utils/subscription.js`

```js
/**
 * The ONE place a group subscription is extended. Used by the super-admin activate
 * path and by the Lipila resolver. MUST be called inside the caller's session
 * transaction. Reading and then writing the Group doc inside a transaction means a
 * concurrent writer (admin activate vs webhook) raises a WriteConflict, and
 * withTransaction retries. That's the Mongo equivalent of PLAN-15's FOR UPDATE lock.
 *
 * @returns {Promise<null | { group, before, paidUntil }>}  null if the group is missing
 */
async function extendGroupSubscription(session, { groupId, plan, durationMonths, customPaidUntil }) {
  const group = await Group.findById(groupId).session(session);
  if (!group) return null;
  const before = { isPaid: group.isPaid, paidUntil: group.paidUntil, plan: group.plan, trialExpiresAt: group.trialExpiresAt };

  let paidUntil;
  if (customPaidUntil) {
    paidUntil = new Date(customPaidUntil);
  } else {
    const now = new Date();
    const base = (group.paidUntil && group.paidUntil > now) ? new Date(group.paidUntil) : new Date(now);
    base.setMonth(base.getMonth() + durationMonths);
    paidUntil = base;
  }

  group.isPaid = true;
  group.paidUntil = paidUntil;
  group.plan = plan;
  group.trialExpiresAt = new Date('2099-12-31');
  await group.save({ session });
  return { group, before, paidUntil };
}
```

These are the same semantics as today's `activate`, moved and not changed. **A legacy group
with `isPaid: true, paidUntil: null` (no expiry):** an automated payment would set a finite
`paidUntil` one month out, which effectively *shortens* its access. Step 4 refuses to
initiate for such a group (`409 NO_EXPIRY_GROUP`, "Your subscription has no expiry date.
Contact support"), and the UI shows no Pay button for it. Ask William whether any production
group is in this state at Step 0d.

### 4.4 Concurrency, Mongo-style

Production Mongo is a single-node replica set (Gotcha #12), and Atlas dev is a replica set.
Transactions are available in both.

- **Initiate double-tap:** inside `session.withTransaction`, first
  `Group.updateOne({ _id }, { $set: { lastPaymentAttemptAt: now } }, { session })`. Then read
  recent attempts and insert. Two concurrent initiations both write the same Group doc, so
  one gets a WriteConflict, retries, and on retry sees the other's freshly inserted attempt
  (resume or `409`). **Never call Lipila inside the transaction.** Commit first, then call.
- **Webhook vs poll vs admin activate:** `resolveAttempt` claims the attempt with
  `SubscriptionPayment.findOneAndUpdate({ _id, status: { $ne: 'success' } }, { $set: { status: 'success', … } }, { session, new: true })`
  and calls `extendGroupSubscription` in the **same** transaction. A second caller finds
  `status: 'success'` and returns as a no-op. The Group write conflicts with any concurrent
  admin activate, which is why Step 3 wraps `activate` in a transaction too.
- **`res.json` only after `withTransaction` resolves** (Reversal note #5). Notifications and
  emails are sent after commit too, fire-and-forget, and never inside the callback (it can
  retry).

---

## Step 0 — Setup, mostly [WILLIAM]

### 0a. [WILLIAM] Lipila production dashboard (`dashboard.lipila.io`)

1. **Add Wallet** → name **`Chama360 Subscriptions`**.
2. Wallet → Security → **Wallet Features**: turn **Collection** and **Settlements** ON and
   **Disbursement, InternalTransfer and ExternalTransfer** OFF. A leaked key then can't move
   money out.
3. Wallet → Security → **Webhook URL**:
   `https://api.chama360.nxhub.online/api/webhooks/lipila/subscriptions`
4. Wallet → Security → **IP whitelist**: `78.47.128.95/32` (the Hetzner box's static egress
   IP, the same one BazaBooks whitelisted).
5. Wallet → Overview: copy the **`Lsk…` API key** into your password manager. **Don't paste it
   into any chat.**
6. Settings → **Webhook Secret**: copy it into your password manager. Check whether it's
   merchant-wide (shared with the BazaBooks wallet) or per-wallet. Either works, but note
   which in the Step 0 findings. If it's merchant-wide, rotating it later breaks BazaBooks too.
7. Settings → **Settlement Accounts**: confirm Nexus's bank account is still set.

### 0b. [WILLIAM] Lipila sandbox (`dashboard.lipila.dev`, wallet 4154)

No change yet. Step 6 repoints its webhook URL at the dev tunnel. The sandbox key and secret
are in `~/Dev_Projects/lipila-sandbox-spike/.env`. **You** copy them into
`mern_vb_backend/.env` in Step 2. Never through Claude.

### 0c. [WILLIAM] Coolify, read-only check now (changes happen in Step 11)

On the **Chama360 backend** resource (container prefix `jgk8cwgs4s0w844cw8ksw80s`):
confirm whether `NODE_ENV=production` is set. Write the answer in the Step 0 findings. The
test-amount double guard (rule 7) doesn't depend on it, but the finding matters.

### 0d. Claude: read-only production checks (via `docker exec`, see CLAUDE.md)

1. List every non-deleted group's `name, plan, isPaid, paidUntil, trialExpiresAt` and active
   member count. Flag (a) any `isPaid: true, paidUntil: null` group (§4.3), (b) any group
   over 40 members, (c) any group whose `plan` is too small for its member count. **Report
   them. Don't change anything.** Grace's group (25 members) should be on `standard`. If it
   isn't, raise it with William before Step 4, because D10 would refuse its next Starter
   payment.
2. `curl -s https://api.chama360.nxhub.online/api/health` must show
   `transactionsAvailable: true`. If not, **stop**: every write path here needs transactions
   (Gotcha #12).

**Step 0 findings:** wallet "Chama360 Subscriptions" created Y (William, 2026-10-13); webhook secret merchant-wide or per-wallet pending William; settlement account pending William; NODE_ENV in Coolify pending William; 0d: health transactionsAvailable true; one non-deleted group (Grocery Savings Group, standard, isPaid, paidUntil 2026-11-01, 25 active members) — no no-expiry, >40, or too-small groups.

Status: built on branch build/lipila-subscription-collection 2026-10-13, not yet merged or deployed.

---

## Step 1 — Branch, model, cleanup-script opt-out

**1a.** `git checkout main && git pull && git checkout -b feat/lipila-subscription-collection`.
Commit this plan file first if it isn't already on `main`.

**1b.** Create `models/SubscriptionPayment.js` per §4.2 and add `lastPaymentAttemptAt` to
`models/Group.js`. No migration is needed (Mongoose). Indexes build on first use. Confirm
`autoIndex` behaviour in the existing models and follow it.

**1c.** `scripts/utils/groupScopedModels.js`: skip any model whose
`model.schema.options.retainOnGroupDelete === true`. Update the header comment to say why
(payment records hold proof of real money, MNO references, and must outlive their group;
BazaBooks precedent). Add a unit test asserting `SubscriptionPayment` is **not** in the list
while a normal model like `Saving` **is**. Then read `deleteGroups.js`,
`cleanupOrphanedRecords.js` and `createThrowawayTestUser.js` and confirm all three get their
list only from this function. If any still has a hardcoded list, stop and report.

**1d.** `pnpm test` in the backend. All existing tests must still pass.

⏸ Report files and test output.

---

## Step 2 — Lipila client and helpers (no network calls yet)

**2a.** `utils/msisdn.js`: port `normalizeZambianMsisdn` and `maskMsisdn` verbatim from
BazaBooks. Unit tests: `0971234567`, `+260 97 123 4567`, `971234567`, `260761234567` →
normalised; landline/short/`0981234567` (not MTN/Airtel/Zamtel) → `null`. Use fake numbers
only (e.g. `0975551234`).

**2b.** `utils/lipilaClient.js`: port BazaBooks `lib/lipila/client.js` to CommonJS. Read env
vars **inside functions**, never at module scope. Keep `initiateCollection` (returns
`pending | failed | ambiguous`), `checkCollectionStatus` (returns
`pending | success | failed | unknown`, with 404/non-JSON → `unknown`), `mapLipilaStatus`,
`classifyFailureReason` (`timeout` checked **before** `pin`) and `verifyWebhookSignature`.
Port the code itself rather than re-describing it. 20 s timeout via `AbortSignal.timeout`
(Node's global `fetch`, already used by `billingController`).

**2c.** Unit tests: `verifyWebhookSignature` against a payload you sign in the test with a
generated secret (valid; tampered body; `v1,bad v1,<good>` multi-signature; timestamp
older than 300 s; missing header); `mapLipilaStatus`; `classifyFailureReason` on all five
real messages in §3.

**2d.** Env vars. Add **names only, empty** to `mern_vb_backend/.env.example` (or the
env block in CLAUDE.md if there's no example file). **William** fills in `mern_vb_backend/.env`:

```
LIPILA_ENABLED=true
LIPILA_BASE_URL=https://api.lipila.dev
LIPILA_API_KEY=              # sandbox wallet 4154 key (from the spike .env)
LIPILA_WEBHOOK_SECRET=       # sandbox webhook secret (from the spike .env)
LIPILA_CALLBACK_URL=         # set in Step 6: https://<tunnel>.trycloudflare.com/api/webhooks/lipila/subscriptions
LIPILA_TEST_AMOUNT=1         # dev only, see rule 7
```

⏸ Report files and test output. Nothing has touched Lipila yet.

---

## Step 3 — Extract `extendGroupSubscription` (pure refactor + transaction)

**3a.** Create `utils/subscription.js` with `extendGroupSubscription` per §4.3.

**3b.** Rewire `adminBillingController.activate`. Keep its validation exactly as is, then:

```js
const session = await mongoose.startSession();
let result;
try {
  await session.withTransaction(async () => {
    result = await extendGroupSubscription(session, { groupId: req.params.groupId, plan, durationMonths, customPaidUntil });
  });
} finally { session.endSession(); }
if (!result) return res.status(404).json({ error: 'Group not found' });
await logAdminAction({ … same metadata as today, before: result.before, after: { isPaid: true, paidUntil: result.paidUntil } });
res.json({ group: result.group, plan, paidUntil: result.paidUntil });
```

The response shape, audit log row and validation errors stay **identical**. Keep the
existing `customPaidUntil` NaN check before the transaction. `markUnpaid` is **untouched**.

**3c.** Tests (new `tests/adminBilling.test.js`): activate on a trial group (sets
`isPaid`, `plan`, `paidUntil ≈ now+1mo`, `trialExpiresAt` 2099, one audit row); activate on
a paid-up group (extends from the **old expiry**); `customPaidUntil` path; invalid plan →
400; mark-unpaid unchanged.

**3d.** [Claude, against Atlas dev] Manually in the dev app as super admin, on a `ZZZ_TEST`
group: activate, extend, mark unpaid, edit trial expiry. Record before/after values.

⏸ Report the regression results. This is the hard-requirement checkpoint.

---

## Step 4 — Initiate, attempt status, latest, history routes

New file `routes/subscriptionPaymentRoutes.js`, mounted in `server.js` as
`app.use('/api/billing/lipila', …)` **after** `express.json()`. Every route uses
`verifyToken`, `resolveGroup`, `requireRole(['admin', 'treasurer'])`. **No `checkTrial`.**
Controller: `controllers/subscriptionPaymentController.js`. Every handler is try/catch,
returns `{ data }` / `{ error }`, and logs without the full MSISDN.

**4a. `POST /api/billing/lipila/initiate`**
1. `process.env.LIPILA_ENABLED !== 'true'` → `503 { error: 'UNAVAILABLE' }`.
2. Validate `{ plan: 'starter'|'standard', msisdn: string ≤ 20 }`.
   `normalizeZambianMsisdn` → null → `400 INVALID_MSISDN`.
3. Load the group. If `isPaid && !paidUntil` → `409 NO_EXPIRY_GROUP` (§4.3).
4. **Plan guard (D10):** `activeCount` from `getMemberLimitStatus`-style counting. If
   `activeCount > PLANS[plan].memberLimit` → `409 { error: 'PLAN_TOO_SMALL', data: { activeCount, memberLimit } }`.
5. Price: `{ price: amount, currency } = PLANS[plan]`, `periodMonths = 1`. Test amount
   (rule 7): `if (process.env.NODE_ENV !== 'production' && (process.env.LIPILA_BASE_URL || '').includes('lipila.dev') && Number(process.env.LIPILA_TEST_AMOUNT) > 0)`
   then `amount = Number(LIPILA_TEST_AMOUNT)` and `isTestAmount = true`.
6. In **one** `withTransaction`:
   - touch `Group.lastPaymentAttemptAt` (§4.4);
   - a `pending` attempt for this group created < **90 s** ago with the same `plan` and
     `msisdn` → return it as `resumed: true` and **don't call Lipila again**. A different
     plan or number → `409 ATTEMPT_IN_PROGRESS`;
   - throttle: ≥ 5 attempts for this group or ≥ 3 for this MSISDN in the last hour →
     `429 TOO_MANY_ATTEMPTS`;
   - insert the attempt (initiator member id and name, payer email = `req.member.email` or
     the Clerk primary email via `clerkClient`; if neither exists, leave it empty).
7. **After commit:** `initiateCollection({ reference, amount, currency, msisdn, narration: \`Chama360 ${PLANS[plan].name} – ${group.name}\`.slice(0, 60), email })`.
   - `pending` → store `providerIdentifier`, `rawResponse`.
   - `failed` → `status: 'failed'`, `failureReason`, `completedAt`;
     `502 { error: 'COLLECTION_REJECTED', data: { attemptId, failureKind } }`.
   - `ambiguous` → stays `pending`, reason stored in `failureReason` for diagnosis, normal
     response.
8. `201 { data: { attemptId, status: 'pending', amount, currency, maskedMsisdn, resumed: false } }`.
   **The UI displays this `amount`**, never its own.

**4b. `GET /api/billing/lipila/attempts/:attemptId`**: validate the ObjectId (invalid → 404,
never a 500 CastError). Load with `{ _id, groupId: req.groupId }`, so another group's
attempt → 404. If `pending`, older than 20 s, and `lastCheckedAt` null or older than 15 s →
`reconcileAttempt` (Step 5). Return
`{ status, amount, currency, plan, failureKind, paidUntil }`. `failureKind` comes from
`classifyFailureReason`; **raw provider text is never sent.**

**4c. `GET /api/billing/lipila/latest`**: `{ enabled, attempt }`, where `attempt` is the
group's newest attempt from the last 24 h. It's handed to the UI for resume **only if**
`success`, or `pending` and younger than **10 min**. A pending attempt older than 20 s is
reconciled first (same 15 s throttle) regardless. This is the lost-webhook safety net for
someone who paid and closed the tab.

**4d. `GET /api/billing/lipila/history`**: the group's `success` attempts, newest first, max
24: `{ date: completedAt, plan, amount, currency, maskedMsisdn, providerExternalId, initiatedByName, paidUntilAfter }`.

**4e. Tests** (mock `utils/lipilaClient` with `jest.mock`, so no network): role guard
(member/loan_officer → 403); kill switch → 503; invalid MSISDN; NO_EXPIRY_GROUP;
PLAN_TOO_SMALL (21 active members + starter); groups at exactly 20 + starter allowed;
resume within 90 s; 409 on a different plan; throttle 429 by group and by MSISDN; test amount
ignored when `NODE_ENV=production` and ignored when the base URL is `blz.lipila.io`;
`failed` → 502 with no raw text; `ambiguous` → stays pending; cross-group attempt fetch → 404;
malformed id → 404; expired-trial group can still initiate (no `checkTrial`).

⏸ Report the routes, the tests, and a `curl` of `/latest` (enabled, no attempt) against local dev.

---

## Step 5 — Resolver, webhook, notifications

**5a. `utils/subscriptionCollection.js`.** `resolveAttempt(attemptId, result)` and
`reconcileAttempt(attemptId)`, ported from BazaBooks with Mongo semantics:

Inside `withTransaction`:
1. Load the attempt in-session. Missing → `{ transitioned: false }`.
2. Already `success` → no-op.
3. `pending`/`unknown` result → set `lastCheckedAt`. If `unknown` **and** the attempt is
   older than 30 min → `failed` with `failureReason: 'not_found_at_provider'` (a late success
   can still activate later, per rule 3).
4. `failed` result on a `pending` attempt → `failed`, `failureReason = result.message`,
   `completedAt`. `failed` → `failed` is a no-op.
5. `success` result (from `pending` **or** `failed`):
   - claim with `findOneAndUpdate({ _id, status: { $ne: 'success' } }, …)`. If null, another
     caller won → no-op;
   - `amountMismatch = Math.abs(Number(result.amount) - attempt.amount) > 0.005 || (result.currency && result.currency !== attempt.currency)`;
   - `ext = await extendGroupSubscription(session, { groupId, plan: attempt.plan, durationMonths: attempt.periodMonths })`.
     If null (group hard-deleted): keep `success`, `failureReason: 'group_missing'`, and
     notify William;
   - store `providerExternalId`, `providerIdentifier`, `amountMismatch`,
     `wasLateSuccess: attempt.status === 'failed'`, `rawResponse`, `paidUntilAfter`,
     `completedAt`;
   - read (never modify) the warning flags: **group was already paid-up for > 7 days
     before this payment** (possible double payment after a manual activation), **another
     `success` for this group in the last 24 h**, **group's `deletedAt` or `suspendedAt` set**.
6. **After commit, only on activation:** admin notification (5c) and receipt email (5d).
   On a transition to `failed`, nothing is sent.

`reconcileAttempt`: load the attempt; if not `pending`, return it; call
`checkCollectionStatus` **outside** any transaction; then `resolveAttempt` plus the
post-commit step.

**5b. Webhook: `POST /api/webhooks/lipila/subscriptions`** in `routes/webhookRoutes.js`,
with `express.raw({ type: () => true })` on the route itself (so the body is a Buffer
whatever the content type):
1. `rawBody = req.body.toString('utf8')` before any parsing.
2. `verifyWebhookSignature(...)` fails → `console.error` (no body dump) and `401`.
3. `JSON.parse` fails → `200` (signed but unparseable; don't loop retries).
4. `type !== 'Collection'` → `200`, ignore.
5. Unknown `referenceId` → `200`, no action (other collections on the wallet may land here).
6. `resolveAttempt(...)` plus post-commit → `200`.
7. **An exception in steps 5–6 → `500`**, so Lipila retries, which is safe because the
   resolver is idempotent. This was BazaBooks Fix 3: a swallowed `200` loses the webhook
   forever.

**5c. `utils/notifyBilling.js` → `notifyAdminSubscriptionCollected({...})`.** Telegram
(`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) and Resend email to `ADMIN_EMAIL ||
SUPER_ADMIN_EMAIL`, in parallel via `Promise.allSettled`, HTML-escaping user-supplied names,
never throws. Content: "💰 Chama360 subscription paid automatically (Lipila)", group name,
payer name, plan, amount, new `paidUntil`, MNO ref, **masked** MSISDN, `(TEST AMOUNT)` if
applicable, and these warning lines when they apply:
`⚠️ Amount mismatch` · `⚠️ Late success (attempt had been marked failed)` ·
`⚠️ Group was already paid up, possible double payment after a manual activation` ·
`⚠️ Group already paid via Lipila in the last 24h` ·
`⚠️ Group is deleted/suspended, money received anyway` ·
`⚠️ Group not found, money received with no group`.

**5d. Receipt email to the payer** (`payerEmail`, skip if empty): subject "Chama360 payment
received — {group}", body with plan, amount, date, MNO ref, new paid-until date, and "Keep
this as your receipt." Plain, no marketing. Resend, fire-and-forget, failures go to
`console.error` only (Support note #5 precedent).

**5e. Tests:** resolver idempotency (three identical success results → one extension);
late success; amount mismatch still activates; `failed` result never extends; `unknown` <
30 min keeps pending and > 30 min fails; concurrent `resolveAttempt` and admin `activate`
on the same group (both applied, two months total, no lost update); webhook route: bad
signature 401, replay 401, unparseable 200, Disbursement 200 ignored, unknown ref 200,
forced resolver throw → 500.

⏸ Report, plus a simulated signed webhook run (Step 7 script) against Atlas dev.

---

## Step 6 — First real sandbox collection [WILLIAM performs it, K1]

1. [WILLIAM] Start the tunnel to the **backend** port:
   `~/.local/bin/cloudflared tunnel --protocol http2 --url http://localhost:5000`
   (confirm the port in `mern_vb_backend/.env`).
2. [WILLIAM] Put `<tunnel>/api/webhooks/lipila/subscriptions` into `LIPILA_CALLBACK_URL` in
   `.env` **and** into sandbox wallet 4154's webhook URL. If wallet 4154 has an IP whitelist,
   add the current dev IP (`curl -4 -s ifconfig.me`). It's dynamic and drifts.
3. Restart the backend. [WILLIAM] Initiate on a `ZZZ_TEST` group (via `curl` with a session
   token, or the UI once Step 8 exists), and approve the K1 PIN prompt.
4. Claude verifies: attempt `pending` → `success`, `Group` extended, `paidUntilAfter` set,
   Telegram/email received, receipt email received, and whether activation came from the
   webhook (`lastCheckedAt` empty) or the poll.

**Stop condition:** if a sandbox collection fails for account-status reasons, stop and
report. **Don't retry with different amounts** (spike lesson).

⏸ Report before Step 7.

---

## Step 7 — Simulation script and full test matrix

**7a. `scripts/devSimulateLipilaWebhook.js`** (Claude writes and runs it; no money moves).
It **refuses to run** unless `MONGODB_URI` points at the Atlas dev cluster (contains
`mern-vb-cluster` or `mongodb+srv` and **not** the Coolify container host), `NODE_ENV !==
'production'`, and the target URL is `localhost`. These are the `createThrowawayTestUser.js
--env`-style guards: assume it might one day be run in the production container (CLAUDE.md,
"Scripts in scripts/"). It inserts or reuses an attempt and POSTs a correctly signed
payload. Flags: `--status Successful|Failed`, `--amount`, `--bad-signature`,
`--old-timestamp`, `--unknown-reference`, `--type Disbursement`, `--repeat N`, `--message`.

**7b. Matrix** (fill in results):

| # | Case | How | Pass |
| --- | --- | --- | --- |
| 1 | Happy path | sim Successful | ✓ simulated, Atlas dev 2026-10-13 |
| 2 | Trial → paid | sim on an expired-trial group | ✓ simulated, Atlas dev 2026-10-13 |
| 3 | Lapsed paid → paid | `paidUntil` in the past | ✓ simulated, Atlas dev 2026-10-13 |
| 4 | Paid-up renewal | `paidUntil` in the future | ✓ simulated, Atlas dev 2026-10-13 |
| 5 | Plan switch | starter group pays standard | ✓ simulated, Atlas dev 2026-10-13 |
| 6 | Duplicate webhook | `--repeat 3` | ✓ simulated, Atlas dev 2026-10-13 |
| 7 | Bad signature / replay | flags | ✓ simulated, Atlas dev 2026-10-13 |
| 8 | Unknown ref / Disbursement | flags | ✓ simulated, Atlas dev 2026-10-13 |
| 9 | Failed | sim Failed | ✓ simulated, Atlas dev 2026-10-13 |
| 10 | Late success | Failed then Successful | ✓ simulated, Atlas dev 2026-10-13 |
| 11 | Amount mismatch | `--amount 50` | ✓ simulated, Atlas dev 2026-10-13 |
| 12 | Race | webhook + `GET /attempts/:id` reconcile concurrently | ✓ Jest only |
| 13 | Race with admin | webhook + super-admin activate concurrently | ✓ Jest only |
| 14 | Plan too small | 21 members, starter | ✓ Jest only |
| 15 | Role guard | member / loan_officer | ✓ Jest only |
| 16 | Kill switch | `LIPILA_ENABLED` unset | ✓ Jest only |
| 17 | Manual regression | repeat Step 3d | pending Phase 3 E2E |
| 18 | **Real** wrong PIN | *William*, K1 | pending William (real money) |
| 19 | **Real** lost webhook | *William*: stop tunnel, K1, approve | pending William (real money) |
| 20 | Build/tests | backend + frontend `pnpm test`, frontend `pnpm build` | ✓ (265 BE / 33 FE tests, build ok) |

⏸ Report the filled-in matrix and any deviations, **recorded rather than silently absorbed**.

---

## Step 8 — Frontend

**Read `UI_SPEC.md` first** (mandatory per CLAUDE.md). Use `components/ui/Select.jsx` for
any dropdown, tokens rather than hex values, and the §6.18 confirmation pattern only if
something irreversible appears (nothing here should). Re-read the relevant spec sections
against the diff before reporting done.

**8a. `pages/UpgradePage.jsx`** (additive, and the existing manual flow stays):
1. On mount, `GET /billing/lipila/latest` (admin/treasurer only. For other roles skip the
   call and show "Ask your group admin or treasurer to renew the subscription").
   `enabled: false` → today's page, unchanged. A resumable `pending` attempt → waiting state.
   `success` within 24 h → success state.
2. Plan cards: a plan whose `memberLimit < memberCount` (from `/me`) is disabled with
   "Your group has {n} members. {Plan} covers up to {limit}." If `memberCount > 40` →
   both disabled plus "Contact us to subscribe" (WhatsApp link, as on today's
   confirmation screen). A `NO_EXPIRY_GROUP` (isPaid with no paidUntil) → no Pay UI.
3. On a selected plan, a **"Pay now with mobile money"** card above the existing manual
   form: phone input (prefilled from `member.phone`), Pay button disabled while in flight.
   Below it, "Paid another way? Use the details below." with the existing
   `SubscribeForm` / `ConfirmationScreen` unchanged.
4. Waiting: "Check your phone (•••123) and enter your PIN to approve K{amount from
   initiate}". Poll `GET /attempts/:id` every 3 s for 150 s.
5. Success: "Payment received. Your group is on {Plan} until {date}." Refresh auth state
   (`/me`) so `TrialBanner` / `PlanStatusCard` update **without a reload**, then
   "Go to dashboard".
6. Failed (`failureKind` lookup): `pin` → "The PIN was wrong or the request was declined.";
   `timeout` → "The request timed out before it was approved."; `rate_limited`/429 → "Too
   many attempts. Please wait a few minutes."; `other` → "That didn't go through. You weren't
   charged." Plus **Try again** and a pointer to the manual option.
7. 150 s still pending: "Still waiting for confirmation. If you approved it, it will
   activate shortly. Check back on this page." plus **Try again** (keeps the number).
8. Inline errors: `INVALID_MSISDN` → "Enter an MTN, Airtel or Zamtel number";
   `PLAN_TOO_SMALL`, `ATTEMPT_IN_PROGRESS`, `UNAVAILABLE` → plain sentences.
9. **Payment history** section (admin/treasurer): `GET /billing/lipila/history`, as a list
   of date, plan, amount, masked number, MNO ref, paid by.
10. **Polling effect gotcha (BazaBooks, caught live):** put poll setup and cleanup in **one**
    `useEffect`, with no `didInit` ref. React 19 dev double-invocation kills a split
    setup/cleanup pair silently.

**8b. Super admin `AdminGroupDetail.jsx` → `BillingTab`** (additive, read-only): a
"Payments" list from a new `GET /api/admin/groups/:groupId/billing/payments` (route in
`routes/admin.js`, behind the existing `requireSuperAdmin`, in `adminBillingController`).
It returns every attempt, all statuses: date, plan, amount, status, `failureReason` (raw is
fine here, since it's admin only), masked MSISDN, MNO ref, test-amount and mismatch/late
badges, labelled **"Paid automatically (Lipila)"**. Activate/Extend and Mark Unpaid are
**untouched**.

**8c.** Verify in the browser at 375 px and desktop against Atlas dev, using a throwaway
Clerk test user (`createThrowawayTestUser.js --group "ZZZ_TEST Lipila" --template
village_bank`; check the local Clerk key first, per memory) and simulated webhooks. Cover
the states: idle, pending, success, failed, timed-out, plan-too-small, member role, kill
switch off. Clean up the test user with `--delete`. **Its `SubscriptionPayment` rows remain
by design (Step 1c)**; delete those dev-only rows by `reference` afterwards. They're
simulated, not real money.

⏸ Report screenshots of each state.

---

## Step 9 — Renewal banner (D7) and `/me` fields

**9a.** `authController` `/me`: add `paidUntil` and `planKey` (`group.plan`). It's additive,
and existing fields are unchanged.

**9b.** Banner logic (extend `TrialBanner.jsx` or `PlanStatusCard.jsx`, whichever the
layout already shows to everyone; pick one and say which):
- **admin/treasurer**, `isPaid`, `paidUntil` within **7 days** (named constant
  `RENEWAL_WARNING_DAYS = 7`; it's a UI constant, not a group financial value) → "Your
  subscription ends on {date}. Renew now" → `/upgrade`.
- **Lapsed paid group** (`isPaid && paidUntil < now`) → "Your subscription ended on {date}.
  Your data is safe and readable, but saving new records is disabled. Renew now". This
  **fixes** today's wording, which wrongly says "free trial".
- Expired trial (never paid) → today's message, unchanged.
- Members/loan officers on a lapsed group: same message, with "Ask your admin or treasurer
  to renew" and no button.
- Never shown to super admins, or for `paidUntil` null or year ≥ 2099.

**9c.** A frontend test for the banner's branches.

⏸ Report screenshots.

---

## Step 10 — Docs (in-repo only)

1. This file: Step 0 findings, Step 7 matrix results, deviations, status.
2. `CLAUDE.md`: a new **"Automated Subscription Collection (Lipila)"** architecture-notes
   section: `SubscriptionPayment`, `retainOnGroupDelete`, `extendGroupSubscription` as the
   single path for manual **and** automated activation, the webhook route, the kill switch
   and double-guarded test amount, "money that arrived always activates", the plan-too-small
   guard, "no `checkTrial` on billing routes", and **manual super-admin control unchanged and
   the fallback of record**. Add `LIPILA_*` to the env block, and the new files to Quick
   Reference.
3. `docs/` runbook section (or `CHANGELOG.md`): the weekly stuck-payment check, run via
   `docker exec` (CLAUDE.md DB section), as a read-only script
   `scripts/listPendingSubscriptionPayments.js` (pending > 15 min, failed with
   `not_found_at_provider`). For each row, check the Lipila dashboard. If it was paid, use
   **Activate / Extend** in Platform Admin. Refunds are done by hand from the Lipila
   dashboard.
4. Bump the version (minor) and add a CHANGELOG entry.
5. **Flag to William for the second brain (don't write there):** Chama360 Track 1 built;
   Express/Mongoose port notes (transactions instead of `FOR UPDATE`, `express.raw` for the
   webhook, `retainOnGroupDelete`). This is effectively the "Lipila collections playbook"
   PLAN-16 promised but never produced. Also flag the merchant-wide webhook secret finding
   from Step 0.

---

## Step 11 — Pre-push gate and deploy (William's go-ahead at each point)

Auto Deploy is ON, so **merging to `main` deploys to production**. The feature ships
**dark** (no `LIPILA_ENABLED`).

1. CLAUDE.md **Verification Loop**: backend and frontend tests, console.log sweep,
   no hardcoded financial values (prices only come from `config/plans.js`). Step 2
   (`auditBankBalance.js`) is not required, because no group financial logic is touched. Run
   it anyway as a sanity check, since `Group` changed.
2. `/ship` (NS-002 security pass). Specifically confirm: no secrets in the diff, the webhook
   route rejects unsigned requests, MSISDNs masked in logs and notifications, and new routes
   are role-guarded and group-scoped.
3. **[WILLIAM] Coolify → Chama360 backend → Environment Variables** (runtime only, not
   build-time):
   - `LIPILA_BASE_URL=https://blz.lipila.io`
   - `LIPILA_API_KEY=<Chama360 Subscriptions wallet key>`
   - `LIPILA_WEBHOOK_SECRET=<production webhook secret>`
   - `LIPILA_CALLBACK_URL=https://api.chama360.nxhub.online/api/webhooks/lipila/subscriptions`
   - **Do not set `LIPILA_ENABLED`. Never set `LIPILA_TEST_AMOUNT`.**
   - Don't redeploy yet. The merge does that.
4. Merge the branch to `main` (William's explicit go-ahead), then watch the deploy. Claude
   checks: `/api/health` 200 with `transactionsAvailable: true`; `POST /api/billing/lipila/initiate`
   → 503 (dark); an unsigned `POST /api/webhooks/lipila/subscriptions` → 401; `/upgrade`
   identical to before; Platform Admin billing works.
5. **[WILLIAM] Production smoke test (D8):**
   1. In a private window, sign up on `chama360.nxhub.online` with a **fresh alias email**
      (e.g. `wmweemba+c360smoke@gmail.com`), **not** your super-admin account. Onboard a group
      named `ZZZ_TEST Lipila Smoke` (village_bank template).
   2. Coolify: set `LIPILA_ENABLED=true` and restart/redeploy the backend.
   3. `/upgrade` → Starter → Pay now → your own number → approve the **K200** prompt.
   4. Claude verifies (read-only, `docker exec`): attempt `success`, `lastCheckedAt` empty
      (so the webhook delivered), group `isPaid`/`paidUntil +1 mo`/`plan: starter`, Telegram
      + email + receipt arrived, Payments row in Platform Admin. K195 lands in the wallet
      (K5 fee).
   5. Platform Admin → the smoke group → **Danger Zone → soft-delete** it. **Don't run
      `deleteGroups.js` on it.** The payment record stays as proof of real money.
6. Leave `LIPILA_ENABLED=true`. Tell Grace's group (Simon) that they can now renew from
   `/upgrade`. That's William's message, not Claude's.

### Rollback

- **Feature misbehaving, no data risk:** unset `LIPILA_ENABLED` in Coolify and restart. The
  UI hides itself, initiate returns 503, and manual activation is unaffected. Pending
  webhooks still resolve (the webhook route doesn't check the kill switch, so money that
  arrives still activates).
- **Code defect:** `git revert` the merge on `main` (that's an auto-deploy). The
  `SubscriptionPayment` documents stay, harmless and unread.
- **A paid group didn't activate:** William uses **Activate / Extend** by hand. That's the
  fallback of record.

---

## Step 12 — Email renewal reminder (separate phase, separate deploy)

**Start only after Step 11 is live and the smoke test passed.** The email's whole purpose is
to send people to the Pay now flow. Use a new branch off `main`:
`feat/subscription-renewal-reminder`. This phase closes the gap the banner leaves: a
treasurer who doesn't open the app during the last week gets no warning until the group goes
read-only.

### 12.1 Design (decided; don't re-litigate)

- **What:** one email, **7 days before `paidUntil`**, to every active admin and treasurer of
  the group. One reminder per billing period: a renewal moves `paidUntil`, so the next period
  gets its own reminder automatically. There's no lapse email and no SMS (out of scope).
- **Email transport:** the **existing** Resend setup: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
  (default `'Chama360 <noreply@mynexusgroup.com>'`), `new Resend(...)`, `resend.emails.send`,
  and `escapeHtml` on user-supplied names. Copy the shape of `notifyUserOfReply` in
  `controllers/supportController.js`. **No new email provider, package or env var for
  sending.** If a small shared `sendEmail` helper would remove duplication, put it in
  `utils/` and use it from the new code only. Don't refactor the existing support and billing
  senders in this phase.
- **Scheduler:** Chama360 has no cron, and this phase doesn't add one to the app. A
  **Coolify Scheduled Task** on the backend resource runs
  `node scripts/sendRenewalReminders.js --send` once a day. That means no new dependency,
  nothing runs inside the Express process, and the setting lives in Coolify, so it survives
  redeploys (unlike the hand-edited compose file in Gotcha #12). The 7-day window plus the
  idempotency marker mean a missed day just sends the next day.
- **Idempotency:** new field `Group.renewalReminderSentFor: { type: Date, default: null }`,
  which stores the exact `paidUntil` value a reminder was sent for. Send only when
  `renewalReminderSentFor` doesn't equal the current `paidUntil`. Set it **only after at
  least one email was accepted by Resend**, so a total failure retries tomorrow. A partial
  failure (one of two recipients) still marks it sent, and the failure is logged.
- **Who's eligible:** `isPaid: true`, `paidUntil` in `(now, now + 7 days]`, year < 2099,
  `deletedAt: null`, `suspendedAt: null`. Groups on trial (never paid) get no email: trial
  reminders aren't part of this phase.
- **Recipients:** `GroupMember` with `groupId`, `role ∈ ['admin','treasurer']`,
  `active: true`, `deletedAt: null`. Email = `member.email`. **If it's blank, fall back to the
  member's Clerk primary email** (`clerkClient.users.getUser(member.clerkUserId)`), because
  `createGroup`'s founder member is known to be created **without** an email (second brain,
  Chama360 overview, 2026-08-28). A Clerk lookup that 404s (dead Clerk ID, Gotcha #11) means
  that member is skipped and logged. If a group ends up with **zero** reachable recipients,
  send William one Telegram message (existing `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) naming
  the group, and don't set the marker.
- **Kill switch:** `RENEWAL_REMINDERS_ENABLED=true` must be set, or the script exits 0
  with "disabled". It's separate from `LIPILA_ENABLED`.
- **The Upgrade link:** use whatever frontend base-URL env var the invite emails already use.
  Grep the invite controller for it. If none exists, stop and report. Don't hardcode
  `chama360.nxhub.online` (CLAUDE.md: no hardcoded URLs).

### 12.2 Email content

Subject: `Your Chama360 subscription ends on {d MMM YYYY}`

Body (plain HTML, no marketing; `escapeHtml` on names):

> Hi {member name},
>
> {Group name}'s Chama360 subscription ({Plan}, K{price}/month) ends on **{date}**.
>
> To keep recording savings, loans and payments without interruption, renew before then.
> An admin or treasurer can pay by mobile money in the app: **{link to /upgrade}**.
>
> If it isn't renewed, your group's records stay safe and readable, but adding new records
> will pause until payment is made.
>
> Paid another way, or need help? Reply through Help & Support in the app.

The price comes from `config/plans.js` for `group.plan`. The date is formatted with dayjs,
in Africa/Lusaka time.

### 12.3 Build

**12a.** Add `renewalReminderSentFor` to `models/Group.js`.

**12b.** `utils/renewalReminders.js`: pure, testable functions.
`findGroupsDueForReminder(now)`, `resolveRecipients(group)` (with the Clerk fallback),
`buildReminderEmail({ member, group, plan, upgradeUrl })` and
`sendRenewalReminders({ now, send, groupId })`, which returns a summary
`{ due, sent, skipped, failed, noRecipients }`. The marker is set with a conditional update,
`Group.updateOne({ _id, paidUntil: <value read> }, { $set: { renewalReminderSentFor: <value read> } })`,
so a renewal landing mid-run isn't marked for the old date.

**12c.** `scripts/sendRenewalReminders.js`: **dry-run by default**. It prints which groups
and **masked** recipient emails (`w•••@gmail.com`) would be emailed and sends nothing.
`--send` actually sends. `--group <id>` limits the run to one group. Safety guards, written
on the assumption that this script will one day run in the wrong environment (CLAUDE.md,
"Scripts in scripts/"):
- `--send` **refuses** unless `NODE_ENV === 'production'`, **or** `--allow-dev` is passed
  **together with** `--group <id>` and that group's name starts with `ZZZ_TEST`. **Why:**
  Atlas (dev) still holds a stale copy of real customer groups (Grace's) until Session 2's
  cleanup, so an unguarded dev run could email Simon.
- It exits non-zero if any send failed, so Coolify's task log shows a failure.
- It prints the summary line, and logs no full email addresses or API keys.

**12d.** Tests (`tests/renewalReminders.test.js`, with Resend and Clerk mocked):
eligibility (due in 7 days yes, 8 days no, already lapsed no, 2099 no, trial-only no,
deleted/suspended no); idempotency (a second run sends nothing; after `paidUntil` moves, it
sends again); recipients (admin + treasurer yes, loan_officer/member no, inactive no; blank
email → Clerk fallback; Clerk 404 → skipped); no recipients → Telegram, marker not set; all
sends failed → marker not set; one of two failed → marker set; kill switch off → nothing;
dry-run never calls Resend; `--send` guard refuses in dev without `--allow-dev --group
ZZZ_TEST…`.

**12e.** [Claude, Atlas dev] On a `ZZZ_TEST` group whose admin is a throwaway Clerk user with
a `+clerk_test` address, set `isPaid: true, paidUntil: now + 5 days`. Run the dry-run, then
`--send --allow-dev --group <id>`. Confirm the email in Resend's dashboard logs (William
checks; `+clerk_test` addresses may not deliver to a real inbox) and that the marker is set.
A second run sends nothing. Clean up the group.

⏸ Report the tests, the dry-run output and the dev send result.

### 12.4 Deploy

1. Verification Loop and `/ship --preflight`, then merge to `main` (auto-deploy). The feature
   is inert until both the env var and the scheduled task exist.
2. **[WILLIAM] Coolify → Chama360 backend → Environment Variables:** add
   `RENEWAL_REMINDERS_ENABLED=true` (runtime only), then restart.
3. Claude runs a production **dry-run** via `docker exec` (container name per CLAUDE.md,
   since it changes on every redeploy):
   `node scripts/sendRenewalReminders.js`. William reviews the list of groups and masked
   recipients before anything is sent.
4. **[WILLIAM] Coolify → Chama360 backend → Scheduled Tasks → Add:**
   - Name: `Subscription renewal reminders`
   - Command: `node scripts/sendRenewalReminders.js --send`
   - Frequency: `0 6 * * *` (06:00 UTC = 08:00 Lusaka, daily)
   - Container: the backend app container (Coolify's default for the app)
5. The next morning, check the task's execution log in Coolify for the summary line and exit
   code 0.

**Rollback:** unset `RENEWAL_REMINDERS_ENABLED` (the script exits as disabled) or disable
the scheduled task. Nothing else depends on it.

**Docs:** add a "Renewal reminders" note to the CLAUDE.md section from Step 10 covering the
Coolify task, the marker field, the dry-run default, and the dev-send guard and why it
exists. Add a CHANGELOG entry and a patch version bump.

---

## Stop conditions (stop and report, don't push through)

- Step 0d: `/api/health` shows `transactionsAvailable: false`.
- `check-status` or the webhook shape differs from §3.
- A real sandbox collection fails for account reasons (don't retry with other amounts).
- Anything that would change `markUnpaid`, the trial-expiry edit, or `activate`'s behaviour
  beyond Step 3's extraction-plus-transaction.
- Anything that would make a billing route sit behind `checkTrial`.
- Any temptation to touch `GroupFund`, `FundExpense`, `BankBalance` or `Transaction` (D5).
- Any cleanup script found with its own hardcoded model list (Step 1c).

---

## Out of scope

Card payments (PLAN-16 not yet proven) · multi-month/annual pricing · proration · reminders
other than Step 12's single 7-day email (no lapse email, no SMS, no trial-expiry email) ·
auto-renewal (mobile money can't auto-debit) · refunds in-app ·
disbursement of any kind · Track 2 (collecting *for* groups) · large-group (> 40) pricing
· debiting the App Subscription fund · NdalamaHub.
