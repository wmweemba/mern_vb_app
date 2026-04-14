# Plan: Free Trial, Corrected Onboarding & Super Admin (Day 5)

Replaces the original Day 5 onboarding wizard plan. Incorporates three
things: a free trial system, a corrected new-user onboarding flow, and
a seeded super admin account. Also resolves a known auth issue first.

---

## Current State (as of Day 4 implementation)

What exists and works:
- Clerk auth installed: `@clerk/express` on backend, `@clerk/clerk-react` on frontend
- `clerkMiddleware()` applied globally in `server.js` (line 16)
- `middleware/auth.js` — custom `verifyToken` using `getAuth(req)` from Clerk
- `middleware/resolveGroup.js` — looks up `GroupMember` by `clerkUserId`
- `store/auth.jsx` — axios interceptor attaches Clerk token via `getToken()`
- `GET /api/auth/me` — returns group membership or `{ code: 'NO_GROUP' }`
- `POST /api/groups` — creates Group + GroupMember + GroupSettings + BankBalance atomically
- `App.jsx` — `ProtectedRoute` component redirects to `/onboarding` when `needsOnboarding`
- `pages/Onboarding.jsx` — 3-step wizard (group name, display name, confirm)
- Models: `Group.js`, `GroupMember.js`, `InviteToken.js` all exist
- All 7 data models have `groupId` field, all controllers scoped via `req.groupScope`

What is broken:
- **All API calls return 401 Unauthorized in the browser.** The Clerk session
  token is either not being attached correctly or the backend is not validating
  it correctly. This must be diagnosed and fixed before anything else proceeds.
- **New user signup lands on dashboard with errors** instead of redirecting to
  the onboarding wizard. The onboarding gate in `ProtectedRoute` may not be
  triggering because the `/auth/me` call itself fails with 401.

---

## PART 1 — AUTH DIAGNOSTIC

**This must pass before proceeding to any other part. Nothing else works
until authenticated API calls return 200.**

### Step 1.1: Add test endpoint

**File:** `mern_vb_backend/routes/auth.js`

Add a minimal test route that only requires Clerk auth, no group membership:

```js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const { getAuth } = require('@clerk/express');

router.get('/me', verifyToken, authController.me);

// Auth diagnostic — remove after 401 bug is fixed
router.get('/test', verifyToken, (req, res) => {
  const { userId } = getAuth(req);
  res.json({ ok: true, clerkUserId: userId });
});

module.exports = router;
```

### Step 1.2: Clear stale browser cookies (CRITICAL — do this first)

The changelog documents that two different Clerk dev instances were used
during development: `selected-sturgeon-94` (port 3000) and `mint-sunbird-58`
(port 5173). Their cookies coexist in the browser, causing Clerk's handshake
mechanism to fire on every reload (`__clerk_handshake` in URL) and leaving
the session in an unresolved state during API calls.

**Before doing anything else:**
1. Open Chrome DevTools → Application → Storage
2. Click "Clear site data" for `localhost:5173` (or whatever port Vite uses)
3. Also clear for `localhost:3000` if it exists
4. Close all browser tabs for localhost
5. Restart the frontend dev server: `cd mern-vb-frontend && pnpm dev`
6. Open a fresh tab and sign in via Clerk

If the `__clerk_handshake` query param keeps appearing in the URL after
sign-in, cookies are still stale. Try an incognito window to confirm
the issue is browser state and not code.

### Step 1.3: Verify frontend token attachment (after clearing cookies)

Open browser DevTools → Network tab. Sign in via Clerk. Navigate to any
page that triggers an API call. Check:

1. Does the `Authorization` header appear on the request?
2. Does it have the format `Bearer eyJ...` (a JWT)?
3. Is the token non-null and non-empty?

The axios interceptor in `store/auth.jsx` (lines 18-27) should handle this:

```js
useEffect(() => {
  const id = axios.interceptors.request.use(async config => {
    if (isSignedIn) {
      const token = await getToken();
      if (token) config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  });
  return () => axios.interceptors.request.eject(id);
}, [isSignedIn, getToken]);
```

**Known issue pattern:** The interceptor depends on `isSignedIn` being true.
If `isSignedIn` is still `false` when the first API call fires (race condition
between Clerk loading and the `/auth/me` effect), the token won't be attached.

**Fix if this is the cause:** In the `/auth/me` effect (`store/auth.jsx`
lines 32-54), add a guard that waits for `isSignedIn` to be true before
firing the request. The current code already checks `isLoaded` (line 33)
but the interceptor may not be registered yet when the effect runs.

The safest fix: instead of relying on the interceptor for the initial
`/auth/me` call, pass the token explicitly:

```js
useEffect(() => {
  if (!isLoaded || !isSignedIn) { /* ... */ return; }
  setAuthLoading(true);
  getToken().then(token => {
    if (!token) { setAuthLoading(false); return; }
    axios.get(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => { setGroupMember(res.data); setNeedsOnboarding(false); })
    .catch(err => {
      if (err?.response?.data?.code === 'NO_GROUP') setNeedsOnboarding(true);
    })
    .finally(() => setAuthLoading(false));
  });
}, [isSignedIn, isLoaded]);
```

### Step 1.4: Verify backend Clerk middleware

Check these in order:

1. **Is `CLERK_SECRET_KEY` set in backend `.env`?**
   The backend needs this to validate Clerk session tokens. Verify:
   ```bash
   cd mern_vb_backend && grep CLERK_SECRET_KEY .env
   ```
   It must start with `sk_test_` (dev) or `sk_live_` (prod).

2. **Is `clerkMiddleware()` running before routes?**
   In `server.js` line 16: `app.use(clerkMiddleware({ secretKey: process.env.CLERK_SECRET_KEY }));`
   This is correct. It must be AFTER `cors()` and `express.json()` but
   BEFORE all route mounting.

3. **Is `getAuth(req)` returning a userId?**
   The debug endpoint at `GET /api/debug-auth` (server.js lines 19-22)
   should show this. Hit it from the browser while signed in.
   - If `userId` is null but `hasAuth` is true → token is reaching the server
     but Clerk can't validate it. Check the secret key matches the publishable key's project.
   - If `hasAuth` is false → `clerkMiddleware()` isn't running. Check middleware order.

4. **Does `verifyToken` in `middleware/auth.js` work?**
   Lines 6-21 call `getAuth(req)`. The error logging on line 17 will print
   to the server console if userId is null. Check server logs.

### Step 1.5: Fix Dashboard race condition

The changelog documents that Dashboard components fire API calls (savings,
bank-balance) on mount BEFORE the axios interceptor with `isSignedIn=true`
is installed. Those first-mount requests go out with no Authorization header.

The fix in Step 1.3 (passing token explicitly to `/auth/me`) only fixes the
initial auth call. Dashboard and other page components still use plain
`axios.get()` which relies on the interceptor.

**Fix:** Ensure `ProtectedRoute` does not render children (and therefore
does not mount Dashboard) until `authLoading` is false AND `user` is set.
The current code in `App.jsx` (line 38) already does this:

```js
if (!isLoaded || authLoading) return <LoadingSpinner />;
```

This means Dashboard won't mount until `/auth/me` completes. By that point
the interceptor is installed (it runs in the same render cycle as sign-in).
Verify this is actually the behavior — if Dashboard still fires calls before
the interceptor is ready, the interceptor `useEffect` may need to run with
a `useLayoutEffect` instead, or the `authLoading` gate needs to also wait
for the interceptor to be registered.

### Step 1.6: Success gate

Call `GET /api/auth/test` from the browser while signed in via Clerk.

- **Returns `{ ok: true, clerkUserId: "user_xxx" }`** → Auth is working.
  Proceed to Part 2.
- **Returns 401** → Go back through the checklist above. Do not proceed.

### Step 1.7: Clean up debug aids

After auth is confirmed working, remove:
- The `/api/debug-auth` endpoint from `server.js` (lines 19-22)
- The `/api/auth/test` endpoint from `routes/auth.js`
- The `console.error` debug logging in `middleware/auth.js` (lines 15-18)

---

## PART 2 — FREE TRIAL SYSTEM

### Step 2.1: Add trial fields to Group model

**File:** `mern_vb_backend/models/Group.js`

```js
const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  clerkAdminId: { type: String },
  trialExpiresAt: { type: Date, required: true },
  isPaid: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
```

Two new fields:
- `trialExpiresAt: Date` — set to `Date.now() + 15 * 24 * 60 * 60 * 1000`
  on group creation (15 days from now)
- `isPaid: Boolean` — default `false`. Set to `true` manually in MongoDB
  Atlas when MoMo payment is received. No payment automation needed.

### Step 2.2: Create checkTrial middleware

**Create file:** `mern_vb_backend/middleware/checkTrial.js`

```js
const Group = require('../models/Group');

/**
 * Checks trial status for the current group.
 * Mount AFTER resolveGroup on all group-scoped routes.
 *
 * Behavior:
 * - isPaid groups: full access, no checks
 * - Active trial: full access, attaches trialActive: true
 * - Expired trial + GET request: allow (read-only), attaches trialActive: false
 * - Expired trial + POST/PUT/DELETE request: 403 trial_expired
 */
async function checkTrial(req, res, next) {
  try {
    // Super admins bypass trial checks entirely
    if (req.isSuperAdmin) return next();

    const group = await Group.findById(req.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Paid groups — full access forever
    if (group.isPaid) {
      req.trialActive = true;
      return next();
    }

    const now = new Date();
    if (group.trialExpiresAt > now) {
      // Trial is active
      req.trialActive = true;
      return next();
    }

    // Trial has expired
    req.trialActive = false;

    // Allow GET requests (read-only access)
    if (req.method === 'GET') {
      return next();
    }

    // Block write operations and exports
    return res.status(403).json({
      error: 'trial_expired',
      message: 'Your free trial has ended. Contact support to continue.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check trial status', details: err.message });
  }
}

module.exports = { checkTrial };
```

### Step 2.3: Wire checkTrial into route files

Every route file that currently uses `resolveGroup` must add `checkTrial`
immediately after it. The middleware chain order is:

```
verifyToken → resolveGroup → checkTrial → controller
```

**9 route files to update:**

| File | Current chain | New chain |
|------|--------------|-----------|
| `routes/users.js` | `verifyToken, resolveGroup` | `verifyToken, resolveGroup, checkTrial` |
| `routes/loans.js` | `verifyToken, resolveGroup` | `verifyToken, resolveGroup, checkTrial` |
| `routes/savings.js` | `verifyToken, resolveGroup` | `verifyToken, resolveGroup, checkTrial` |
| `routes/payment.js` | `verifyToken, resolveGroup` | `verifyToken, resolveGroup, checkTrial` |
| `routes/transactions.js` | `verifyToken, resolveGroup` | `verifyToken, resolveGroup, checkTrial` |
| `routes/bankBalance.js` | `verifyToken, resolveGroup` | `verifyToken, resolveGroup, checkTrial` |
| `routes/cycle.js` | `verifyToken, resolveGroup` | `verifyToken, resolveGroup, checkTrial` |
| `routes/reports.js` | `verifyToken, resolveGroup` | `verifyToken, resolveGroup, checkTrial` |
| `routes/groupSettings.js` | `verifyToken, resolveGroup` | `verifyToken, resolveGroup, checkTrial` |

Add this import to each route file:
```js
const { checkTrial } = require('../middleware/checkTrial');
```

**Do NOT add `checkTrial` to:**
- `routes/auth.js` — auth/me must always work
- `routes/groups.js` — group creation must always work
- `routes/invites.js` — invite acceptance must always work

### Step 2.4: Attach trialActive to GET responses

For GET endpoints, controllers should include `trialActive` in the response
so the frontend knows the trial state. The simplest approach: add a
response wrapper in `checkTrial` that patches `res.json`:

```js
// Inside checkTrial, after setting req.trialActive = false and before next():
if (req.method === 'GET') {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      data.trialActive = false;
    }
    return originalJson(data);
  };
  return next();
}
```

This means every GET response from an expired-trial group will include
`trialActive: false`. The frontend reads this to show the trial banner.

For array responses (like loan lists), the frontend should check the
response headers or a separate `/api/auth/me` call for trial status instead.

**Simpler alternative (recommended):** Don't patch responses. Instead, have
the frontend check trial status via the `/auth/me` endpoint. Add `trialActive`
to the `/auth/me` response:

**File:** `mern_vb_backend/controllers/authController.js` — update `me`:

```js
const Group = require('../models/Group');

exports.me = async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

    const member = await GroupMember.findOne({ clerkUserId, active: true });
    if (!member) {
      return res.status(403).json({ error: 'No group membership', code: 'NO_GROUP' });
    }

    const group = await Group.findById(member.groupId);
    const trialActive = group?.isPaid || (group?.trialExpiresAt > new Date());

    res.json({
      _id: member._id,
      name: member.name,
      role: member.role,
      groupId: member.groupId,
      phone: member.phone,
      email: member.email,
      trialActive,
      trialExpiresAt: group?.trialExpiresAt,
      isPaid: group?.isPaid || false,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch membership', details: err.message });
  }
};
```

### Step 2.5: Frontend trial handling

**File:** `mern-vb-frontend/src/store/auth.jsx`

Add `trialActive` to the state:

```js
const [trialActive, setTrialActive] = useState(true); // assume active until told otherwise
```

In the `/auth/me` success handler, read it:
```js
.then(res => {
  setGroupMember(res.data);
  setTrialActive(res.data.trialActive);
  setNeedsOnboarding(false);
})
```

Export it in the value object:
```js
const value = {
  // ... existing fields ...
  trialActive,
};
```

**File:** Create `mern-vb-frontend/src/components/TrialBanner.jsx`

```jsx
import { useAuth } from '../store/auth';

export default function TrialBanner() {
  const { trialActive, user } = useAuth();

  if (!user || trialActive) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-800">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <p>
          Your 15-day free trial has ended. Your data is safe and readable,
          but saving new records is disabled.
          Contact William on <a href="https://wa.me/260XXXXXXXXX" className="underline font-medium">WhatsApp</a> to continue.
        </p>
      </div>
    </div>
  );
}
```

**Replace `260XXXXXXXXX` with William's actual WhatsApp number.**

**File:** `mern-vb-frontend/src/App.jsx`

Add the banner inside the `Layout` component:

```jsx
import TrialBanner from './components/TrialBanner';

const Layout = ({ children }) => (
  <div className="min-h-screen flex flex-col bg-background">
    <Navbar />
    <TrialBanner />
    <main className="flex-1 w-full mx-auto">{children}</main>
  </div>
);
```

**Disable write buttons when trial expired:**

In any page component that has write actions (Loans, Savings, etc.), check
`trialActive` from the auth store:

```jsx
const { trialActive } = useAuth();

// On buttons that trigger POST/PUT/DELETE:
<button disabled={!trialActive} className={!trialActive ? 'opacity-50 cursor-not-allowed' : ''}>
  Add Loan
</button>
```

Hide export buttons when trial expired:
```jsx
{trialActive && <button onClick={handleExport}>Export PDF</button>}
```

**Handle 403 trial_expired responses globally:**

Add a response interceptor in `store/auth.jsx`:

```js
useEffect(() => {
  const id = axios.interceptors.response.use(
    response => response,
    error => {
      if (error?.response?.status === 403 && error?.response?.data?.error === 'trial_expired') {
        setTrialActive(false);
      }
      return Promise.reject(error);
    }
  );
  return () => axios.interceptors.response.eject(id);
}, []);
```

---

## PART 3 — CORRECTED ONBOARDING FLOW

### Step 3.1: Update the onboarding gate logic

The new user journey is **three stages**, not a direct redirect to `/onboarding`.

**Corrected gate logic:**

1. Is this a superadmin? → skip gate entirely, go to dashboard
2. Does a GroupMember record exist for this `clerkUserId`?
   - **YES** → check trial status → dashboard (or read-only view if expired)
   - **NO** → has the user clicked through `/welcome`?
     - Check `sessionStorage.getItem('trialAccepted')` (set when CTA is clicked)
     - Flag **present** → go to `/onboarding`
     - Flag **absent** → go to `/welcome`

**Stage 1 — Promotional holding page (`/welcome`)**

New users with no GroupMember land here first. This page contains:
- App name, tagline, and value proposition
- Key features: savings tracking, loan management, reports, member self-service
- Pricing: ZMW 150/month (Starter, up to 15 members) and ZMW 250/month (Standard, up to 40 members)
- A single prominent CTA button: **"Start my 15-day free trial"**
- No other navigation — the user cannot access any other part of the app from this page

When the CTA is clicked:
```js
sessionStorage.setItem('trialAccepted', '1');
navigate('/onboarding');
```

**Stage 2 — Onboarding wizard (`/onboarding`)**

Only reachable by clicking the CTA on `/welcome`. If a user navigates
directly to `/onboarding` without having passed through `/welcome`
(i.e. `sessionStorage.getItem('trialAccepted')` is absent), redirect
them back to `/welcome`.

The wizard flow is unchanged (4 steps as described in Step 3.3).

**Stage 3 — Dashboard**

Unchanged from the rest of the plan.

**Files to create/modify:**
- `mern-vb-frontend/src/pages/Welcome.jsx` (new) — promotional holding page
- `mern-vb-frontend/src/App.jsx` — add `/welcome` route; update `ProtectedRoute`
  gate to redirect to `/welcome` instead of `/onboarding`; add guard on
  `/onboarding` route that checks `sessionStorage.getItem('trialAccepted')`

**`ProtectedRoute` updated logic:**
```jsx
function ProtectedRoute({ children }) {
  const { isLoaded, authLoading, isSuperAdmin, needsOnboarding } = useAuth();
  if (!isLoaded || authLoading) return <LoadingSpinner />;
  return (
    <>
      <SignedIn>
        {needsOnboarding && !isSuperAdmin ? <Navigate to="/welcome" replace /> : children}
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
```

**Onboarding route guard:**
```jsx
<Route path="/onboarding" element={
  <>
    <SignedIn>
      {sessionStorage.getItem('trialAccepted')
        ? <Onboarding />
        : <Navigate to="/welcome" replace />}
    </SignedIn>
    <SignedOut><RedirectToSignIn /></SignedOut>
  </>
} />
```

### Step 3.2: Add super admin bypass to the onboarding gate

**File:** `mern-vb-frontend/src/store/auth.jsx`

Add `isSuperAdmin` to state:

```js
const [isSuperAdmin, setIsSuperAdmin] = useState(false);
```

In the `/auth/me` catch handler, also check for super admin:
```js
.then(res => {
  if (res.data.isSuperAdmin) {
    setIsSuperAdmin(true);
    setGroupMember(res.data); // may be partial
    setNeedsOnboarding(false);
  } else {
    setGroupMember(res.data);
    setTrialActive(res.data.trialActive);
    setNeedsOnboarding(false);
  }
})
```

Export in value:
```js
const value = { ...existing, isSuperAdmin };
```

**File:** `mern-vb-frontend/src/App.jsx`

Update `ProtectedRoute`:
```jsx
function ProtectedRoute({ children }) {
  const { isLoaded, isSignedIn, needsOnboarding, authLoading, isSuperAdmin } = useAuth();
  if (!isLoaded || authLoading) return <LoadingSpinner />;
  return (
    <>
      <SignedIn>
        {needsOnboarding && !isSuperAdmin ? <Navigate to="/onboarding" replace /> : children}
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
```

### Step 3.3: Expand onboarding wizard to 4 steps

**File:** `mern-vb-frontend/src/pages/Onboarding.jsx` — rewrite

The current wizard has 3 steps (group name, display name, confirm).
Expand to 4 steps with GroupSettings fields and helper text.

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';

const DEFAULTS = {
  cycleLengthMonths: 6,
  interestRate: 10,
  interestMethod: 'reducing',
  loanLimitMultiplier: 3,
  lateFineAmount: 500,
  lateFineType: 'fixed',
};

export default function Onboarding() {
  const { refreshMembership } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  // Step 1 fields
  const [groupName, setGroupName] = useState('');
  const [meetingDay, setMeetingDay] = useState('Saturday');
  const [cycleStartDate, setCycleStartDate] = useState('');
  const [cycleLengthMonths, setCycleLengthMonths] = useState(DEFAULTS.cycleLengthMonths);

  // Step 2 fields
  const [treasurerName, setTreasurerName] = useState('');
  const [phone, setPhone] = useState('');
  const [interestRate, setInterestRate] = useState(DEFAULTS.interestRate);
  const [interestMethod, setInterestMethod] = useState(DEFAULTS.interestMethod);
  const [loanLimitMultiplier, setLoanLimitMultiplier] = useState(DEFAULTS.loanLimitMultiplier);

  // Step 3 fields
  const [lateFineAmount, setLateFineAmount] = useState(DEFAULTS.lateFineAmount);
  const [lateFineType, setLateFineType] = useState(DEFAULTS.lateFineType);

  const handleSubmit = async () => {
    if (!groupName.trim() || !treasurerName.trim()) {
      setError('Group name and your display name are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/groups`, {
        groupName,
        treasurerName,
        phone,
        meetingDay,
        cycleStartDate,
        cycleLengthMonths,
        interestRate,
        interestMethod,
        loanLimitMultiplier,
        lateFineAmount,
        lateFineType,
      });
      await refreshMembership();
      setShowWelcome(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create group. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showWelcome) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-8 space-y-6 text-center">
          <div className="text-4xl">&#127881;</div>
          <h1 className="text-2xl font-bold text-gray-900">Your group is ready!</h1>
          <p className="text-gray-600">Start by adding your first member.</p>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="w-full bg-blue-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Chama360</h1>
          <p className="text-sm text-gray-500 mt-1">Set up your group in 4 easy steps</p>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${step >= n ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">Step 1: Group info</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Group name</label>
              <input type="text" placeholder="e.g. Pamodzi Savings Group" value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting day</label>
              <select value={meetingDay} onChange={e => setMeetingDay(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d =>
                  <option key={d} value={d}>{d}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cycle start date</label>
              <input type="date" value={cycleStartDate} onChange={e => setCycleStartDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">When does your current or next savings cycle begin?</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cycle length</label>
              <select value={cycleLengthMonths} onChange={e => setCycleLengthMonths(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">How long is one full savings-and-lending cycle?</p>
            </div>
            <button
              onClick={() => { if (groupName.trim()) { setError(''); setStep(2); } else setError('Please enter a group name.'); }}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">Step 2: Loan settings</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your display name</label>
              <input type="text" placeholder="Your full name (shown to members)" value={treasurerName}
                onChange={e => setTreasurerName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone number (optional)</label>
              <input type="tel" placeholder="+260..." value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interest rate (%)</label>
              <input type="number" min="1" max="50" value={interestRate}
                onChange={e => setInterestRate(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">The interest rate charged on loans. E.g. 10 means 10% interest.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interest method</label>
              <select value={interestMethod} onChange={e => setInterestMethod(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="reducing">Reducing balance</option>
                <option value="flat">Flat rate</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {interestMethod === 'reducing'
                  ? 'Interest decreases as the loan is repaid — fairer for borrowers.'
                  : 'Same interest charge every installment — simpler to explain.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan limit multiplier</label>
              <input type="number" min="1" max="10" value={loanLimitMultiplier}
                onChange={e => setLoanLimitMultiplier(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">
                Members can borrow up to X times their total savings.
                E.g. 3 means a member with K1,000 saved can borrow up to K3,000.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button
                onClick={() => { if (treasurerName.trim()) { setError(''); setStep(3); } else setError('Please enter your name.'); }}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">Step 3: Fines</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Late payment fine</label>
              <input type="number" min="0" value={lateFineAmount}
                onChange={e => setLateFineAmount(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">
                {lateFineType === 'fixed'
                  ? `A flat K${lateFineAmount} fine for late payments.`
                  : `${lateFineAmount}% of the overdue amount as a fine.`}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fine type</label>
              <select value={lateFineType} onChange={e => setLateFineType(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="fixed">Fixed amount (e.g. K500)</option>
                <option value="percentage">Percentage of overdue amount</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button onClick={() => { setError(''); setStep(4); }}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">Step 4: Confirm & create</h2>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm text-gray-700">
              <p><span className="font-medium">Group:</span> {groupName}</p>
              <p><span className="font-medium">Meeting day:</span> {meetingDay}</p>
              <p><span className="font-medium">Cycle:</span> {cycleLengthMonths} months{cycleStartDate ? `, starting ${cycleStartDate}` : ''}</p>
              <p><span className="font-medium">Your name:</span> {treasurerName}</p>
              {phone && <p><span className="font-medium">Phone:</span> {phone}</p>}
              <p><span className="font-medium">Interest:</span> {interestRate}% ({interestMethod} balance)</p>
              <p><span className="font-medium">Loan limit:</span> {loanLimitMultiplier}x savings</p>
              <p><span className="font-medium">Late fine:</span> {lateFineType === 'fixed' ? `K${lateFineAmount}` : `${lateFineAmount}%`}</p>
              <p><span className="font-medium">Your role:</span> Admin</p>
              <p><span className="font-medium">Free trial:</span> 15 days</p>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep(3)} className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        )}

        {error && step !== 4 && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </div>
  );
}
```

### Step 3.4: Update POST /api/groups to accept new fields

**File:** `mern_vb_backend/controllers/groupController.js`

The `createGroup` function currently takes `{ groupName, treasurerName, phone }`.
Expand it to accept the wizard fields and set `trialExpiresAt`:

```js
exports.createGroup = async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const {
    groupName, treasurerName, phone,
    meetingDay, cycleStartDate, cycleLengthMonths,
    interestRate, interestMethod, loanLimitMultiplier,
    lateFineAmount, lateFineType,
  } = req.body;

  if (!groupName || !treasurerName) {
    return res.status(400).json({ error: 'groupName and treasurerName are required' });
  }

  const slug = groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const existingMember = await GroupMember.findOne({ clerkUserId });
  if (existingMember) {
    return res.status(409).json({ error: 'You are already in a group' });
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existingGroup = await Group.findOne({ slug }).session(session);
      if (existingGroup) throw Object.assign(new Error('Group name already taken'), { status: 409 });

      // 15-day free trial
      const trialExpiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

      const [group] = await Group.create([{
        name: groupName, slug, clerkAdminId: clerkUserId,
        trialExpiresAt,
        isPaid: false,
      }], { session });

      const [member] = await GroupMember.create([{
        clerkUserId,
        groupId: group._id,
        role: 'admin',
        name: treasurerName,
        phone: phone || null,
      }], { session });

      await GroupSettings.create([{
        groupId: group._id,
        groupName,
        cycleLengthMonths: cycleLengthMonths || 6,
        interestRate: interestRate || 10,
        interestMethod: interestMethod || 'reducing',
        defaultLoanDuration: 4,
        loanLimitMultiplier: loanLimitMultiplier || 3,
        latePenaltyRate: 15,
        overdueFineAmount: lateFineAmount || 1000,
        earlyPaymentCharge: 200,
        savingsInterestRate: 10,
        minimumSavingsMonth1: 3000,
        minimumSavingsMonthly: 1000,
        maximumSavingsFirst3Months: 5000,
        savingsShortfallFine: lateFineAmount || 500,
        profitSharingMethod: 'proportional',
      }], { session });

      await BankBalance.create([{ balance: 0, groupId: group._id }], { session });

      result = {
        group: { id: group._id, name: groupName, slug },
        member: { id: member._id, name: treasurerName, role: 'admin', groupId: group._id },
      };
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};
```

---

## PART 4 — SUPER ADMIN ACCOUNT

### Step 4.1: Create SuperAdmin model

**Create file:** `mern_vb_backend/models/SuperAdmin.js`

```js
const mongoose = require('mongoose');

const superAdminSchema = new mongoose.Schema({
  clerkUserId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SuperAdmin', superAdminSchema);
```

### Step 4.2: Create seed script

**Create file:** `mern_vb_backend/scripts/seedSuperAdmin.js`

```js
require('dotenv').config();
const mongoose = require('mongoose');
const SuperAdmin = require('../models/SuperAdmin');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

async function seed() {
  const clerkUserId = process.env.SUPER_ADMIN_CLERK_ID;
  const email = process.env.SUPER_ADMIN_EMAIL;

  if (!clerkUserId || !email) {
    console.error('Set SUPER_ADMIN_CLERK_ID and SUPER_ADMIN_EMAIL in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  const existing = await SuperAdmin.findOne({ clerkUserId });
  if (existing) {
    console.log('SuperAdmin already exists:', existing.email);
  } else {
    await SuperAdmin.create({ clerkUserId, email });
    console.log('SuperAdmin created:', email);
  }

  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
```

**Usage:**
```bash
cd mern_vb_backend
SUPER_ADMIN_CLERK_ID=user_xxx SUPER_ADMIN_EMAIL=william@example.com node scripts/seedSuperAdmin.js
```

Or add to `.env`:
```
SUPER_ADMIN_CLERK_ID=user_xxx
SUPER_ADMIN_EMAIL=william@example.com
```
Then run: `node scripts/seedSuperAdmin.js`

The script is idempotent — safe to run multiple times.

### Step 4.3: Update resolveGroup to check SuperAdmin first

**File:** `mern_vb_backend/middleware/resolveGroup.js`

```js
const GroupMember = require('../models/GroupMember');
const SuperAdmin = require('../models/SuperAdmin');

async function resolveGroup(req, res, next) {
  try {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check super admin first
    const superAdmin = await SuperAdmin.findOne({ clerkUserId });
    if (superAdmin) {
      req.isSuperAdmin = true;
      req.user = { id: null, role: 'admin', groupId: null };
      return next();
    }

    const member = await GroupMember.findOne({ clerkUserId, active: true });
    if (!member) {
      return res.status(403).json({
        error: 'No group membership found',
        code: 'NO_GROUP',
      });
    }

    req.groupId = member.groupId;
    req.memberId = member._id;
    req.role = member.role;
    req.member = member;
    req.groupScope = { groupId: member.groupId };
    req.user = { id: member._id, role: member.role, groupId: member.groupId };

    next();
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve group', details: err.message });
  }
}

module.exports = { resolveGroup };
```

**Important:** Super admins get `req.isSuperAdmin = true` but NO `req.groupId`
or `req.groupScope`. This means they cannot accidentally call group-scoped
endpoints without specifying a group. Controllers that use `req.groupScope`
will produce empty/null filters, which is safe (no data returned, not all data).

### Step 4.4: Update authController.me to handle super admin

**File:** `mern_vb_backend/controllers/authController.js`

```js
const { getAuth } = require('@clerk/express');
const GroupMember = require('../models/GroupMember');
const Group = require('../models/Group');
const SuperAdmin = require('../models/SuperAdmin');

exports.me = async (req, res) => {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

    // Check super admin
    const superAdmin = await SuperAdmin.findOne({ clerkUserId });
    if (superAdmin) {
      return res.json({
        _id: null,
        name: 'Super Admin',
        role: 'admin',
        groupId: null,
        email: superAdmin.email,
        isSuperAdmin: true,
        trialActive: true,
        isPaid: true,
      });
    }

    const member = await GroupMember.findOne({ clerkUserId, active: true });
    if (!member) {
      return res.status(403).json({ error: 'No group membership', code: 'NO_GROUP' });
    }

    const group = await Group.findById(member.groupId);
    const trialActive = group?.isPaid || (group?.trialExpiresAt > new Date());

    res.json({
      _id: member._id,
      name: member.name,
      role: member.role,
      groupId: member.groupId,
      phone: member.phone,
      email: member.email,
      trialActive,
      trialExpiresAt: group?.trialExpiresAt,
      isPaid: group?.isPaid || false,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch membership', details: err.message });
  }
};
```

### Step 4.5: Create admin-only routes

**Create file:** `mern_vb_backend/controllers/adminController.js`

```js
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');

exports.listGroups = async (req, res) => {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  const groups = await Group.find({}).sort({ createdAt: -1 }).lean();

  // Attach member count to each group
  const groupIds = groups.map(g => g._id);
  const memberCounts = await GroupMember.aggregate([
    { $match: { groupId: { $in: groupIds }, active: true } },
    { $group: { _id: '$groupId', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(memberCounts.map(m => [m._id.toString(), m.count]));

  const result = groups.map(g => ({
    _id: g._id,
    name: g.name,
    slug: g.slug,
    memberCount: countMap[g._id.toString()] || 0,
    trialExpiresAt: g.trialExpiresAt,
    isPaid: g.isPaid,
    trialActive: g.isPaid || (g.trialExpiresAt > new Date()),
    createdAt: g.createdAt,
  }));

  res.json(result);
};

exports.getGroup = async (req, res) => {
  if (!req.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  const group = await Group.findById(req.params.groupId).lean();
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const members = await GroupMember.find({ groupId: group._id, active: true })
    .select('name role phone email createdAt')
    .lean();

  res.json({ ...group, members });
};
```

**Create file:** `mern_vb_backend/routes/admin.js`

```js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const adminController = require('../controllers/adminController');

// Both routes require auth + resolveGroup (which checks SuperAdmin)
router.get('/groups', verifyToken, resolveGroup, adminController.listGroups);
router.get('/groups/:groupId', verifyToken, resolveGroup, adminController.getGroup);

module.exports = router;
```

**File:** `mern_vb_backend/server.js` — mount the admin routes:

Add this line after the existing route mounts (after line 35):
```js
app.use('/api/admin', require('./routes/admin'));
```

---

## PART 5 — WILLIAM'S EXISTING GROUP

### Step 5.1: Update William's Group document

William's group was migrated in Day 4. His Group document needs two fields
set so he never hits the trial wall.

**Option A: MongoDB Atlas manual update**

In MongoDB Atlas → Collections → groups → find William's group document
(slug: `williams-group`) → edit:

```json
{
  "trialExpiresAt": { "$date": "2099-12-31T00:00:00.000Z" },
  "isPaid": true
}
```

**Option B: One-line script**

**Create file:** `mern_vb_backend/scripts/markWilliamPaid.js`

```js
require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);
  const result = await Group.updateOne(
    { slug: 'williams-group' },
    { $set: { trialExpiresAt: new Date('2099-12-31'), isPaid: true } }
  );
  console.log('Updated:', result.modifiedCount, 'document(s)');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
```

Run:
```bash
cd mern_vb_backend && node scripts/markWilliamPaid.js
```

### Step 5.2: Verify

After running the script, confirm in MongoDB Atlas:
- William's Group has `isPaid: true`
- William's Group has `trialExpiresAt: 2099-12-31`

---

## IMPLEMENTATION ORDER

Execute in this exact order. Do not skip ahead.

| Phase | Step | What | Files |
|-------|------|------|-------|
| **1** | 1.1 | Add `GET /api/auth/test` endpoint | `routes/auth.js` |
| **1** | 1.2 | Clear stale browser cookies for localhost | Manual (browser DevTools) |
| **1** | 1.3 | Verify frontend token attachment in browser DevTools | Manual |
| **1** | 1.4 | Debug backend if 401 persists | `middleware/auth.js`, `server.js`, `.env` |
| **1** | 1.5 | Fix Dashboard race condition if needed | `store/auth.jsx`, `App.jsx` |
| **1** | 1.6 | Confirm `GET /api/auth/test` returns 200 | Manual |
| **1** | 1.7 | Clean up debug endpoints and console.error logging | `routes/auth.js`, `server.js`, `middleware/auth.js` |
| **2** | 2.1 | Add `trialExpiresAt` + `isPaid` to Group model | `models/Group.js` |
| **2** | 2.2 | Create `checkTrial` middleware | `middleware/checkTrial.js` (new) |
| **2** | 2.3 | Wire `checkTrial` into 9 route files | `routes/*.js` |
| **2** | 2.4 | Add `trialActive` to `/auth/me` response | `controllers/authController.js` |
| **2** | 2.5 | Frontend trial state + banner + button disabling + 403 interceptor | `store/auth.jsx`, `components/TrialBanner.jsx` (new), `App.jsx` |
| **3** | 3.1 | Verify onboarding gate works after auth fix; update gate to redirect to `/welcome` | Manual + `App.jsx` |
| **3** | 3.1a | Create `/welcome` promotional holding page with CTA | `pages/Welcome.jsx` (new), `App.jsx` |
| **3** | 3.1b | Guard `/onboarding` route with `sessionStorage.trialAccepted` check | `App.jsx` |
| **3** | 3.2 | Add super admin bypass to `ProtectedRoute` | `store/auth.jsx`, `App.jsx` |
| **3** | 3.3 | Expand onboarding wizard to 4 steps | `pages/Onboarding.jsx` |
| **3** | 3.4 | Update `POST /api/groups` to accept wizard fields + set trial | `controllers/groupController.js` |
| **4** | 4.1 | Create SuperAdmin model | `models/SuperAdmin.js` (new) |
| **4** | 4.2 | Create seed script | `scripts/seedSuperAdmin.js` (new) |
| **4** | 4.3 | Update `resolveGroup` to check SuperAdmin | `middleware/resolveGroup.js` |
| **4** | 4.4 | Update `authController.me` for super admin | `controllers/authController.js` |
| **4** | 4.5 | Create admin routes + controller | `controllers/adminController.js` (new), `routes/admin.js` (new), `server.js` |
| **5** | 5.1 | Mark William's group as paid | `scripts/markWilliamPaid.js` (new) or Atlas manual |
| **5** | 5.2 | Run seed script for super admin | `scripts/seedSuperAdmin.js` |

---

## FILES CREATED (NEW)

| File | Purpose |
|------|---------|
| `mern_vb_backend/middleware/checkTrial.js` | Trial expiry enforcement middleware |
| `mern_vb_backend/models/SuperAdmin.js` | Super admin identity model |
| `mern_vb_backend/controllers/adminController.js` | Super admin group listing |
| `mern_vb_backend/routes/admin.js` | Admin API routes |
| `mern_vb_backend/scripts/seedSuperAdmin.js` | Idempotent super admin seeder |
| `mern_vb_backend/scripts/markWilliamPaid.js` | One-time: mark William's group as paid |
| `mern-vb-frontend/src/components/TrialBanner.jsx` | Trial expired banner component |
| `mern-vb-frontend/src/pages/Welcome.jsx` | Promotional holding page — shown to new users before onboarding |

## FILES MODIFIED

| File | What changes |
|------|-------------|
| `mern_vb_backend/models/Group.js` | Add `trialExpiresAt`, `isPaid` fields |
| `mern_vb_backend/middleware/resolveGroup.js` | Add SuperAdmin check before GroupMember lookup |
| `mern_vb_backend/middleware/auth.js` | Remove debug console.error logging |
| `mern_vb_backend/controllers/authController.js` | Add trialActive, SuperAdmin to `/me` response |
| `mern_vb_backend/controllers/groupController.js` | Accept wizard fields, set trialExpiresAt |
| `mern_vb_backend/routes/auth.js` | Add/remove test endpoint |
| `mern_vb_backend/server.js` | Mount `/api/admin` routes, remove debug endpoint |
| `mern_vb_backend/routes/*.js` (9 files) | Add `checkTrial` to middleware chain |
| `mern-vb-frontend/src/store/auth.jsx` | Add trialActive state, isSuperAdmin, 403 interceptor |
| `mern-vb-frontend/src/App.jsx` | Add TrialBanner to Layout, super admin bypass, `/welcome` route, `sessionStorage` guard on `/onboarding` |
| `mern-vb-frontend/src/pages/Onboarding.jsx` | Rewrite: 4-step wizard with settings + helper text |

---

## TEST CASES

### T1: Auth diagnostic (Part 1 gate)
1. Sign in via Clerk in browser
2. `GET /api/auth/test` → expect `{ ok: true, clerkUserId: "user_xxx" }` (200)
3. If 401 → debug per Step 1.3 checklist, do not proceed

### T2: William logs in (existing user, isPaid group)
1. William signs in via Clerk
2. `GET /api/auth/me` → returns membership with `trialActive: true, isPaid: true`
3. Dashboard loads, no onboarding redirect, no trial banner
4. All CRUD operations work normally

### T3: New user signup → /welcome → /onboarding → dashboard
1. Sign up with a new Clerk account (not linked to any GroupMember)
2. `GET /api/auth/me` → returns `{ code: 'NO_GROUP' }` (403)
3. Frontend sets `needsOnboarding: true` → `ProtectedRoute` redirects to `/welcome`
4. `/welcome` page loads — app name, value proposition, pricing, CTA button
5. User clicks "Start my 15-day free trial" → `sessionStorage.setItem('trialAccepted', '1')` → navigate to `/onboarding`
6. Complete 4-step wizard:
   - Step 1: Group name, meeting day, cycle start, cycle length
   - Step 2: Display name, phone, interest rate, method, loan limit
   - Step 3: Fine amount, fine type
   - Step 4: Summary → Create Group
7. `POST /api/groups` → creates Group (with trialExpiresAt = now + 15 days), GroupSettings, GroupMember, BankBalance
8. `refreshMembership()` → `/auth/me` returns membership
9. Welcome screen: "Your group is ready. Start by adding your first member."
10. Click "Go to Dashboard" → dashboard loads correctly

### T3a: New user lands on /welcome, not /onboarding
1. Sign up with a new Clerk account
2. Navigate to any protected route (e.g. `/dashboard`)
3. `needsOnboarding: true` → redirected to `/welcome`, **not** `/onboarding`
4. `/welcome` page is the first thing they see

### T3b: Direct navigation to /onboarding without /welcome → redirected
1. New signed-in user with no GroupMember
2. Manually navigate to `/onboarding` in the URL bar
3. `sessionStorage.getItem('trialAccepted')` is absent
4. Redirected to `/welcome`

### T3c: /welcome CTA → /onboarding accessible
1. On `/welcome`, click "Start my 15-day free trial"
2. `sessionStorage.trialAccepted` is now set
3. `/onboarding` loads correctly (no redirect back to `/welcome`)

### T4: Trial expired group
1. In MongoDB Atlas, set a group's `trialExpiresAt` to a past date, `isPaid: false`
2. Sign in as that group's admin
3. `GET /api/auth/me` → returns `trialActive: false`
4. Dashboard loads — all data is visible and readable
5. Trial banner appears: "Your 15-day free trial has ended..."
6. Try to create a loan (`POST /api/loans`) → 403 `{ error: "trial_expired" }`
7. Write buttons are disabled in the UI
8. Export buttons are hidden

### T5: isPaid group (no trial restrictions)
1. Sign in as member of a group with `isPaid: true`
2. No trial banner, all operations work
3. `trialExpiresAt` value is irrelevant when `isPaid: true`

### T6: Super admin
1. Run `seedSuperAdmin.js` with William's Clerk userId
2. Sign in as William
3. `GET /api/auth/me` → returns `{ isSuperAdmin: true }`
4. No onboarding redirect (even if no GroupMember for this clerkUserId — but
   William does have one, so this is a secondary check)
5. `GET /api/admin/groups` → returns list of all groups with member counts + trial status
6. `GET /api/admin/groups/:groupId` → returns full group details with member list
7. Super admin cannot accidentally corrupt group data — `req.groupScope` is undefined,
   so group-scoped controllers return empty results (safe failure mode)

### T7: Super admin skips onboarding gate
1. Create a new SuperAdmin record for a Clerk user who has NO GroupMember
2. Sign in as that user
3. `GET /api/auth/me` → returns `{ isSuperAdmin: true }` (no NO_GROUP error)
4. Frontend does NOT redirect to `/onboarding`
5. Dashboard may be empty (no group data) but no errors

---

## ENVIRONMENT VARIABLES

**Backend `.env` — add these:**
```
SUPER_ADMIN_CLERK_ID=user_xxx
SUPER_ADMIN_EMAIL=william@example.com
```

(The `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, etc. should already be
set from Day 4.)

---

## VERIFICATION LOOP

After implementation, run the standard verification:

```bash
# Step 1: Tests
cd mern_vb_backend && pnpm test

# Step 2: Console.log sweep
grep -r "console.log" mern_vb_backend/controllers mern_vb_backend/middleware mern_vb_backend/routes

# Step 3: Manual browser test
# - Sign in as William → dashboard loads
# - Sign up as new user → onboarding wizard → 4 steps → dashboard
# - GET /api/auth/test → 200 with clerkUserId
```

---

This plan is self-contained. A fresh Sonnet session can implement it from this file alone.
