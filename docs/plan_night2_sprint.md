# Night 2 Implementation Plan — Member Invites & Upgrade/Billing Flow

**Date:** April 10, 2026
**Branch:** `feature/day5-trial-onboarding`
**Prereqs:** CLAUDE.md, UI_SPEC.md, NIGHT2_SPRINT.md read in full

---

## Current State Summary

What already exists (do NOT rebuild):
- **InviteToken model** (`models/InviteToken.js`) — JWT-based invite link system
- **inviteController.js** — `createInvite` (generates link), `getInvites` (lists pending), `acceptInvite` (JWT verify + GroupMember create)
- **invites route** (`routes/invites.js`) — `POST /api/invites`, `GET /api/invites`, `POST /api/invites/accept`
- **SlideoverDrawer** (`components/ui/SlideoverDrawer.jsx`) — responsive right-side/bottom-sheet drawer
- **checkTrial middleware** — trial enforcement with read-only mode on expiry
- **Group model** — has `isPaid`, `trialExpiresAt`, `slug`, `clerkAdminId`
- **GroupMember model** — has `clerkUserId`, `groupId`, `role`, `name`, `phone`, `email`, `active`
- **TrialBanner** — exists with static "Upgrade" buttons (not wired to `/upgrade`)
- **Settings page** — has a Billing section with static "Upgrade" button (not wired)
- **Users.jsx** — old-style user management page (legacy JWT era), used for both `/users` and `/members` routes

What does NOT exist yet:
- PendingInvite model (Clerk email-based invites, different from link-based InviteToken)
- Clerk webhook handler (webhookRoutes.js)
- Billing controller/routes
- `/upgrade` frontend page
- Proper Members page (distinct from legacy Users.jsx)
- `paymentDetails.js` config
- `paidUntil` field on Group model

---

## Execution Order

### Phase 1 — Backend: Member Invites via Clerk Email (Steps 1–4)

#### Step 1: Create PendingInvite model

**File:** `mern_vb_backend/models/PendingInvite.js` (NEW)

```js
const mongoose = require('mongoose');

const pendingInviteSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  role: { type: String, enum: ['member', 'treasurer', 'loan_officer'], required: true },
  invitedBy: { type: String, required: true }, // clerkUserId of sender
  clerkInvitationId: { type: String },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
}, { timestamps: true });

// Prevent duplicate pending invites for same email+group
pendingInviteSchema.index({ email: 1, groupId: 1 }, { unique: true });

// Auto-delete expired invites
pendingInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PendingInvite', pendingInviteSchema);
```

#### Step 2: Add email invite endpoint to existing invites route

**File:** `mern_vb_backend/controllers/inviteController.js` (MODIFY — add `inviteByEmail` function)

Add at bottom of existing file:

```js
const PendingInvite = require('../models/PendingInvite');

exports.inviteByEmail = async (req, res) => {
  try {
    const { email, name, role } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'email and name are required' });
    }

    const allowedRoles = ['member', 'treasurer', 'loan_officer'];
    const inviteRole = allowedRoles.includes(role) ? role : 'member';

    // Check role permission — only admin, treasurer, loan_officer can invite
    if (req.role === 'member') {
      return res.status(403).json({ error: 'Members cannot send invites' });
    }

    // Check no existing pending invite for this email+group
    const existingInvite = await PendingInvite.findOne({
      email: email.toLowerCase().trim(),
      groupId: req.groupId,
    });
    if (existingInvite) {
      return res.status(409).json({ error: 'An invite is already pending for this email' });
    }

    // Check email is not already a GroupMember of this group
    const existingMember = await GroupMember.findOne({
      email: email.toLowerCase().trim(),
      groupId: req.groupId,
    });
    if (existingMember) {
      return res.status(409).json({ error: 'This email is already a member of your group' });
    }

    // Call Clerk Invitation API
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://villagebanking.netlify.app';
    const clerkResponse = await fetch('https://api.clerk.com/v1/invitations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_address: email.toLowerCase().trim(),
        redirect_url: `${FRONTEND_URL}/sign-up`,
        public_metadata: {
          groupId: req.groupId.toString(),
          role: inviteRole,
          name,
        },
      }),
    });

    if (!clerkResponse.ok) {
      const errData = await clerkResponse.json();
      return res.status(400).json({
        error: 'Failed to send Clerk invitation',
        details: errData.errors?.[0]?.message || 'Unknown Clerk error',
      });
    }

    const clerkData = await clerkResponse.json();

    // Store PendingInvite
    const { userId: clerkUserId } = getAuth(req);
    await PendingInvite.create({
      email: email.toLowerCase().trim(),
      groupId: req.groupId,
      role: inviteRole,
      invitedBy: clerkUserId,
      name,
      clerkInvitationId: clerkData.id,
    });

    res.status(201).json({ message: `Invite sent to ${email}` });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An invite is already pending for this email' });
    }
    res.status(500).json({ error: 'Failed to send invite', details: err.message });
  }
};

exports.getPendingInvites = async (req, res) => {
  try {
    const invites = await PendingInvite.find({
      groupId: req.groupId,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending invites', details: err.message });
  }
};
```

**File:** `mern_vb_backend/routes/invites.js` (MODIFY — add two routes)

Add before `module.exports`:
```js
// Clerk email-based invites
router.post('/email', verifyToken, resolveGroup, inviteController.inviteByEmail);
router.get('/pending', verifyToken, resolveGroup, inviteController.getPendingInvites);
```

#### Step 3: Create Clerk webhook handler

**File:** `mern_vb_backend/routes/webhookRoutes.js` (NEW)

```js
const express = require('express');
const router = express.Router();
const { Webhook } = require('svix');
const GroupMember = require('../models/GroupMember');
const PendingInvite = require('../models/PendingInvite');

router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Verify webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt;
  try {
    evt = wh.verify(req.body, {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const { type, data } = evt;

  if (type === 'user.created') {
    try {
      const email = data.email_addresses?.[0]?.email_address;
      const clerkUserId = data.id;

      if (!email) return res.status(200).json({ received: true });

      // Look for a PendingInvite matching this email
      const invite = await PendingInvite.findOne({
        email: email.toLowerCase().trim(),
      });

      if (invite) {
        // Check they're not already a member
        const existing = await GroupMember.findOne({
          clerkUserId,
          groupId: invite.groupId,
        });

        if (!existing) {
          await GroupMember.create({
            clerkUserId,
            groupId: invite.groupId,
            role: invite.role,
            name: invite.name,
            email: email.toLowerCase().trim(),
          });
        }

        // Delete the pending invite
        await PendingInvite.deleteOne({ _id: invite._id });
      }
    } catch (err) {
      // Log but don't fail the webhook — Clerk will retry
      console.error('Webhook user.created error:', err.message);
    }
  }

  res.status(200).json({ received: true });
});

module.exports = router;
```

**Install dependency:**
```bash
cd mern_vb_backend && pnpm add svix
```

#### Step 4: Register webhook route in server.js

**File:** `mern_vb_backend/server.js` (MODIFY)

The webhook route MUST be registered BEFORE `express.json()` because it needs the raw body for signature verification.

Change the middleware section from:
```js
app.use(cors({ ... }));
app.use(express.json());
app.use(clerkMiddleware(...));
```

To:
```js
app.use(cors({ ... }));

// Webhook routes MUST come before express.json() — they need raw body
app.use('/api/webhooks', require('./routes/webhookRoutes'));

app.use(express.json());
app.use(clerkMiddleware(...));
```

Also add the billing route registration (from Phase 3) at the same time:
```js
app.use('/api/billing', require('./routes/billingRoutes'));
```

---

### Phase 2 — Backend: Group Model + Trial Updates (Steps 5–7)

#### Step 5: Add `paidUntil` field to Group model

**File:** `mern_vb_backend/models/Group.js` (MODIFY)

Add field to the schema:
```js
paidUntil: { type: Date, default: null },
```

#### Step 6: Update checkTrial middleware

**File:** `mern_vb_backend/middleware/checkTrial.js` (MODIFY)

Change the `isPaid` block (around line 24):
```js
// FROM:
if (group.isPaid) {
  req.trialActive = true;
  return next();
}

// TO (backwards-compatible — null paidUntil still passes):
if (group.isPaid) {
  if (!group.paidUntil || group.paidUntil > new Date()) {
    req.trialActive = true;
    return next();
  }
  // isPaid but paidUntil is in the past — subscription lapsed
  // Fall through to trial expiry logic below
}
```

**Why this shape:** A strict `isPaid && paidUntil && paidUntil > now` check would break any existing paid group whose `paidUntil` is still `null` (including William's group before the script runs). By treating `null` as "legacy paid, no expiry set", the deploy order of the middleware vs. the `markWilliamPaid` script no longer matters. Three cases:
- `isPaid: true` + `paidUntil: null` → full access (backwards-compatible)
- `isPaid: true` + `paidUntil: future` → full access (new paying groups)
- `isPaid: true` + `paidUntil: past` → subscription lapsed, falls through to trial/read-only logic

#### Step 7: Update markWilliamPaid script

**File:** `mern_vb_backend/scripts/markWilliamPaid.js` (MODIFY)

Change the `$set` object:
```js
// FROM:
{ $set: { trialExpiresAt: new Date('2099-12-31'), isPaid: true } }

// TO:
{ $set: { trialExpiresAt: new Date('2099-12-31'), isPaid: true, paidUntil: new Date('2099-01-01') } }
```

**After modifying:** Run the script to update William's group in the database:
```bash
cd mern_vb_backend && node scripts/markWilliamPaid.js
```

---

### Phase 3 — Backend: Billing/Upgrade (Steps 8–10)

#### Step 8: Install resend

```bash
cd mern_vb_backend && pnpm add resend
```

#### Step 9: Create payment details config

**File:** `mern_vb_backend/config/paymentDetails.js` (NEW)

```js
// IMPORTANT: Fill in your actual payment details before deploying to production
module.exports = {
  airtelMoney: 'YOUR_AIRTEL_NUMBER',
  mtnMomo: 'YOUR_MTN_NUMBER',
  bankName: 'YOUR_BANK_NAME',
  bankAccount: 'YOUR_ACCOUNT_NUMBER',
  bankBranch: 'YOUR_BRANCH',
  whatsapp: 'YOUR_WHATSAPP_NUMBER',
};
```

#### Step 10: Create billing controller and route

**File:** `mern_vb_backend/controllers/billingController.js` (NEW)

```js
const { Resend } = require('resend');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const { getAuth } = require('@clerk/express');

const resend = new Resend(process.env.RESEND_API_KEY);

exports.requestUpgrade = async (req, res) => {
  try {
    const { planName, planPrice, phone } = req.body;
    if (!planName || !planPrice || !phone) {
      return res.status(400).json({ error: 'planName, planPrice, and phone are required' });
    }

    const { userId: clerkUserId } = getAuth(req);

    // Find the member and their group
    const member = await GroupMember.findOne({ clerkUserId });
    if (!member) {
      return res.status(404).json({ error: 'No group membership found' });
    }

    const group = await Group.findById(member.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const trialExpiry = group.trialExpiresAt
      ? group.trialExpiresAt.toISOString().split('T')[0]
      : 'N/A';

    const messageText = `🔔 <b>New Upgrade Request</b>\n\n` +
      `<b>Group:</b> ${group.name}\n` +
      `<b>Plan:</b> ${planName} — ZMW ${planPrice}/month\n` +
      `<b>Admin:</b> ${member.name}\n` +
      `<b>Email:</b> ${member.email || 'Not provided'}\n` +
      `<b>Phone:</b> ${phone}\n` +
      `<b>Trial expires:</b> ${trialExpiry}\n\n` +
      `✅ Action: Log in to MongoDB Atlas and set:\nisPaid: true\npaidUntil: [today + 30 days]`;

    // Send Telegram message
    const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: messageText,
        parse_mode: 'HTML',
      }),
    });

    // Send email via Resend
    if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
      await resend.emails.send({
        from: 'Chama360 <onboarding@resend.dev>',
        to: process.env.ADMIN_EMAIL,
        subject: `Upgrade Request — ${group.name} (${planName})`,
        html: messageText.replace(/\n/g, '<br>'),
      });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process upgrade request', details: err.message });
  }
};
```

**File:** `mern_vb_backend/routes/billingRoutes.js` (NEW)

```js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const billingController = require('../controllers/billingController');

router.post('/request', verifyToken, billingController.requestUpgrade);

module.exports = router;
```

**File:** `mern_vb_backend/server.js` — already handled in Step 4 (add `app.use('/api/billing', ...)`).

---

### Phase 4 — Frontend: Members Page Rebuild (Steps 11–12)

The existing `Users.jsx` is legacy (username/password era). The `/members` route needs a new component that works with Clerk + GroupMembers.

#### Step 11: Create Members page

**File:** `mern-vb-frontend/src/pages/MembersPage.jsx` (NEW)

This page should:
- Fetch group members from `GET /api/invites` (active members) or a members endpoint
- Display member list using the UI_SPEC.md transaction row pattern (avatar + name + role badge)
- Show "+ Invite Member" button in top-right (primary orange pill per UI_SPEC.md `--color-brand-primary`, `--radius-full`)
- On button click: open SlideoverDrawer with invite form
- Below the active members list: "Pending Invites" section

**Invite drawer contents:**
- Title: "Invite Member"
- Fields: Full Name (text), Email Address (email), Role (select: Member/Treasurer/Loan Officer)
- Footer: "Send Invite" primary button + "Cancel" link
- On submit: `POST /api/invites/email` → success: close drawer + toast "Invite sent to [email]" → error: show inline error, do NOT close drawer

**Pending Invites section:**
- Fetch from `GET /api/invites/pending`
- Display as simple list: email + role badge + "Pending" status badge (amber per UI_SPEC `--color-status-pending-bg/text`) + date sent
- No action buttons needed

**Avatar colours:** Use the `AVATAR_COLORS` array from UI_SPEC.md section 2.3.

#### Step 12: Update App.jsx routing

**File:** `mern-vb-frontend/src/App.jsx` (MODIFY)

Change the `/members` route to render `<MembersPage />` instead of `<Users />`.

Import at top:
```js
import MembersPage from './pages/MembersPage';
```

The `/users` route can keep rendering `<Users />` (legacy admin page).

---

### Phase 5 — Frontend: Upgrade Page (Steps 13–15)

#### Step 13: Create /upgrade page

**File:** `mern-vb-frontend/src/pages/UpgradePage.jsx` (NEW)

**Layout:**
- Back arrow link to `/dashboard`
- Page title: "Choose Your Plan" (`--text-display`, 28px, weight 700)
- Subtitle: "Start with a 30-day paid subscription. Cancel anytime." (`--text-body`, `--color-text-secondary`)

**Two plan cards** (side by side desktop, stacked mobile — use `grid grid-cols-1 md:grid-cols-2 gap-6`):

Card 1 — Starter:
- `--color-bg-card` bg, `--radius-lg` border radius
- "Starter" heading
- "ZMW 150 / month" (`--text-amount`, weight 700)
- Feature list: Up to 15 members, Savings tracking, Loan management, Financial reports, PDF & Excel exports
- "Subscribe" button (secondary/ghost style)

Card 2 — Standard (recommended):
- Same card style + `border-2` with `--color-brand-primary` (orange border highlight)
- "Recommended" badge top-right corner
- "ZMW 250 / month"
- Feature list: Up to 40 members, Everything in Starter, Priority support
- "Subscribe" button (primary style)

**On Subscribe click:**
- Replace the button area with an inline form (slide/fade transition):
  - Name (pre-filled from Clerk user via `useUser()`)
  - Email (pre-filled, read-only)
  - Phone number (editable, required)
  - "Confirm Subscription Request" primary button

**On form submit:**
- `POST /api/billing/request` with `{ planName, planPrice, phone }`
- Replace entire page content with confirmation screen:
  - Checkmark icon
  - "Request Received" heading
  - Thank you message with user name and plan name
  - Payment instructions box with Airtel Money, MTN MoMo, Bank Transfer placeholders
  - Reference: "[groupName] - [planName]"
  - "Your account will be activated within 24 hours of payment confirmation."
  - WhatsApp contact line

**Note:** Payment details are hardcoded as placeholders for now. A future step can fetch them from the backend config, but for this sprint just put placeholder strings that William replaces before deploy.

#### Step 14: Add /upgrade route to App.jsx

**File:** `mern-vb-frontend/src/App.jsx` (MODIFY)

Add import:
```js
import UpgradePage from './pages/UpgradePage';
```

Add route (inside the protected routes section):
```jsx
<Route path="/upgrade" element={<UpgradePage />} />
```

#### Step 15: Wire upgrade buttons

**File:** `mern-vb-frontend/src/pages/Settings.jsx` (MODIFY)

Find the "Upgrade" button in the Billing section. Add `onClick` or wrap in `<Link to="/upgrade">`.

**File:** `mern-vb-frontend/src/components/TrialBanner.jsx` (MODIFY)

Find both "Upgrade" and "Upgrade Now" buttons. Wire them to navigate to `/upgrade` using `useNavigate()` from react-router-dom.

**File:** `mern-vb-frontend/src/components/layout/DesktopSidebar.jsx` (MODIFY)

Find the sidebar trial card "Upgrade" button. Wire to `/upgrade`.

---

## Dependency Installation Summary

```bash
cd mern_vb_backend && pnpm add svix resend
```

No new frontend dependencies needed.

---

## Files Created (6)

| # | Path | Purpose |
|---|------|---------|
| 1 | `mern_vb_backend/models/PendingInvite.js` | Clerk email invite tracking |
| 2 | `mern_vb_backend/routes/webhookRoutes.js` | Clerk webhook handler |
| 3 | `mern_vb_backend/controllers/billingController.js` | Upgrade request → Telegram + email |
| 4 | `mern_vb_backend/routes/billingRoutes.js` | Billing API routes |
| 5 | `mern_vb_backend/config/paymentDetails.js` | Payment details placeholder |
| 6 | `mern-vb-frontend/src/pages/UpgradePage.jsx` | Pricing + subscription page |

## Files Modified (8)

| # | Path | Change |
|---|------|--------|
| 1 | `mern_vb_backend/controllers/inviteController.js` | Add `inviteByEmail`, `getPendingInvites` |
| 2 | `mern_vb_backend/routes/invites.js` | Add `/email` and `/pending` routes |
| 3 | `mern_vb_backend/server.js` | Add webhook route (before express.json), add billing route |
| 4 | `mern_vb_backend/models/Group.js` | Add `paidUntil` field |
| 5 | `mern_vb_backend/middleware/checkTrial.js` | Use `paidUntil` in paid bypass check |
| 6 | `mern_vb_backend/scripts/markWilliamPaid.js` | Add `paidUntil: 2099` |
| 7 | `mern-vb-frontend/src/App.jsx` | Add `/upgrade` route, update `/members` to use MembersPage |
| 8 | `mern-vb-frontend/src/pages/Settings.jsx` | Wire Upgrade button to `/upgrade` |
| 9 | `mern-vb-frontend/src/components/TrialBanner.jsx` | Wire Upgrade buttons to `/upgrade` |
| 10 | `mern-vb-frontend/src/components/layout/DesktopSidebar.jsx` | Wire sidebar Upgrade to `/upgrade` |

## Files NOT modified (existing Members page)

The `/members` route currently renders `<Users />` (legacy). Rather than create a brand-new `MembersPage.jsx`, evaluate whether to refactor `Users.jsx` in place. Decision: **create new `MembersPage.jsx`** because `Users.jsx` is legacy JWT-era code with username/password fields that don't apply to the Clerk auth system.

---

## Execution Sequence for Sonnet

1. Install deps: `cd mern_vb_backend && pnpm add svix resend`
2. Create `PendingInvite.js` model (Step 1)
3. Modify `inviteController.js` — add `inviteByEmail` + `getPendingInvites` (Step 2)
4. Modify `routes/invites.js` — add new routes (Step 2)
5. Create `routes/webhookRoutes.js` (Step 3)
6. Modify `server.js` — add webhook route before `express.json()`, add billing route (Step 4)
7. Modify `models/Group.js` — add `paidUntil` (Step 5)
8. Modify `middleware/checkTrial.js` — update paid bypass (Step 6)
9. Modify `scripts/markWilliamPaid.js` — add `paidUntil` (Step 7)
10. Run `node scripts/markWilliamPaid.js` to update William's group
11. Create `config/paymentDetails.js` (Step 9)
12. Create `controllers/billingController.js` (Step 10)
13. Create `routes/billingRoutes.js` (Step 10)
14. Create `pages/MembersPage.jsx` with invite drawer + pending invites (Step 11)
15. Create `pages/UpgradePage.jsx` with plan cards + subscription form + confirmation (Step 13)
16. Modify `App.jsx` — add routes (Steps 12 + 14)
17. Wire upgrade buttons in Settings, TrialBanner, DesktopSidebar (Step 15)
18. Run verification loop per CLAUDE.md

---

## Risks & Gotchas

1. **Webhook raw body:** The `/api/webhooks` route MUST be registered before `express.json()` middleware in server.js. If it's after, `req.body` will be parsed JSON and svix signature verification will fail.

2. **checkTrial + paidUntil timing:** Mitigated. The middleware treats `paidUntil: null` as "legacy paid, no expiry" so deploy order doesn't matter. Steps 6 and 7 can land independently. Still recommended to run `markWilliamPaid` promptly for cleanliness, but it's no longer a prerequisite.

3. **Clerk API key:** The `inviteByEmail` function calls the Clerk API using `process.env.CLERK_SECRET_KEY`. This key already exists in `.env` for `@clerk/express`. No new env var needed.

4. **ADMIN_EMAIL env var:** The billing controller sends email to `process.env.ADMIN_EMAIL`. William must add this to `.env` before testing the upgrade flow. The code gracefully skips the email if the var is missing (Telegram still sends).

5. **No financial logic touched:** This sprint does not modify any calculation, payment, or balance code. No balance audit needed.

---

Is this plan self-contained for a fresh Sonnet session?
