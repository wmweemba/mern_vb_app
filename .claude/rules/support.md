---
paths:
  - "**/*{upport,icket}*"
---

# Support ticket threading

Moved verbatim from CLAUDE.md on 2026-10-21; loads only when Claude works with matching files. Full prior file: `docs/history/CLAUDE-2026-10-21.md`.

## Support Ticket Threading — Architecture Notes

Added 2026-08-11 (Phase 0.5 of `docs/plan_configurable_group_rules.md`). Key decisions recorded here to prevent regression:

1. **`resolutionNote` is deprecated, not removed.** `SupportRequest.messages[]` (`{ authorType: 'user'|'admin', authorId, authorName, body, createdAt }`) is now the single source of truth for the thread. `resolutionNote` is kept only so historical reads don't break; nothing writes to it anymore. `scripts/migrateSupportResolutionNotes.js` backfills any legacy note in as the first admin message — idempotent (gated on `messages.length === 0`), safe to re-run.

2. **"Unread" is derived, never stored.** `hasUnreadAdminReply()` in `supportController.js` compares the latest admin message's `createdAt` against `SupportRequest.userLastViewedAt`. `userLastViewedAt` is set to `now()` only when the ticket's own user fetches `GET /support/requests/:id` or posts a reply — never by an admin action.

3. **User-facing routes are ownership-scoped, never trust the client.** `GET /support/requests`, `GET /support/requests/:id`, `POST /support/requests/:id/messages` all filter by `clerkUserId` resolved server-side from the session (`getAuth(req)`), same discipline as `createRequest`. No trial/subscription gate on any of them — an expired user must still be able to reach support (NS-005 §2 in the second brain).

4. **A user reply reopens a resolved/closed ticket automatically** (`addUserMessage` flips status to `in_progress`). An admin reply on an `open` ticket also auto-advances it to `in_progress`. Neither path touches `resolvedAt`/`resolvedBy` — those are still write-once, per the existing status-transition rule.

5. **Notification failures are logged, not surfaced on the ticket document.** Unlike ticket-creation notifications (which write to `notifyError`), reply notifications (`notifyAdminOfReply` Telegram ping, `notifyUserOfReply` Resend email) fail silently to `console.error` and never block the reply itself — mixing reply-notification failures into the creation-time `notifyError` field would conflate two different events.

6. **Ported from NdalamaHub, not built from scratch.** `~/Dev_Projects/ndalamahub_lms_app/server/routes/tickets.js` already had a working two-way thread (`Ticket.messages[]`, scope-filtered list/get, `POST /:id/messages`, counterparty notification) that NS-005 in the second brain didn't know about. Chama360's version omits NdalamaHub's multi-tenant `ticketScopeFilter`/`isHandler` machinery (not needed — Chama360 has one flat customer-vs-admin relationship, not lender/employer/borrower tenancy) but keeps the same shape. If a future app needs this pattern, check `docs/plan_configurable_group_rules.md` Phase 0.5 and NS-005 first.

---
