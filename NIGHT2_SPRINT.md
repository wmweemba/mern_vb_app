# Night 2 Sprint — Member Invites & Upgrade/Billing Flow
### Chama360 | April 2026

---

## Instructions for Opus (Planning)

Read `CLAUDE.md` and `UI_SPEC.md` in full before writing the plan.

Write a self-contained implementation plan for tonight's sprint covering both tracks below. The plan must be detailed enough that a fresh Sonnet session can execute it step by step without asking clarifying questions.

For each step, specify:
- Exact file to create or modify
- What to add or change
- Any dependencies to install

End your plan with: "Is this plan self-contained for a fresh Sonnet session?"

---

## Context

The following environment variables have already been added to `.env` — do not ask about them, do not scaffold them, assume they exist:

```
RESEND_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
CLERK_WEBHOOK_SECRET
```

Clerk webhook endpoint is registered in the Clerk Dashboard pointing to Svix Play for testing. The webhook signing secret is stored as `CLERK_WEBHOOK_SECRET`.

The backend uses Express + MongoDB/Mongoose. Auth is handled by Clerk. The existing middleware chain is: `requireAuth` (Clerk) → `resolveGroup` (attaches req.groupId + req.role) → `checkTrial` (blocks writes if trial expired).

The `Group` model currently has `isPaid: Boolean` and `trialExpiresAt: Date`. There is no `paidUntil` field yet.

UI components `SlideoverDrawer` and `MemberSelect` were built in Night 1 and are available for reuse.

---

## Track 1 — Member Invites

### What to build

Allow Admin, Treasurer, and Loan Officer roles to invite new members to their group via email. Clerk sends the invite email. On signup, the new user is automatically added as a GroupMember with the role that was pre-assigned at invite time.

### Backend steps

**1. Create PendingInvite model**

File: `mern_vb_backend/models/PendingInvite.js`

Fields:
```js
{
  email: { type: String, required: true, lowercase: true, trim: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  role: { type: String, enum: ['member', 'treasurer', 'loan_officer'], required: true },
  invitedBy: { type: String, required: true }, // clerkUserId of sender
  clerkInvitationId: { type: String }, // returned by Clerk API
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
}
```

**2. Create invite route**

File: `mern_vb_backend/routes/memberRoutes.js` (add to existing file)
Controller: `mern_vb_backend/controllers/memberController.js` (add `inviteMember` function)

Route: `POST /api/members/invite`
Middleware: `requireAuth`, `resolveGroup`
Access: roles `admin`, `treasurer`, `loan_officer` only — reject `member` role with 403

Logic:
- Validate email, name, role fields are present
- Check no active PendingInvite already exists for this email + groupId combination
- Check the email is not already a GroupMember of this group
- Call Clerk Invitation API:
  ```
  POST https://api.clerk.com/v1/invitations
  Authorization: Bearer CLERK_SECRET_KEY
  Body: { email_address, redirect_url: FRONTEND_URL + '/sign-up' }
  ```
- Store PendingInvite with the clerkInvitationId returned
- Return 201 with success message

**3. Create or extend Clerk webhook handler**

First check: does `mern_vb_backend/routes/webhookRoutes.js` or similar exist? If yes, extend it. If no, create it.

File: `mern_vb_backend/routes/webhookRoutes.js`
Route: `POST /api/webhooks/clerk`

This route must:
- Use `express.raw({ type: 'application/json' })` as middleware — NOT `express.json()`. Webhook signature verification requires the raw body.
- Verify the webhook signature using the `svix` npm package:
  ```js
  const { Webhook } = require('svix');
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
  const evt = wh.verify(rawBody, headers); // throws if invalid
  ```
- Handle `user.created` event:
  - Extract `email_addresses[0].email_address` and `id` (clerkUserId) from the event data
  - Query MongoDB for a PendingInvite matching that email
  - If found: create a GroupMember record using the stored groupId and role, then delete the PendingInvite
  - If not found: do nothing (user signed up organically, not via invite)
- Handle `invitation.accepted` event as a fallback (optional but good to have — log it)
- Return 200 in all cases to acknowledge receipt

Install if not already present: `svix` npm package

Register this route in `server.js` BEFORE the `express.json()` middleware so the raw body is preserved:
```js
app.use('/api/webhooks', require('./routes/webhookRoutes'));
app.use(express.json()); // this must come AFTER webhook route
```

**4. Update Group model**

File: `mern_vb_backend/models/Group.js`

Add field:
```js
paidUntil: { type: Date, default: null }
```

**5. Update checkTrial middleware**

File: `mern_vb_backend/middleware/checkTrial.js`

Change the isPaid bypass check from:
```js
if (group.isPaid) return next();
```
To:
```js
if (group.isPaid && group.paidUntil && group.paidUntil > new Date()) return next();
```

**6. Update markWilliamPaid script**

File: `mern_vb_backend/scripts/markWilliamPaid.js`

Add `paidUntil: new Date('2099-01-01')` to the update so William's group is never affected by the expiry check.

### Frontend steps

**7. Invite drawer on Members page**

File: wherever the Members page component lives (check CLAUDE.md for path)

Add "+ Invite Member" button — top right of the Members page, primary orange pill button style per UI_SPEC.md.

On click: open a SlideoverDrawer (reuse existing component) with title "Invite Member" containing:
- Name field (text input, label: "Full Name")
- Email field (email input, label: "Email Address")
- Role selector (select input, label: "Role", options: Member / Treasurer / Loan Officer)
- Footer: "Send Invite" primary button + "Cancel" link

On submit:
- POST to `/api/members/invite`
- Success: close drawer, show toast "Invite sent to [email]"
- Error: show inline error message in the drawer, do not close

**8. Pending invites list**

Below the active members list on the Members page, add a "Pending Invites" section. Fetch from a new route `GET /api/members/invites` (build this route — returns all PendingInvites for the current group). Display as a simple list: email + role badge + "Pending" status badge + date sent. No actions needed for now.

---

## Track 2 — Upgrade / Billing Flow

### What to build

When a user on a free trial clicks "Upgrade", they land on a pricing page, select a plan, submit their contact details, and receive payment instructions. You (William) receive an instant Telegram message and email with the group's details so you can manually activate their account after payment.

### Backend steps

**1. Install dependencies**

```
npm install resend
```

Telegram uses the native `fetch` (Node 18+) or `axios` — no extra package needed.

**2. Create billing route**

File: `mern_vb_backend/routes/billingRoutes.js` (new file)
Controller: `mern_vb_backend/controllers/billingController.js` (new file)

Route: `POST /api/billing/request`
Middleware: `requireAuth` only (no resolveGroup needed — we fetch the group from the token)

Logic:
- Accept body: `{ planName, planPrice, phone }`
- Fetch the group and admin details from the database using the clerkUserId from the auth token
- Send Telegram message via Bot API:
  ```
  POST https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage
  Body: {
    chat_id: TELEGRAM_CHAT_ID,
    text: formatted message (see below),
    parse_mode: 'HTML'
  }
  ```
  Message format:
  ```
  🔔 <b>New Upgrade Request</b>

  <b>Group:</b> [groupName]
  <b>Plan:</b> [planName] — ZMW [planPrice]/month
  <b>Admin:</b> [adminName]
  <b>Email:</b> [adminEmail]
  <b>Phone:</b> [phone]
  <b>Trial expires:</b> [trialExpiresAt]

  ✅ Action: Log in to MongoDB Atlas and set:
  isPaid: true
  paidUntil: [today + 30 days]
  ```
- Send email via Resend:
  ```js
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Chama360 <onboarding@resend.dev>', // use resend dev domain until custom domain is set up
    to: process.env.ADMIN_EMAIL, // add ADMIN_EMAIL to .env — William's email address
    subject: `Upgrade Request — ${groupName} (${planName})`,
    html: same content as Telegram message formatted as HTML email
  });
  ```
- Return 200 `{ success: true }`

Add `ADMIN_EMAIL` to the list of required env vars. William adds his email to `.env`.

**3. Register billing routes**

File: `mern_vb_backend/server.js`

Add: `app.use('/api/billing', require('./routes/billingRoutes'));`

### Frontend steps

**4. Create /upgrade page**

File: create new page component at the appropriate frontend path (check CLAUDE.md for routing pattern)
Route: `/upgrade`

Page layout (follows UI_SPEC.md design system throughout):

**Header:**
- Back arrow link to dashboard
- Page title: "Choose Your Plan"
- Subtitle: "Start with a 30-day paid subscription. Cancel anytime."

**Two plan cards side by side (stacked on mobile):**

Starter card:
```
ZMW 150 / month
Up to 15 members
Savings tracking
Loan management
Financial reports
PDF & Excel exports
```

Standard card (recommended — highlight with brand orange border):
```
ZMW 250 / month
Up to 40 members
Everything in Starter
Priority support
```

Each card has a "Subscribe" button at the bottom.

**On Subscribe click — show subscription form (inline, replaces the button):**
- Name (pre-filled from Clerk user if available)
- Email (pre-filled from Clerk user, read-only)
- Phone number (editable, required)
- "Confirm Subscription Request" primary button

**On form submit:**
- POST to `/api/billing/request`
- Replace the entire page content with a confirmation screen:

```
✓  Request Received

Thank you, [name]. Your subscription request for the 
[Plan Name] plan has been received.

--- Payment Instructions ---

Please send ZMW [amount] to one of the following:

Airtel Money:   [William's Airtel number — hardcode from .env or config]
MTN MoMo:       [William's MTN number — hardcode from .env or config]
Bank Transfer:  [William's bank details — hardcode from .env or config]

Reference:      [groupName] - [planName]

Your account will be activated within 24 hours of 
payment confirmation.

Questions? WhatsApp: [William's number]
```

Note: William must add his payment details to a config file or .env before deploying. Create a `mern_vb_backend/config/paymentDetails.js` file with placeholder values and a comment telling William to fill them in.

**5. Wire upgrade buttons**

Find and update:
- Trial banner "Upgrade" button → navigate to `/upgrade`
- Settings page Billing section "Upgrade" button → navigate to `/upgrade`

Both should only show when `group.isPaid === false` OR `group.paidUntil < new Date()`.

---

## Payment Details Config (William fills in before deploy)

File to create: `mern_vb_backend/config/paymentDetails.js`

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

---

## Definition of Done

Night 2 is complete when:

- [ ] PendingInvite model exists and is registered
- [ ] `POST /api/members/invite` creates a Clerk invitation and stores a PendingInvite
- [ ] Clerk webhook handler verifies signatures and processes `user.created` events
- [ ] Invited user who signs up via the Clerk link is automatically added as a GroupMember with the correct role
- [ ] Members page has "+ Invite Member" button that opens the SlideoverDrawer
- [ ] Pending invites section shows below active members list
- [ ] `Group` model has `paidUntil` field
- [ ] `checkTrial` middleware uses `paidUntil` for the paid bypass check
- [ ] `markWilliamPaid` script sets `paidUntil: 2099`
- [ ] `POST /api/billing/request` sends both Telegram message and Resend email
- [ ] `/upgrade` page renders with two plan cards
- [ ] Subscription form submits and shows confirmation screen with payment details
- [ ] Upgrade buttons in trial banner and settings are wired to `/upgrade`
- [ ] `paymentDetails.js` config file exists with placeholder values

---

## Do Not Do

- Do not build a real payment gateway or MoMo webhook integration
- Do not auto-activate accounts — activation is always manual by William via Atlas
- Do not use `express.json()` on the webhook route — use `express.raw()` to preserve the raw body for signature verification
- Do not close the invite drawer on error — show the error inline
- Do not remove the existing `isPaid` field from the Group model — keep it, just add `paidUntil` alongside it
- Do not change any loan calculation, savings, or reporting logic

---

*Sprint date: April 2026*
*Repo: mern_vb_app*
*Previous sprint: v2.6.0 (UI overhaul completed Night 1)*
