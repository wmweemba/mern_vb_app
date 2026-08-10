# Plan — In-App Help & Support (User → Telegram + Email + Super Admin Inbox)

> **Executor:** Sonnet (fresh session, no prior context).
> **Author:** Opus 4.7 planning session — 2026-05-06.
> **Author context:** William is the platform's founder/super admin and treasurer of his own group. The live app has paying / trial users who currently have no in-app way to report issues — they call William's phone. This plan adds an in-app support flow that mirrors the existing "Upgrade Request" pattern (Telegram + Resend email notifications) and adds a super-admin inbox to track tickets.
> **Style:** implement in the order listed, run the verification loop after each phase, follow every UI rule in `UI_SPEC.md` and every project rule in `CLAUDE.md`. **Do not invent features or skip steps.** Everything Sonnet needs is in this file.

---

## 0. Read These Files First (5 min)

Before writing any code, read:

1. `CLAUDE.md` — project-wide rules, commit conventions, verification loop.
2. `UI_SPEC.md` — especially §2 colours, §6 component patterns, §8 responsive rules, §12 Do-Not-Do list (no raw Tailwind colours).
3. `mern_vb_backend/controllers/billingController.js` — the **canonical reference** for Telegram + Resend dual-send. Mirror it.
4. `mern_vb_backend/routes/billingRoutes.js` — minimal route shape to mirror.
5. `mern_vb_backend/routes/admin.js` — pattern for super-admin-gated routes (uses `verifyToken` + `requireSuperAdmin`).
6. `mern_vb_backend/middleware/auth.js` and `middleware/requireSuperAdmin.js` — auth primitives.
7. `mern_vb_backend/middleware/resolveGroup.js` — populates `req.member`, `req.role`, `req.groupId`, `req.isSuperAdmin`.
8. `mern_vb_backend/models/SuperAdminInvite.js` — small, clean schema example to mirror for `SupportRequest`.
9. `mern-vb-frontend/src/pages/UpgradePage.jsx` (lines 103–199) — the canonical client-side reference for the "fire request → toast → confirmation" pattern. Pre-fills name/email from auth, sends `phone` from a manual input.
10. `mern-vb-frontend/src/components/ui/SlideoverDrawer.jsx` — props `{ open, onClose, title, children, footer }`. Built-in centred Cancel link is rendered automatically below `footer`. Reuse, do not recreate.
11. `mern-vb-frontend/src/components/layout/AppShell.jsx` — the global shell where the floating help button + drawer mount.
12. `mern-vb-frontend/src/components/layout/TopBar.jsx` — the avatar dropdown where the desktop "Help & Support" item lives.
13. `mern-vb-frontend/src/components/layout/AdminSidebar.jsx` — admin sidebar nav item list to extend.
14. `mern-vb-frontend/src/store/auth.jsx` — `useAuth()` returns `{ user, clerkUser, isSuperAdmin, ... }`. Axios already injects the Clerk token; no manual `Authorization` header needed.
15. `mern_vb_backend/tests/authMiddleware.test.js` and `groupSettings.test.js` — Jest + Supertest patterns used in this repo.

---

## 1. Audit Summary — What Already Exists vs. What's Missing

### 1a. Already exists (reuse, do NOT duplicate)
- **Telegram notifier pattern** — `controllers/billingController.js:39–48`. Uses `process.env.TELEGRAM_BOT_TOKEN` and `process.env.TELEGRAM_CHAT_ID`. Both env vars are documented in the README and live on Coolify.
- **Resend email pattern** — `controllers/billingController.js:51–59`. Optional, only fires when `RESEND_API_KEY` and `ADMIN_EMAIL` are set.
- **Auth & group context** — `verifyToken` + `resolveGroup` middleware on the user-facing endpoint give us `req.member.name`, `req.member.email`, `req.member.role`, `req.groupId`, and `req.isSuperAdmin` for free.
- **Super-admin route gating** — `verifyToken` + `requireSuperAdmin` (`routes/admin.js:17`). Mount the inbox routes inside `routes/admin.js` so they inherit the pre-existing guards.
- **`SlideoverDrawer`** — handles ESC, body scroll lock, backdrop click, desktop right-slide + mobile bottom-sheet, and an automatic "Cancel" link beneath the footer. Footer should contain only the Submit button.
- **`sonner` toasts** — `import { toast } from 'sonner'`. Use `toast.success(...)` and `toast.error(...)`.
- **`API_BASE_URL`** — `import { API_BASE_URL } from '../lib/utils'`.
- **`useAuth()`** — exposes `user`, `clerkUser`, `isSuperAdmin`. Same hook used everywhere.
- **Admin shell + sidebar** — `AdminShell.jsx`, `AdminSidebar.jsx` already render a left rail nav with `LayoutGrid`, `Users`, `Shield`, `FileText` items. Adding a "Support" item is one line.
- **`AdminAuditLog.jsx`** — a paginated admin list page with filters. **Use as the structural reference for `AdminSupportInbox.jsx`** (same outer layout, same filter pill pattern, same desktop table + mobile card responsive split).

### 1b. Missing (this plan builds all of it)
- No `SupportRequest` Mongo model.
- No `POST /api/support/request` endpoint.
- No `GET /api/admin/support` (list) or `PATCH /api/admin/support/:id` (status update) endpoints.
- No floating help button anywhere in the UI.
- No "Help & Support" item in the avatar dropdown.
- No `SupportRequestDrawer` component.
- No `/admin/support` route or `AdminSupportInbox.jsx` page.

### 1c. Out of scope — explicitly do NOT build
- **No file uploads / screenshots.** Text only. (User confirmed: out of scope; he can follow up via WhatsApp/email.)
- **No threaded messaging or in-app reply UI.** The super-admin inbox only changes a status (`open` → `in_progress` → `resolved` → `closed`) and shows a single resolution note. No back-and-forth chat.
- **No public unauthenticated endpoint.** All routes require Clerk auth — anonymous reports are not accepted in v1.
- **No Slack / SMS notifier.** Telegram + Resend email only. (Mirror `billingController` exactly.)
- **No mobile-app push notifications.** This is a PWA; out of scope.
- **No SLA tracking / auto-escalation.** Status is manual.
- **No edit-after-submit by the requester.** Once submitted, the user can't change the request.

---

## 2. Architectural Decisions (Locked-In)

These are user-confirmed. **Do not renegotiate them.**

1. **Persist tickets in MongoDB** (not fire-and-forget). A `SupportRequest` document is created BEFORE the Telegram/email send. The send happens in the same handler; failures to send do NOT roll back the DB record (we want the ticket persisted even if the bot is down — that is half the point).
2. **Auto-capture context server-side.** The user types only `phone`, `category`, `description`. The server fills in `name`, `email`, `role`, `groupId`, `groupName`, `pagePath` (from request body — set by client), `userAgent`, and `createdAt`. This keeps the form short and the message rich.
3. **Categories (locked):** `error`, `question`, `feature_request`, `billing`, `other`. (User explicitly renamed "Bug" → "Error".) Frontend label map: `error` → "Error / Bug", `question` → "Question", `feature_request` → "Feature Request", `billing` → "Billing", `other` → "Other".
4. **Status lifecycle:** `open` (default on create) → `in_progress` → `resolved` → `closed`. Super admins can transition freely between any two; the model enforces the enum but not the order.
5. **Visibility — show the help button to everyone.** Including super admins. User confirmed they want it visible globally for self-testing and for cases where they're acting as a regular member.
6. **Bypass `checkTrial`.** The support endpoint uses `verifyToken` + `resolveGroup` only — **NOT** `checkTrial`. Expired-trial users hit issues precisely when they need to report a billing/access problem; blocking them defeats the purpose.
7. **Both Telegram and Resend email fire on submit.** Telegram is primary; email is the backup. Both attempts are wrapped in `try/catch` so a failure of one does not prevent the other or fail the request. The DB record is the source of truth; notifications are best-effort.
8. **Super-admin inbox lives at `/admin/support`.** Mounted in `AdminSidebar.jsx`'s `NAV_ITEMS` array between `Audit Log` and the bottom of the menu (or wherever fits — Sonnet to place reasonably).
9. **Mode-agnostic visibility of the help button** — the floating help button + dropdown item appear in BOTH the regular `AppShell` AND the `AdminShell`. A super admin browsing the platform admin view should still be able to file a support request (e.g. testing the flow). Mount in both shells.

---

## 3. Backend — Schema, Controller, Routes

### 3.1 Create `SupportRequest` model

**File:** `mern_vb_backend/models/SupportRequest.js` (new file).

**Schema:**

```js
const mongoose = require('mongoose');

const CATEGORIES = ['error', 'question', 'feature_request', 'billing', 'other'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

const supportRequestSchema = new mongoose.Schema({
  // Who
  clerkUserId: { type: String, required: true },
  groupMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember', default: null },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  role: { type: String, default: null },         // member role at time of submission
  groupName: { type: String, default: null },    // snapshot — group may rename later

  // What
  category: { type: String, enum: CATEGORIES, required: true },
  description: { type: String, required: true, trim: true, maxlength: 4000 },

  // Context auto-captured by client + server
  pagePath: { type: String, default: null },     // e.g. "/loans"
  userAgent: { type: String, default: null },

  // Lifecycle
  status: { type: String, enum: STATUSES, default: 'open', index: true },
  resolutionNote: { type: String, default: null, maxlength: 2000 },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: null },   // clerkUserId of super admin who resolved

  // Notification audit
  notifiedTelegramAt: { type: Date, default: null },
  notifiedEmailAt: { type: Date, default: null },
  notifyError: { type: String, default: null },  // last error message, if any
}, { timestamps: true });

supportRequestSchema.index({ createdAt: -1 });
supportRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SupportRequest', supportRequestSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUSES = STATUSES;
```

Notes:
- `description` capped at 4000 chars to bound abuse without being annoying. Frontend will show a counter at 3000+.
- `groupId` and `groupMemberId` are nullable because a super admin without a group membership can also submit (rare but possible).
- No `deletedAt` — tickets are not soft-deletable in v1. If a ticket needs to disappear, transition to `closed`.

### 3.2 Create `supportController.js`

**File:** `mern_vb_backend/controllers/supportController.js` (new file).

**Three exports:** `createRequest`, `listRequests`, `updateStatus`.

**3.2a — `createRequest(req, res)`** — bound to `POST /api/support/request`.

Flow:
1. Read `{ phone, category, description, pagePath, userAgent }` from `req.body`. Trim. Validate:
   - `phone` required, length 5–30, otherwise 400.
   - `category` must be one of `SupportRequest.CATEGORIES`, otherwise 400.
   - `description` required, length 5–4000, otherwise 400.
   - `pagePath` and `userAgent` are optional strings; ignore if absent.
2. Read identity from `req`:
   - `clerkUserId` from `getAuth(req).userId`.
   - If `req.member` exists: pull `name`, `email`, `role`, `groupId`, `groupMemberId = req.member._id`, then `groupName` via `Group.findById(req.groupId).select('name')`.
   - If no `req.member` (super admin without group): fall back to Clerk `users.getUser(clerkUserId)` for name/email. Use `@clerk/express`'s `clerkClient`. If that also fails, return 400 "Cannot resolve identity — please refresh and try again."
3. Create the SupportRequest document (await save). Capture `_id`.
4. Build the Telegram message text (HTML parse_mode):
   ```
   🆘 <b>New Support Request</b>

   <b>Group:</b> {groupName || '—'}
   <b>From:</b> {name}
   <b>Email:</b> {email}
   <b>Phone:</b> {phone}
   <b>Role:</b> {role || '—'}
   <b>Category:</b> {categoryLabel}        ← human label, see below
   <b>Page:</b> {pagePath || '—'}
   <b>Submitted:</b> {createdAt ISO}

   <b>Description:</b>
   {description}

   <b>Ticket ID:</b> {_id}
   ```
   Category label map (controller-local constant):
   ```js
   const CATEGORY_LABELS = {
     error: 'Error / Bug',
     question: 'Question',
     feature_request: 'Feature Request',
     billing: 'Billing',
     other: 'Other',
   };
   ```
5. **Telegram send (best-effort, wrapped):**
   ```js
   try {
     const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
     const r = await fetch(telegramUrl, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         chat_id: process.env.TELEGRAM_CHAT_ID,
         text: messageText,
         parse_mode: 'HTML',
       }),
     });
     if (!r.ok) throw new Error(`Telegram ${r.status}`);
     ticket.notifiedTelegramAt = new Date();
   } catch (err) {
     ticket.notifyError = `telegram: ${err.message}`;
   }
   ```
6. **Email send (best-effort, only if env vars set):**
   ```js
   if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
     try {
       const resend = new Resend(process.env.RESEND_API_KEY);
       await resend.emails.send({
         from: process.env.RESEND_FROM_EMAIL || 'Chama360 <noreply@mynexusgroup.com>',
         to: process.env.ADMIN_EMAIL,
         subject: `[Support] ${CATEGORY_LABELS[category]} — ${groupName || name}`,
         html: messageText.replace(/\n/g, '<br>'),
       });
       ticket.notifiedEmailAt = new Date();
     } catch (err) {
       ticket.notifyError = (ticket.notifyError ? ticket.notifyError + '; ' : '') + `email: ${err.message}`;
     }
   }
   ```
7. `await ticket.save();` (re-save with the notify timestamps/errors).
8. Respond `201` with `{ success: true, ticketId: ticket._id }`. **Do not include the full document** — frontend doesn't need it.
9. Wrap the whole handler in a top-level `try/catch` returning `500 { error: 'Failed to submit support request', details: err.message }` only on a true error path (DB save failure, identity resolution failure). Notification failures are NOT errors — they live on the document.

**3.2b — `listRequests(req, res)`** — bound to `GET /api/admin/support`.

- Query params: `status` (optional, one of statuses or `'all'`), `category` (optional), `q` (optional text search), `page` (default 1), `limit` (default 25, max 100).
- Build `filter = {}`. If `status && status !== 'all'`: `filter.status = status`. If `category`: `filter.category = category`.
- If `q`: case-insensitive `OR` across `name`, `email`, `groupName`, `description` using regex (escape special chars). Cap `q` length at 100.
- Paginate: `.sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit)`.
- Count total in parallel for pagination metadata.
- Respond `{ requests: [...], total, page, limit }`.

**3.2c — `updateStatus(req, res)`** — bound to `PATCH /api/admin/support/:id`.

- Body: `{ status, resolutionNote }` (both optional but at least one required).
- If `status`: must be in `SupportRequest.STATUSES`, otherwise 400.
- If `resolutionNote`: trim, max 2000.
- If transitioning to `resolved` or `closed`: set `resolvedAt = new Date()` and `resolvedBy = getAuth(req).userId` (only on the FIRST transition — don't overwrite if already set).
- Find by `id`, update, return the updated doc. 404 if not found.

### 3.3 Routes

**3.3a — Create `routes/support.js`** (new file):

```js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const supportController = require('../controllers/supportController');

// Note: NO checkTrial — expired-trial users must still be able to file tickets.
// resolveGroup is mounted, but it tolerates super admins without a group.
router.post('/request', verifyToken, resolveGroup, supportController.createRequest);

module.exports = router;
```

**3.3b — Mount in `server.js`** — add after the existing `/api/billing` line (line 34):
```js
app.use('/api/support', require('./routes/support'));
```

**3.3c — Append super-admin inbox routes to `routes/admin.js`** — add after the audit-log route (line 22, between `audit-log` and `test-email` or at the end of the super-admin-gated block — Sonnet to pick a reasonable spot consistent with the file's existing grouping):

```js
// Support inbox
router.get('/support', supportController.listRequests);
router.patch('/support/:id', supportController.updateStatus);
```

And add `const supportController = require('../controllers/supportController');` to the imports at the top of `routes/admin.js`.

These routes inherit the `router.use(verifyToken, requireSuperAdmin);` guard already at line 17 of `routes/admin.js`.

### 3.4 Backend tests

**File:** `mern_vb_backend/tests/supportController.test.js` (new file).

Mirror the structure of `tests/authMiddleware.test.js` and `tests/groupSettings.test.js` (Jest + Supertest, in-memory MongoDB via `mongodb-memory-server` if already used by the suite, or the existing test setup — Sonnet to inspect what the other tests use and follow it exactly).

Test cases (minimum — add more if obvious gaps appear):

1. `POST /api/support/request` — happy path: returns 201, persists a document with `status: 'open'`, captures `name`/`email` from `req.member`, snapshots `groupName`. Mock Telegram fetch to resolve OK; assert `notifiedTelegramAt` is set.
2. `POST /api/support/request` — Telegram failure does NOT fail the request: mock fetch to reject; expect 201, `notifiedTelegramAt: null`, `notifyError` populated.
3. `POST /api/support/request` — validation: missing `phone` → 400; invalid `category` → 400; `description` length 0 or > 4000 → 400.
4. `POST /api/support/request` — unauthenticated request → 401.
5. `GET /api/admin/support` — non-super-admin → 403.
6. `GET /api/admin/support` — super admin: lists tickets, sorted by `createdAt` desc, `status=open` filter narrows correctly, pagination returns correct slice + total.
7. `PATCH /api/admin/support/:id` — super admin transitions `open` → `resolved`: `resolvedAt` and `resolvedBy` get set; second transition to `closed` does NOT overwrite `resolvedAt`.
8. `PATCH /api/admin/support/:id` — invalid status → 400.

Mock the Resend client at the module level so email sends never go out in tests. Mock `fetch` (used for Telegram) per-test.

---

## 4. Frontend — Components, Page, Wiring

### 4.1 Create `SupportRequestDrawer.jsx`

**Path:** `mern-vb-frontend/src/components/support/SupportRequestDrawer.jsx` (create the `support/` subdirectory).

**Purpose:** Controlled drawer. Form for the user. POSTs to `/api/support/request`. Mirror `UpgradePage.jsx`'s `SubscribeForm` for the auth pre-fill pattern and inline-error styling.

**Props:**
```
open      boolean
onClose   () => void
```

**Imports:**
```js
import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import SlideoverDrawer from '../ui/SlideoverDrawer';
import { useAuth } from '../../store/auth';
import { API_BASE_URL } from '../../lib/utils';
```

**Local state:**
```
phone          string         (manual input)
category       string         (default '')
description    string         (manual input)
saving         boolean
error          string | null
submitted      boolean        (post-submit confirmation view)
ticketId       string | null
```

**Pre-fill (read-only, mirror UpgradePage lines 110–111):**
```js
const { user: clerkUser } = useUser();
const { user: member } = useAuth();
const prefillName = member?.name || clerkUser?.fullName || '';
const prefillEmail = clerkUser?.primaryEmailAddress?.emailAddress || '';
const location = useLocation();
```

**Effect — reset state on open:**
```js
useEffect(() => {
  if (open) {
    setPhone('');
    setCategory('');
    setDescription('');
    setError(null);
    setSubmitted(false);
    setTicketId(null);
  }
}, [open]);
```

**Submit handler:**
```js
async function handleSubmit(e) {
  e.preventDefault();
  if (!phone.trim()) return setError('Phone number is required.');
  if (!category) return setError('Please choose a category.');
  if (description.trim().length < 5) return setError('Please describe the issue (at least 5 characters).');
  if (description.length > 4000) return setError('Description is too long (max 4000 characters).');
  setSaving(true);
  setError(null);
  try {
    const res = await axios.post(`${API_BASE_URL}/support/request`, {
      phone: phone.trim(),
      category,
      description: description.trim(),
      pagePath: location.pathname,
      userAgent: navigator.userAgent,
    });
    setTicketId(res.data?.ticketId || null);
    setSubmitted(true);
    toast.success('Support request sent. We’ll be in touch shortly.');
  } catch (err) {
    setError(err?.response?.data?.error || 'Failed to send. Please try again or call support.');
  } finally {
    setSaving(false);
  }
}
```

**Form fields:**

| Field | Input | Validation | Notes |
|---|---|---|---|
| Name | text input | read-only | `value={prefillName}` |
| Email | email input | read-only | `value={prefillEmail}` |
| Phone | tel input | required, 5–30 chars | placeholder `"e.g. 0979645911"` |
| Category | `<select>` | required | options below — first option `value=""` "Select a category…" |
| Description | `<textarea>` | required, 5–4000 chars | rows=5; show counter `{description.length}/4000` below right-aligned in `text-xs text-text-muted` |

Category options (label = human label, value = backend enum):
```jsx
<option value="">Select a category…</option>
<option value="error">Error / Bug</option>
<option value="question">Question</option>
<option value="feature_request">Feature Request</option>
<option value="billing">Billing</option>
<option value="other">Other</option>
```

**Styling — UI_SPEC tokens only (no raw Tailwind colours):**
- Labels: `text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5`
- Read-only inputs: `w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-page cursor-not-allowed`
- Editable inputs: `w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-text-muted`
- Error banner (when `error`): `text-xs text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2`
- Spacing: fields stacked `space-y-4`.

**Footer (passed to `SlideoverDrawer`):**
```jsx
<button
  type="submit"
  form="support-request-form"
  disabled={saving}
  className="w-full bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full py-3 transition-colors disabled:opacity-60"
>
  {saving ? 'Sending…' : 'Send Request'}
</button>
```

The `<form id="support-request-form" onSubmit={handleSubmit}>` wraps the fields in the drawer body so the footer button submits.

**Confirmation view (when `submitted === true`):**
Replace the form body with a success card (mirror `UpgradePage.jsx` lines 37–101 in tone, simpler):
```jsx
<div className="flex flex-col items-center text-center py-6">
  <div className="w-14 h-14 rounded-full bg-status-paid-bg flex items-center justify-center mb-4">
    <CheckCircle2 size={32} className="text-status-paid-text" />
  </div>
  <h3 className="text-lg font-bold text-text-primary mb-1.5">Request received</h3>
  <p className="text-sm text-text-secondary max-w-xs">
    Thank you. Our support team has been notified and will reach out via phone or email shortly.
  </p>
  {ticketId && (
    <p className="text-xs text-text-muted mt-4">Ticket ID: {ticketId}</p>
  )}
  <button
    type="button"
    onClick={onClose}
    className="mt-6 text-sm text-brand-primary font-medium hover:underline"
  >
    Close
  </button>
</div>
```

When `submitted === true`, render the confirmation view as the drawer body and pass `footer={null}` (so the Submit button + Cancel link disappear; the user's only action is the inline Close button).

**Outer shell:**
```jsx
<SlideoverDrawer
  open={open}
  onClose={onClose}
  title={submitted ? 'Support Request Sent' : 'Help & Support'}
  footer={submitted ? null : <SubmitButton />}
>
  {submitted ? <ConfirmationBody /> : <FormBody />}
</SlideoverDrawer>
```

### 4.2 Mount the help button + drawer globally

**Approach:** A single shared component wraps the floating button, the dropdown trigger logic, and the drawer mount. Mount it once in `AppShell` and once in `AdminShell`. This avoids duplicating drawer state management.

**File:** `mern-vb-frontend/src/components/support/HelpSupport.jsx` (new).

```jsx
import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import SupportRequestDrawer from './SupportRequestDrawer';

export default function HelpSupport({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Render-prop API: parents that need to trigger from a menu pass children as a function */}
      {typeof children === 'function' ? children(() => setOpen(true)) : null}

      {/* Floating help button (always rendered) — mobile + desktop */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Help and support"
        className="fixed z-40 bottom-24 right-4 md:bottom-6 md:right-6 w-12 h-12 rounded-full bg-brand-primary hover:bg-brand-hover text-white shadow-lg flex items-center justify-center transition-colors"
      >
        <LifeBuoy size={22} />
      </button>

      <SupportRequestDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

Notes on placement:
- `bottom-24` on mobile clears the `MobileBottomNav` (~88px tall) and the `AdminMobileBottomNav`.
- `bottom-6` on desktop sits just inside the viewport corner.
- `z-40` matches `TopBar`'s z-index — the drawer (z-50) will still cover it when open.
- The render-prop `children` is optional — used when the avatar dropdown needs a way to also open the drawer. See §4.3.

### 4.3 Wire into shells & avatar dropdown

**4.3a — `AppShell.jsx`** (`mern-vb-frontend/src/components/layout/AppShell.jsx`):

Add import:
```js
import HelpSupport from '../support/HelpSupport';
```

Inside the returned JSX, just before the closing `</div>` (after the modals block), add:
```jsx
<HelpSupport />
```

**4.3b — `AdminShell.jsx`** (`mern-vb-frontend/src/components/layout/AdminShell.jsx`):

Add the same import and the same `<HelpSupport />` line just before the closing `</div>`.

**4.3c — `TopBar.jsx`** — add a "Help & Support" item to the avatar dropdown menu.

This needs cross-component coordination because `HelpSupport` owns the drawer state. Two clean options; **use Option A** for simplicity:

**Option A (chosen):** Add a small global event. In `HelpSupport.jsx`, listen for `window.addEventListener('openSupport', () => setOpen(true))`. In `TopBar.jsx`, the menu item dispatches `window.dispatchEvent(new Event('openSupport'))`. This mirrors the existing `loanDataChanged` / event-bus pattern already used in this codebase (CLAUDE.md §State Management).

Modify `HelpSupport.jsx` — add this effect:
```js
import { useEffect } from 'react';
// ...
useEffect(() => {
  const handler = () => setOpen(true);
  window.addEventListener('openSupport', handler);
  return () => window.removeEventListener('openSupport', handler);
}, []);
```

Modify `TopBar.jsx`:
1. Add `LifeBuoy` to the `lucide-react` import line.
2. Add a new `DropdownMenuItem` between the "Account Settings" item and the separator above "Sign Out":
```jsx
<DropdownMenuItem
  onClick={() => window.dispatchEvent(new Event('openSupport'))}
  className="flex items-center gap-2"
>
  <LifeBuoy size={16} className="text-text-secondary" />
  Help & Support
</DropdownMenuItem>
```

Result:
- Mobile users see the floating FAB above the bottom nav.
- Desktop users see the FAB AND the dropdown item — both open the same drawer.
- Super admins get the same options on both `/dashboard` and `/admin/*` (since both shells mount `HelpSupport`).

### 4.4 Super-admin inbox page

**File:** `mern-vb-frontend/src/pages/admin/AdminSupportInbox.jsx` (new).

**Structural reference:** open `mern-vb-frontend/src/pages/admin/AdminAuditLog.jsx` and copy its layout skeleton (header, filter pill row, desktop table, mobile cards, pagination). Replace the data shape and column headers as below. Do NOT invent a new layout.

**Data fetch:**
```js
const { data } = await axios.get(`${API_BASE_URL}/admin/support`, {
  params: { status: statusFilter, category: categoryFilter, q: search, page, limit: 25 },
});
```

**Filter pills (status):** `All`, `Open`, `In Progress`, `Resolved`, `Closed`. Active pill uses `bg-brand-primary text-white`; inactive pills use `border border-border-default text-text-secondary hover:bg-surface-page` (mirror `AdminGroupsList.jsx` filter pill pattern).

**Search input:** placeholder `"Search by name, email, group, or description…"`. Debounce 300ms before refetching.

**Desktop table columns:**
| Column | Source field | Format |
|---|---|---|
| Submitted | `createdAt` | `dayjs(...).format('DD MMM, HH:mm')` |
| From | `name` + `email` (subline) | name in `text-text-primary`, email in `text-xs text-text-muted` |
| Group | `groupName` | dash if null |
| Category | `category` | human label via `CATEGORY_LABELS` |
| Status | `status` | coloured badge (see below) |
| Actions | — | "View" button opens detail drawer (§4.5) |

**Status badges:**
- `open` → `bg-status-overdue-bg text-status-overdue-text` "Open"
- `in_progress` → `bg-trial-bg text-trial-text` "In Progress"
- `resolved` → `bg-status-paid-bg text-status-paid-text` "Resolved"
- `closed` → `bg-surface-page text-text-secondary` "Closed"

**Mobile cards:** condensed two-line layout (name + status badge on row 1, category + group + relative time on row 2, description preview clipped to 2 lines on row 3). Tap opens the detail drawer.

**Pagination:** match the existing `AdminAuditLog` pagination component pattern. Show `Showing X–Y of Z`.

**Empty state:** centred icon + text "No support requests" + sub-line "When users submit a support request from inside the app, it will appear here."

### 4.5 Detail drawer (within the inbox page)

When a row's "View" is clicked, open a `SlideoverDrawer` that shows:
- Read-only summary (all fields from the document — name, email, phone, role, group, category, page, user-agent, full description, ticket ID, createdAt, notification status with green/red dots).
- **Status update form:**
  - `<select>` for status (the four enum values).
  - `<textarea>` for `resolutionNote` (optional, max 2000 chars, counter).
  - "Save" button → `PATCH /api/admin/support/:id` with `{ status, resolutionNote }`.
- On success: toast, refetch the list, close the drawer.
- On error: inline error banner inside the drawer (same styling as §4.1).

This should live as an inline component inside `AdminSupportInbox.jsx` (no need for a separate file — it's tightly coupled to the page). Total file length should still be readable; if it exceeds ~400 lines, extract `SupportRequestDetailDrawer.jsx` into the same `pages/admin/` directory.

### 4.6 Routing & sidebar nav

**4.6a — `App.jsx`:** add an import + a route, mirroring the existing `/admin/audit` line.

Import:
```js
import AdminSupportInbox from './pages/admin/AdminSupportInbox';
```

Route block — add after the `/admin/audit` route (around line 192–194):
```jsx
<Route path="/admin/support" element={
  <ProtectedRoute><SuperAdminRoute><AdminLayout><AdminSupportInbox /></AdminLayout></SuperAdminRoute></ProtectedRoute>
} />
```

**4.6b — `AdminSidebar.jsx`:** extend the `NAV_ITEMS` array. Add `LifeBuoy` to the lucide imports and a new entry:
```js
{ label: 'Support', to: '/admin/support', icon: LifeBuoy },
```
Position: between `All Groups` and `Super Admins`, OR at the end — whichever reads more cleanly. (Sonnet to choose; place it where a user would intuitively look.)

**4.6c — `AdminMobileBottomNav.jsx`:** **No change.** The mobile bottom nav already shows the four most-used admin sections; adding a fifth would crowd it. Mobile super admins can still navigate to `/admin/support` via the desktop sidebar (when on tablet+) or via the URL — and they have the floating FAB to *file* tickets, which is the primary mobile use-case. Listing is a desktop-leaning task.

### 4.7 Frontend tests

**File:** `mern-vb-frontend/src/__tests__/SupportRequestDrawer.test.jsx` (new).

Mirror an existing component test in `__tests__/`. Test cases:
1. Renders read-only Name and Email pre-filled from `useAuth` + `useUser`.
2. Clicking submit without phone shows inline error.
3. Clicking submit with phone but no category shows inline error.
4. Clicking submit with description < 5 chars shows inline error.
5. Successful POST: drawer transitions to confirmation view; ticket ID displays.
6. Failed POST: error banner displays; drawer stays on form view (no transition).

Mock `axios.post`. Wrap render in `MemoryRouter` if `useLocation` is invoked (it is — required for `pagePath`).

---

## 5. Step-by-Step Implementation Order

Sonnet must implement in this order. After each phase, run the relevant verification step (§6). Do not advance to the next phase until the previous one is green.

| Phase | Files | Verify |
|---|---|---|
| 1. Backend model | `models/SupportRequest.js` | `cd mern_vb_backend && pnpm test` (existing tests still pass) |
| 2. Backend controller + routes | `controllers/supportController.js`, `routes/support.js`, `server.js` mount, `routes/admin.js` extension | `cd mern_vb_backend && pnpm test` |
| 3. Backend tests | `tests/supportController.test.js` | `cd mern_vb_backend && pnpm test` — new tests pass |
| 4. Frontend drawer | `components/support/SupportRequestDrawer.jsx`, `components/support/HelpSupport.jsx` | `cd mern-vb-frontend && pnpm test` |
| 5. Frontend wiring | `AppShell.jsx`, `AdminShell.jsx`, `TopBar.jsx` | manual smoke: button visible, drawer opens, form submits |
| 6. Admin inbox page | `pages/admin/AdminSupportInbox.jsx`, `App.jsx` route, `AdminSidebar.jsx` nav item | manual smoke: super admin can reach `/admin/support`, sees the test ticket from phase 5 |
| 7. Frontend tests | `__tests__/SupportRequestDrawer.test.jsx` | `cd mern-vb-frontend && pnpm test` |
| 8. Verification loop | — | full §6 |

---

## 6. Verification Loop — Run Before Reporting Done

Per `CLAUDE.md` §Verification Loop. Run in order. Do not skip steps. Do not say "done" until all steps pass.

### Step 1 — Tests
```bash
cd mern_vb_backend && pnpm test && cd ../mern-vb-frontend && pnpm test
```
All tests must pass. If any fail — fix before proceeding.

### Step 2 — Financial audit
**Skip.** No financial logic was touched. (Confirm: the controller does not read or write `BankBalance`, `Loan`, `Saving`, `Fine`, or `Transaction`. If it does, you've gone wrong — go back.)

### Step 3 — Console.log sweep
```bash
grep -rn "console.log" mern_vb_backend/controllers/supportController.js mern_vb_backend/routes/support.js mern_vb_backend/models/SupportRequest.js
grep -rn "console.log" mern-vb-frontend/src/components/support mern-vb-frontend/src/pages/admin/AdminSupportInbox.jsx
```
Both must return zero matches.

### Step 4 — Hardcoded values check
The controller writes only the user-supplied fields plus identity from `req`. No hardcoded ZMW amounts, rates, or limits should appear in any new file. Confirm by inspection.

### Step 5 — Raw Tailwind colour audit (per UI_SPEC §12)
```bash
grep -nE "\\b(blue|red|green|yellow|gray|slate|zinc|neutral|stone)-[0-9]" \
  mern-vb-frontend/src/components/support/SupportRequestDrawer.jsx \
  mern-vb-frontend/src/components/support/HelpSupport.jsx \
  mern-vb-frontend/src/pages/admin/AdminSupportInbox.jsx
```
Must return zero matches. Only design-token classes (`brand-*`, `surface-*`, `text-primary|secondary|muted`, `border-default`, `status-*`, `trial-*`) are allowed.

### Step 6 — Manual smoke (golden path + edge cases)
1. **Submit a real ticket as a regular user** — sign in as a non-admin (or as William's regular member), click the FAB, fill the form (phone, category, description), submit. Confirm:
   - Drawer transitions to "Request received" with a Ticket ID.
   - A Telegram message arrives in the chat configured by `TELEGRAM_CHAT_ID` (it should — env vars are live in dev/prod).
   - An email arrives at `ADMIN_EMAIL` (if `RESEND_API_KEY` is set in this env).
2. **Open the inbox as super admin** — switch to platform admin, navigate to `/admin/support`. Confirm the ticket appears at the top.
3. **Transition status** — open the detail drawer, change status to "In Progress", add a resolution note, save. List refetches with updated status badge.
4. **Edge: expired-trial submit** — log in as a user whose group is on an expired trial. Confirm they can still open the FAB and submit (the request should NOT 403). This is the whole point of bypassing `checkTrial`.
5. **Edge: anonymous user** — log out. The FAB should NOT be visible (the entire `AppShell` is behind `ProtectedRoute`). If it is somehow reachable, the POST returns 401.
6. **Edge: dropdown trigger** — open the avatar dropdown on desktop, click "Help & Support", confirm the same drawer opens (event-bus wiring works).

### Step 7 — State the result
Per CLAUDE.md §Verification Loop Step 5, report:
```
✓ Tests passed (backend + frontend)
✓ Balance audit not applicable (no financial logic)
✓ No console.log statements
✓ No hardcoded financial values
✓ No raw Tailwind colours in new components
✓ Manual smoke: ticket submitted → Telegram + email fired → inbox shows ticket → status transition works
Ready to commit.
```
If anything is not clean, state what failed and fix it first.

---

## 7. Things NOT to Do (Explicit Guard List)

- **Do not** add a public unauthenticated endpoint for support. All routes require Clerk auth.
- **Do not** add `checkTrial` to the user-facing POST route — expired-trial users must be able to file tickets.
- **Do not** persist the user's full Clerk user object — only the snapshot fields enumerated in the schema.
- **Do not** reuse the `/api/billing/request` route by overloading it. Build a separate `/api/support/request`.
- **Do not** introduce a new toast library, drawer component, or form library. Reuse `sonner`, `SlideoverDrawer`, plain `useState` validation. Same precedent as `plan_settings_edit.md`.
- **Do not** add `react-hook-form` or `zod` here. Match the existing modal pattern.
- **Do not** add file uploads or attachments. Text-only is locked.
- **Do not** add a chat / threaded reply UI. Status + single resolution note is the v1 surface area.
- **Do not** mount the `/admin/support` route outside the `SuperAdminRoute` guard.
- **Do not** dispatch a `loanDataChanged` event after submit. Support requests don't change loan data.
- **Do not** auto-close the drawer while the POST is in flight, or on error.
- **Do not** auto-close the drawer on success — show the confirmation screen and let the user click Close. Mirror UpgradePage UX.
- **Do not** add backwards-compat shims, removed-code comments, or feature flags.
- **Do not** widen `RESEND_API_KEY` / `ADMIN_EMAIL` to be required. They remain optional, exactly as in `billingController.js`.
- **Do not** place the FAB in `Navbar.jsx` or in any individual page. Mount only in `AppShell` and `AdminShell`.
- **Do not** add the Support nav item to `AdminMobileBottomNav.jsx`.

---

## 8. Open Notes for the Executing Sonnet Session

- The render-prop API on `HelpSupport` (lines around §4.2) is currently unused — the dropdown uses the event bus instead. Either keep the render-prop hook for future flexibility or remove it; the executing session can decide. If removed, simplify the component accordingly.
- Telegram's HTML parse mode requires escaping `<`, `>`, `&` in user-supplied text. The description and free-form fields can contain these characters. Apply a small `escapeHtml(s)` helper inside `supportController.js` before interpolating into the message string. This is a security and reliability concern (a stray `<script>` in a description would break the message render and potentially the Telegram API call).
- The README mentions `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are already in production. Do not add new env vars for this feature. If `process.env.TELEGRAM_BOT_TOKEN` is unset (e.g. in tests), the controller should still create the DB record and return 201 — it just records `notifyError: 'telegram: TELEGRAM_BOT_TOKEN not set'` and skips the fetch. Treat the test env as a happy-path case for the DB write.
- `clerkClient` from `@clerk/express` is the way to fetch Clerk user details server-side when `req.member` is null (super-admin-without-group case). Sonnet should verify the import path against the version of `@clerk/express` in `mern_vb_backend/package.json` before using.
- Commit message style (per `feedback_commits` memory): conventional commit, no `Co-Authored-By` line. Suggested split:
  - `feat(support): add SupportRequest model + POST /api/support/request endpoint with Telegram + email`
  - `feat(support): add help button, drawer, and admin inbox`
  - Or one combined commit if the change set is cohesive: `feat(support): in-app help button, support requests, and admin inbox`.

---

## 9. Sanity Check — Does this plan work?

If a fresh Sonnet session reads only this file plus the eight files listed in §0, can they implement the feature without asking questions?

- ✅ Schema fully specified.
- ✅ Controller pseudocode included for all three handlers.
- ✅ Telegram message template provided verbatim.
- ✅ Frontend component skeletons include imports, state, validation rules, styling tokens.
- ✅ Routing changes specified down to the line.
- ✅ Test cases enumerated.
- ✅ Verification loop is the project-standard one.
- ✅ Things-not-to-do list traps the obvious yak shaves.

This plan is self-contained. Hand off.
