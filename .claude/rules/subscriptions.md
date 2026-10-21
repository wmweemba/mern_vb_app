---
paths:
  - "**/*{ipila,ubscription,rial}*"
  - "mern_vb_backend/config/**"
  - "mern_vb_backend/controllers/authController.js"
---

# Automated subscription collection (Lipila)

Moved verbatim from CLAUDE.md on 2026-10-21; loads only when Claude works with matching files. Full prior file: `docs/history/CLAUDE-2026-10-21.md`.

## Automated Subscription Collection (Lipila) — Architecture Notes

Added 2026-10-13 (mobile money subscription renewal via Lipila PIN prompt, ships dark behind `LIPILA_ENABLED`). Key decisions recorded here to prevent regression:

1. **`SubscriptionPayment` model is never swept on group delete.** The schema carries `retainOnGroupDelete: true`, which excludes it from `scripts/utils/groupScopedModels.js` — payment records hold proof of real money and MNO references, and must outlive their group as an audit trail. `Group.lastPaymentAttemptAt` is written to serialize concurrent initiation attempts.

2. **`extendGroupSubscription` in `utils/subscription.js` is the single path for both manual super-admin activation AND automated activation via the webhook.** Always called inside a transaction. Manual `activate` (the super-admin Platform Admin path) and automated webhook resolution both route through it, keeping the arithmetic identical. Manual control is the fallback of record — super admins can still extend a group by hand at any time.

3. **The webhook `POST /api/webhooks/lipila/subscriptions` is the source of truth; polling via `GET /attempts/:id` and `/latest` is the fallback.** One idempotent `resolveAttempt(attemptId, result)` is called by both. The webhook does NOT check `LIPILA_ENABLED` — money that arrives always activates, even with the kill switch off. It uses `express.raw({ type: () => true })` for Standard Webhooks signature verification. Rejects unsigned requests with `401`, and returns `500` (not swallowed `200`) on any resolver error so Lipila retries — a previous port returned `200` on every error, losing failed webhooks forever.

4. **Money that arrived always activates, even on an amount mismatch or late success.** A late success (payment succeeds after the attempt was marked `failed`) still extends the group and flags a warning. An amount mismatch still activates and flags a warning. Only `success` status is terminal. A pending attempt that Lipila's check-status reports as **unknown** (no record) for more than 30 minutes is marked `failed` with `not_found_at_provider`; a still-`Pending` one is left alone. Either way a later Successful result still activates.

5. **Plan-too-small guard before any PIN prompt.** A group with more active members than a plan's `memberLimit` gets `409 PLAN_TOO_SMALL` immediately. Groups with > 40 members see "Contact us to subscribe" instead of Pay on the `/upgrade` UI, and William handles them manually via the super-admin path.

6. **No `checkTrial` on billing routes.** An expired group must be able to pay. Every group-facing route uses `verifyToken`, `resolveGroup`, `requireRole(['admin', 'treasurer'])`.

7. **Kill switch `LIPILA_ENABLED=true` controls visibility and the initiate endpoint.** When unset, initiate returns `503 UNAVAILABLE`, the pay card is hidden, and the manual form is shown as the only option. The webhook route does NOT check the kill switch — pending webhooks still resolve and activate groups with `LIPILA_ENABLED` off. A double guard on test amount: it applies **only when both** `NODE_ENV !== 'production'` **and** `LIPILA_BASE_URL` contains `lipila.dev` (sandbox).

8. **Notifications are fire-and-forget, never inside `withTransaction()`.** Admin notices (Telegram + Resend) and receipt emails are sent after the transaction commits, detached via `Promise.allSettled`. A hung notification can never hang the webhook or polling response. MSISDNs are masked as `•••123` everywhere outside the `SubscriptionPayment` document itself.

9. **Manual super-admin control (activate, extend, mark-unpaid, trial-expiry edit) is unchanged and remains the fallback of record.** The only changes to existing manual paths are the Step 3 refactor (wrapping `activate` in a transaction, behaviour-identical) and the additive read-only payments list in the Platform Admin Billing tab.

10. **The App Subscription `GroupFund` is never touched by Lipila.** Money enters via mobile phone, not from the pot. If a treasurer reimburses from the pot, they record a `FundExpense` by hand as today.

11. **A webhook `Successful` is confirmed with Lipila before it activates anything.** Lipila's webhook secret is **merchant-wide** (shared with BazaBooks; only API keys and IP whitelists are per wallet), so a leak from either app could sign a forged payload. `lipilaWebhookController` calls `checkCollectionStatus` with this wallet's own API key first: confirmed success → activate; confirmed failed → failed; pending/unknown → **503** so Lipila retries (the resolver is idempotent). Failed webhooks skip the check. Initiate's post-Lipila writes are conditional on `status: 'pending'`, so they can never overwrite a result the webhook already recorded.

12. **Stuck payments: reconcile first, never hand-activate a row reconcile can resolve.** `node scripts/listPendingSubscriptionPayments.js` lists them; `--reconcile <attemptId>` runs check-status through the normal resolver. Using Activate/Extend for a payment Lipila still knows about leaves the attempt pending, and a later reconcile or webhook retry would extend the group a second time.

13. **Local dev gotcha: a Mac clock more than 5 s off breaks every authenticated request.** Clerk tolerates 5 s of clock skew; at 6.3 s behind (found 2026-10-13) every fresh session token was rejected, `/me` returned 401 and `/upgrade` showed the non-admin message to an admin. Check the offset against `curl -sI https://api.clerk.com` before debugging auth, and resync the clock (William's action, it's a system setting).

14. **Verified live 2026-10-13 against the Lipila sandbox (wallet 4154):** a real K1 collection activated a group via the webhook in 16 s, and a wrong PIN was marked failed via the webhook with no group change. The lost-webhook case was only partly observed (the PIN prompt never arrived); the poll fallback ran correctly against a `Pending` result.

15. **A lapsed paid group is read-only (`middleware/checkTrial.js`, decided by William 2026-10-13).** `isPaid && paidUntil <= now` → GETs pass, writes get `403 { error: 'trial_expired', code: 'subscription_lapsed' }`, and `/me` returns `trialActive: false` (`computeTrialActive` in `authController.js`). Before this, a lapsed group fell through to `trialExpiresAt`, which every activation sets to 2099, so a paid group never lost write access. Billing routes are not behind `checkTrial`, so a lapsed group can still renew. **Mark unpaid is read-only too (William, 2026-10-13):** `markUnpaid` now also sets `trialExpiresAt` to now (it used to leave activation's 2099 date, so a group marked unpaid kept full access through the trial branch). The audit row records the trial date before and after. To give a group free access afterwards, use the trial-expiry edit. The banner such a group sees is the never-paid "free trial has ended" wording.

16. **The dev simulator's `Successful` webhooks now get 503.** Since note 11, a success is confirmed with Lipila's check-status, and the sandbox has never heard of a simulated reference, so it answers unknown. `--status Failed`, bad-signature, replay, unknown-reference and Disbursement cases still behave as before. To simulate an activation locally, the confirm step would need mocking; the real-sandbox path is the reliable test.

---
