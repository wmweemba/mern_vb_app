# Manual Payment Flow — Discovery Report

**Project:** Chama360 (Village Banking App)  
**Audit date:** 2026-06-14  
**Status:** Read-only discovery — no files modified

---

## 1. Overview

Chama360 uses a fully manual payment confirmation flow for subscription upgrades. There is no payment gateway integration (no Stripe, Paystack, or MTN API). Instead:

1. A customer selects a plan and submits a subscription request through the app.
2. The backend sends the developer a **Telegram message** and an **email** with the customer's group details and plan choice.
3. The customer is shown static payment instructions (Airtel Money, MTN MoMo, bank account).
4. The customer transfers money manually outside the app.
5. The developer verifies the transfer manually and then activates the group's subscription through the admin panel.

The admin panel activation sets `isPaid: true` and a `paidUntil` date on the Group document, which unlocks full write access for that group on next login.

---

## 2. File Map

| File | Role |
|------|------|
| `mern-vb-frontend/src/pages/UpgradePage.jsx` | Customer-facing subscription page — plan selection, form, confirmation screen |
| `mern-vb-frontend/src/components/admin/BillingActivationDrawer.jsx` | Super-admin drawer — manual billing activation UI |
| `mern-vb-frontend/src/pages/admin/AdminGroupDetail.jsx` | Admin group detail page — hosts the Billing tab and the activation drawer trigger |
| `mern_vb_backend/controllers/billingController.js` | Handles `POST /api/billing/request` — validates request, sends Telegram + email notifications |
| `mern_vb_backend/routes/billingRoutes.js` | Express route definitions for `/api/billing/*` |
| `mern_vb_backend/controllers/adminBillingController.js` | Admin-only billing operations — activate, mark-unpaid, list plans |
| `mern_vb_backend/routes/admin.js` | Admin API routes including `/api/admin/groups/:groupId/billing/activate` |
| `mern_vb_backend/models/Group.js` | Mongoose schema — holds `isPaid`, `paidUntil`, `trialExpiresAt` |
| `mern_vb_backend/config/paymentDetails.js` | Hardcoded payment details (Airtel, MTN, bank account) served to frontend |
| `mern_vb_backend/middleware/auth.js` | JWT/Clerk token verification |
| `mern_vb_backend/middleware/requireSuperAdmin.js` | Super-admin role enforcement for admin routes |
| `mern_vb_backend/middleware/checkTrial.js` | Trial/paid status enforcement for group write operations |
| `mern_vb_backend/controllers/authController.js` | Returns user context including `trialActive` and `isPaid` flags |
| `mern_vb_backend/controllers/supportController.js` | Support tickets — same Telegram + email notification pattern (parallel feature) |

---

## 3. Frontend — Payment Page

**Component:** `UpgradePage`  
**File:** `mern-vb-frontend/src/pages/UpgradePage.jsx`

### What it renders

The page has three sequential states:

| State | Component | Description |
|-------|-----------|-------------|
| 1 | Plan cards | Two plan cards: Starter (ZMW 150/month), Standard (ZMW 250/month) |
| 2 | `SubscribeForm` | Collects phone number; name + email pre-filled from Clerk auth |
| 3 | `ConfirmationScreen` | Static payment instructions shown after successful API call |

### Key UI elements on ConfirmationScreen

- Airtel Money number
- MTN MoMo number
- Bank name, account number, branch
- WhatsApp link for follow-up
- Payment reference format: `"{GroupName} — {PlanName}"`
- Message: "Your account will be activated within 24 hours"

### Plans (hardcoded in UpgradePage.jsx)

```javascript
const PLANS = [
  { id: 'starter',  name: 'Starter',  price: 150, ... },
  { id: 'standard', name: 'Standard', price: 250, ... },
];
```

### Button click handler

```javascript
async function handleSubmit(e) {
  // Collects: planName, planPrice, phone
  await axios.post(`${API_BASE_URL}/billing/request`, {
    planName: plan.name,
    planPrice: plan.price,
    phone: phone.trim(),
  });
  // On success → setStep('confirmation')
}
```

---

## 4. API Endpoint(s)

### Customer-facing — Upgrade Request

| Property | Value |
|----------|-------|
| Method | POST |
| Path | `/api/billing/request` |
| Auth | Required — Clerk Bearer token |
| Controller | `billingController.requestUpgrade` |

**Request body:**
```json
{
  "planName": "Standard",
  "planPrice": 250,
  "phone": "097XXXXXXX"
}
```

**Response (success):**
```json
{ "success": true }
```

---

### Admin-facing — Activate Billing

| Property | Value |
|----------|-------|
| Method | POST |
| Path | `/api/admin/groups/:groupId/billing/activate` |
| Auth | Required — Super admin only (`requireSuperAdmin` middleware) |
| Controller | `adminBillingController.activate` |

**Request body:**
```json
{
  "plan": "Standard",
  "durationMonths": 1,
  "customPaidUntil": null
}
```

**Response (success):**
```json
{
  "group": { "isPaid": true, "paidUntil": "2026-07-14T...", ... },
  "newPaidUntil": "2026-07-14T..."
}
```

---

### Admin-facing — List Plans

| Property | Value |
|----------|-------|
| Method | GET |
| Path | `/api/admin/billing/plans` |
| Auth | Required — Super admin only |
| Controller | `adminBillingController.listPlans` |

Used by `BillingActivationDrawer` to populate the plan dropdown.

---

## 5. Email Notification

**Library:** [Resend](https://resend.com/) — transactional email API service  
**Trigger point:** `billingController.requestUpgrade`, fired after Telegram notification

**Configuration (env var names only):**

| Env Var | Purpose |
|---------|---------|
| `RESEND_API_KEY` | Resend API key — required for email to send |
| `RESEND_FROM_EMAIL` | Sender address (has default fallback) |
| `ADMIN_EMAIL` | Primary recipient |
| `SUPER_ADMIN_EMAIL` | Fallback recipient if `ADMIN_EMAIL` not set |

**Condition:** Email only sends if both `RESEND_API_KEY` and `ADMIN_EMAIL` (or `SUPER_ADMIN_EMAIL`) are set.

**Subject format:** `Upgrade Request — {groupName} ({planName})`

**Body structure:**
```
🔔 New Upgrade Request

Group: {groupName}
Plan: {planName} — ZMW {planPrice}/month
Admin: {memberName}
Email: {memberEmail}
Phone: {phone}
Trial expires: {trialExpiresAt}

✅ Action: Log in to MongoDB Atlas and set:
isPaid: true
paidUntil: [today + 30 days]
```

Body is HTML (newlines replaced with `<br>` tags).

**Failure handling:** Silent — wrapped in try/catch but errors do not block the response or notify the customer. Email failure is not logged.

---

## 6. Telegram Notification

**API method:** `sendMessage`  
**Full endpoint:** `https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage`  
**HTTP method:** POST  
**Content-Type:** `application/json`  
**Delivery method:** `fetch()` — fire-and-forget, no retry logic

**Configuration (env var names only):**

| Env Var | Purpose |
|---------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather — identifies the bot |
| `TELEGRAM_CHAT_ID` | Chat/channel ID where messages are delivered |

**Payload structure:**
```json
{
  "chat_id": "{TELEGRAM_CHAT_ID}",
  "text": "🔔 <b>New Upgrade Request</b>\n\n<b>Group:</b> ...",
  "parse_mode": "HTML"
}
```

**Triggers:**
1. **Upgrade request** → `billingController.requestUpgrade`
2. **Support ticket** → `supportController.createRequest` (same pattern, different message content)

**Message content (upgrade):**
```
🔔 New Upgrade Request

Group: {groupName}
Plan: {planName} — ZMW {planPrice}/month
Admin: {memberName}
Email: {memberEmail}
Phone: {phone}
Trial expires: {trialExpiresAt}

✅ Action: Log in to MongoDB Atlas and set:
isPaid: true
paidUntil: [today + 30 days]
```

**Parse mode:** HTML — supports `<b>`, `<i>`, `<code>` tags.

**Failure handling:** Silent — errors suppressed, no retry, no fallback.

---

## 7. Subscription Model

**File:** `mern_vb_backend/models/Group.js`

**Relevant schema fields:**

```javascript
const groupSchema = new mongoose.Schema({
  trialExpiresAt: { type: Date, required: true },  // When free trial ends
  isPaid:         { type: Boolean, default: false }, // Active paid subscription?
  paidUntil:      { type: Date, default: null },     // Paid period expiry date
}, { timestamps: true });
```

**Access logic** (from `authController.js`):

```javascript
const trialActive = group?.isPaid || (group?.trialExpiresAt > new Date());
```

A group has full write access if **either**:
- `isPaid === true` (paid subscription active), OR
- `trialExpiresAt` is in the future (still on free trial)

When both conditions are false, the group is read-only (enforced by `checkTrial` middleware).

**Subscription states:**

| State | isPaid | trialExpiresAt | Access |
|-------|--------|----------------|--------|
| Active trial | false | Future | Full write |
| Active subscription | true | Any | Full write |
| Expired trial, unpaid | false | Past | Read-only |
| Subscription lapsed | false | Past (set to 2099 on activation) | Read-only |

---

## 8. Manual Activation Flow

### Where it lives

**Page:** Admin → Groups → [Select group] → Billing tab  
**File:** `mern-vb-frontend/src/pages/admin/AdminGroupDetail.jsx`  
**Component:** `BillingActivationDrawer` (`mern-vb-frontend/src/components/admin/BillingActivationDrawer.jsx`)

### Steps

1. Developer logs into the app as a super admin.
2. Navigates to **Admin → Groups**.
3. Selects the group that made the upgrade request.
4. Clicks the **Billing** tab on the group detail page.
5. Clicks **"Activate / Extend Billing"** button.
6. `BillingActivationDrawer` opens — a slide-in form with:
   - **Plan dropdown** — populated from `GET /api/admin/billing/plans`
   - **Duration (months)** — number input, 1–36
   - **Custom end date** — optional; overrides duration if set
7. Developer selects plan and enters `1` month (or sets a custom date).
8. Submits: `POST /api/admin/groups/{groupId}/billing/activate`

### What the backend does (`adminBillingController.activate`)

1. Validates plan name against `PLANS` allowlist.
2. Validates that either `durationMonths >= 1` or `customPaidUntil` is provided.
3. Fetches Group by ID.
4. Calculates `newPaidUntil`:
   - Custom date → use that directly.
   - Duration → adds `durationMonths` to either current `paidUntil` (if in future) or today.
5. Updates Group document:
   ```javascript
   group.isPaid = true;
   group.paidUntil = newPaidUntil;
   group.trialExpiresAt = new Date('2099-12-31'); // push trial out of the way
   await group.save();
   ```
6. Logs action to `AdminAuditLog` with before/after state + metadata.
7. Returns `{ group, newPaidUntil }`.

### Result

The group's next `GET /api/auth/me` call returns `isPaid: true` → full access restored.

---

## 9. Environment Variables Required

### Backend

| Var Name | Purpose | Required? |
|----------|---------|-----------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot API token | Yes — notifications won't send without it |
| `TELEGRAM_CHAT_ID` | Target chat/channel for notifications | Yes — messages go nowhere without it |
| `RESEND_API_KEY` | Resend email service API key | Optional — email skipped if absent |
| `RESEND_FROM_EMAIL` | Sender email address | Optional — has default fallback |
| `ADMIN_EMAIL` | Primary notification recipient | Required if sending email |
| `SUPER_ADMIN_EMAIL` | Fallback notification recipient | Optional — fallback if `ADMIN_EMAIL` absent |
| `MONGODB_URI` | MongoDB connection string | Yes — required for all operations |
| `JWT_SECRET` | JWT signing secret | Yes — required for auth |
| `PORT` | Server port | Optional — defaults to 5000 |

### Frontend

| Var Name | Purpose | Required? |
|----------|---------|-----------|
| `VITE_API_URL` | Backend API base URL | Yes |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk authentication public key | Yes |

---

## 10. Full Request Lifecycle (Step by Step)

### Customer flow

1. **Customer opens `/upgrade`** — `UpgradePage` renders plan cards (Starter / Standard).

2. **Customer clicks "Subscribe"** on chosen plan — `SubscribeForm` renders with name/email pre-filled from Clerk auth.

3. **Customer enters phone number and clicks "Confirm Subscription Request"** — `handleSubmit` fires.

4. **Frontend sends:** `POST /api/billing/request`
   ```json
   { "planName": "Standard", "planPrice": 250, "phone": "097XXXXXXX" }
   ```
   Clerk token attached via Axios interceptor.

5. **Backend: `billingController.requestUpgrade` runs:**
   - Validates `planName`, `planPrice`, `phone` present → 400 if not.
   - Extracts Clerk user ID from `getAuth(req)`.
   - Queries `GroupMember` by `clerkUserId` → 404 if not found.
   - Queries `Group` by `member.groupId` → 404 if not found.
   - Builds HTML notification message with group name, plan, admin contact, trial expiry.

6. **Telegram notification sent:**
   - `POST https://api.telegram.org/bot{TOKEN}/sendMessage`
   - Developer receives message in Telegram immediately.

7. **Email notification sent** (if `RESEND_API_KEY` + `ADMIN_EMAIL` set):
   - Resend API call with same message content.
   - Developer receives email with subject `Upgrade Request — {groupName} ({planName})`.

8. **Backend responds:** `{ success: true }` with HTTP 200.

9. **Frontend transitions to `ConfirmationScreen`:**
   - Shows static payment instructions (Airtel/MTN/bank).
   - Shows message: "Account will be activated within 24 hours."

10. **Customer transfers money manually** (outside the app) to Airtel Money / MTN MoMo / bank account. Uses `"{GroupName} — {PlanName}"` as reference.

---

### Developer approval flow

11. **Developer receives Telegram + email notifications** with group name, plan, admin contact.

12. **Developer manually verifies payment** — checks Airtel/MTN/bank account for incoming transfer matching reference.

13. **Developer logs into admin panel** → Admin → Groups → selects group → Billing tab.

14. **Developer clicks "Activate / Extend Billing"** → `BillingActivationDrawer` opens.

15. **Developer fills form:** selects plan, enters `1` month duration.

16. **Developer clicks Submit** → `POST /api/admin/groups/{groupId}/billing/activate`
    ```json
    { "plan": "Standard", "durationMonths": 1 }
    ```

17. **Backend: `adminBillingController.activate` runs:**
    - Validates plan + duration.
    - Fetches Group.
    - Calculates `newPaidUntil` = today + 1 month.
    - Updates Group: `isPaid=true`, `paidUntil={date}`, `trialExpiresAt=2099-12-31`.
    - Logs to `AdminAuditLog`.
    - Returns updated group.

18. **Admin UI shows success toast.** Group is now active.

---

### Customer next login

19. **Customer opens app → auth check fires:** `GET /api/auth/me`

20. **Backend `authController.me` checks Group:**
    - `group.isPaid === true` → `trialActive = true`
    - Returns user context with `isPaid: true`.

21. **Frontend receives `isPaid: true`:**
    - Trial banner disappears.
    - All write operations enabled.
    - Loan limits, member count restrictions lifted.
    - Full access granted.

---

## 11. Portability Notes

### What to change to reuse this in another project

**1. Payment details — currently hardcoded in `config/paymentDetails.js`**
```javascript
airtelMoney: '0979645911',
mtnMomo: '0766792396',
bankName: 'Access Bank Zambia',
bankAccount: '0030211570841',
bankBranch: 'Acacia Branch-350003',
whatsapp: '0979645911',
```
Move all of these to environment variables. This is the most critical portability fix — these are personal financial accounts baked into the config file.

**2. Plan prices — hardcoded in `UpgradePage.jsx`**
```javascript
const PLANS = [
  { id: 'starter', name: 'Starter', price: 150 },
  { id: 'standard', name: 'Standard', price: 250 },
];
```
These are ZMW prices. Another project/region needs different pricing. Move to backend API or environment config.

**3. Currency — implicitly ZMW everywhere**  
No currency field anywhere. The string `"ZMW"` is hardcoded in notification messages and plan cards. Add a `CURRENCY` env var and pass it through.

**4. Sender email domain — partial fallback**
```javascript
from: process.env.RESEND_FROM_EMAIL || 'Chama360 <noreply@mynexusgroup.com>'
```
The fallback domain is project-specific. Remove the hardcoded fallback; require `RESEND_FROM_EMAIL` to be set.

**5. Trial-date override on activation**
```javascript
group.trialExpiresAt = new Date('2099-12-31');
```
Far-future date hardcoded. For projects with different trial logic, make this configurable or remove the override entirely.

**6. Dependencies to install**
```bash
# Backend
npm install resend               # email (or swap for nodemailer + SMTP)

# No extra package for Telegram — uses native fetch()
```

**7. Clerk auth assumption**  
The backend uses `getAuth(req)` from `@clerk/express`. The frontend uses `@clerk/react`. If reusing without Clerk, replace these with standard JWT (`req.user.id` from `auth.js` middleware).

**8. Notification failure handling**  
Currently silent. For a production-grade reuse, add:
- Error logging for failed Telegram/email sends
- Fallback notification channel (e.g., SMS, second email)
- Retry queue for transient failures

**9. No idempotency on upgrade requests**  
A customer can submit multiple upgrade requests. Each fires a separate Telegram + email notification. Add a check for an existing pending request before sending.

**10. No payment record stored**  
The upgrade request is not persisted in the database — only the notification is sent. There is no `PaymentRequest` or `UpgradeRequest` model. If the notifications fail or the developer forgets, there is no record of the customer's intent. Adding a `BillingRequest` collection would close this gap.

---

*Report generated: 2026-06-14*  
*Scope: Read-only audit — no source files were modified*
