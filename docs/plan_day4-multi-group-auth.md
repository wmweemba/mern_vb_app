# Plan: Multi-Group Auth & Data Isolation (Day 4 — Revised)

## Context

Chama360 is currently a single-group app with custom JWT auth. All data belongs
to William's group with no isolation. This plan adds multi-group support using:

- **Clerk** for identity only (sign-up, sign-in, Google OAuth, session tokens)
- **MongoDB** for group membership, roles, and data isolation

**Why not Clerk Organisations?** Free plan caps groups at 5 members. Village
banking groups have 10-30 members. Clerk Organisations requires a $25/month Pro
plan. We are not paying for auth before we have paying customers.

---

## 1. AUDIT: Current Isolation Gaps

### 1a. Model Inventory

| Model | File | Has `userId` | Has `groupId` | Gap? |
|-------|------|:---:|:---:|:---:|
| User | `models/User.js` | N/A (is the user) | **NO** | **YES — being replaced by GroupMember** |
| Loan | `models/Loans.js` | YES (line 4) | **NO** | **YES** |
| Saving | `models/Savings.js` | YES (line 4) | **NO** | **YES** |
| Transaction | `models/Transaction.js` | YES (line 3) | **NO** | **YES** |
| Fine | `models/Fine.js` | YES (line 4) | **NO** | **YES** |
| BankBalance | `models/BankBalance.js` | **NO** | **NO** | **CRITICAL — singleton** |
| Threshold | `models/Threshold.js` | **NO** | **NO** | **CRITICAL — singleton** |
| GroupSettings | `models/GroupSettings.js` | **NO** | **NO** | **CRITICAL — singleton** |

### 1b. Controller Leakage Points (25+ functions)

Functions that return ALL documents without group filter:

**loanController.js:** `getAllLoans` (line 487), `exportLoansReport` (line 399),
`exportLoansReportPDF` (line 436), `updateLoan` (line 100), `deleteLoan` (line 291)

**savingsController.js:** `getAllSavings` (line 73), `getDashboardStats`
(lines 161, 174), `exportSavingsReport` (line 197), `updateSaving` (line 91)

**paymentController.js:** `getUnpaidFines` (line 224), `deleteAllFines` (line 233),
`getAllFines` (line 247), `payFine` (line 201), `editFine` (line 262),
`voidFine` (line 286), `deleteFine` (line 323)

**transactionController.js:** `getAllTransactions` (line 18),
`exportTransactionsReport` (line 47)

**bankBalanceController.js:** `getBankBalance` (line 8), `setBankBalance` (line 23),
`updateBankBalance` (line 37 — internal helper, 11 call sites),
`getTotalFines` (line 52)

**groupSettingsController.js:** `getSettings` (line 7 — internal helper, 4 call sites),
`getGroupSettings` (line 17), `updateGroupSettings` (line 31)

**thresholdController.js:** `getLatestThreshold` (line 30),
`getThresholdDefaulters` (lines 42-43), `exportThresholdDefaulters` (lines 70-71)

**cycleController.js:** `beginNewCycle` (lines 59, 85, 97, 108),
`archiveCurrentCycleData` (lines 139-168), `resetForNewCycle` (lines 180-192),
`getHistoricalReports` (lines 254, 277, 293)

**enhancedReportsController.js:** All 4 functions (lines 111, 168, 185, 216-234)

**userController.js:** `getUsers` (line 18)

### 1c. Current Auth Flow (being replaced)

- `middleware/auth.js`: custom JWT verify, sets `req.user = { id, role }`
- `controllers/authController.js`: login only, signs JWT with `{ id, role }`
- `store/auth.jsx`: stores token in localStorage, axios interceptor injects it
- `App.jsx`: `RoleRoute` component checks `user.role`
- No public registration endpoint — admin creates users manually

---

## 2. ARCHITECTURE

```
Clerk (external)
  └── manages identity: sign-up, sign-in, Google OAuth, session tokens

MongoDB (internal)
  ├── Group
  │     ├── GroupSettings (1:1 via groupId)
  │     ├── BankBalance (1:1 via groupId)
  │     ├── Threshold (N via groupId)
  │     └── GroupMember (N via groupId)
  │           ├── Loan (N via userId = GroupMember._id)
  │           ├── Saving (N via userId = GroupMember._id)
  │           ├── Transaction (N via userId = GroupMember._id)
  │           └── Fine (N via userId = GroupMember._id)
  └── InviteToken (N — pending invites)
```

**Key decisions:**

1. `GroupMember` replaces the old `User` model for group membership.
   The `userId` field in Loan, Saving, Transaction, Fine now references
   `GroupMember._id` instead of `User._id`.

2. During migration, GroupMember records are created with the **same _id**
   as existing User records. This preserves all existing `userId` references
   without updating them.

3. Controllers never call GroupMember directly. The `resolveGroup` middleware
   looks up the member and attaches `req.groupId`, `req.memberId`, `req.role`
   to every authenticated request.

4. `groupId` lives on EVERY data model (denormalized). Controllers filter by
   `{ groupId: req.groupId }` on every query.

---

## 3. NEW MODELS

### 3a. Group

**Create file:** `mern_vb_backend/models/Group.js`

```js
const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  clerkAdminId: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
```

### 3b. GroupMember

**Create file:** `mern_vb_backend/models/GroupMember.js`

```js
const mongoose = require('mongoose');

const groupMemberSchema = new mongoose.Schema({
  clerkUserId: {
    type: String,
    default: null,
    sparse: true,
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ['admin', 'treasurer', 'loan_officer', 'member'],
    default: 'member',
    required: true,
  },
  name: { type: String, required: true },
  phone: { type: String },
  email: { type: String },
  active: { type: Boolean, default: true },
}, { timestamps: true });

// A Clerk user can only be in a group once
groupMemberSchema.index({ clerkUserId: 1, groupId: 1 }, {
  unique: true,
  partialFilterExpression: { clerkUserId: { $ne: null } }
});

// Fast lookup by Clerk ID (used on every request by resolveGroup)
groupMemberSchema.index({ clerkUserId: 1 });

module.exports = mongoose.model('GroupMember', groupMemberSchema);
```

**Fields explained:**
- `clerkUserId` — Clerk's user ID string (e.g. `"user_2abc..."`). Null for
  legacy members who haven't linked their Clerk account yet.
- `groupId` — which group this membership belongs to
- `role` — same enum as old User model: admin, treasurer, loan_officer, member
- `name` — display name (replaces old User.name and User.username)
- `phone` — for WhatsApp invite delivery
- `email` — optional
- `active` — soft-delete for deactivated members

**Indexes:**
- `{ clerkUserId: 1, groupId: 1 }` unique partial — one Clerk user per group
- `{ clerkUserId: 1 }` — fast lookup for resolveGroup middleware (runs every request)
- `{ groupId: 1 }` — fast group member listing

### 3c. InviteToken (stored in DB for one-time-use enforcement)

**Create file:** `mern_vb_backend/models/InviteToken.js`

```js
const mongoose = require('mongoose');

const inviteTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  role: {
    type: String,
    enum: ['admin', 'treasurer', 'loan_officer', 'member'],
    default: 'member',
  },
  name: { type: String, required: true },
  phone: { type: String },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember', required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  usedBy: { type: String, default: null },
}, { timestamps: true });

// Auto-delete expired unused tokens after 7 days
inviteTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('InviteToken', inviteTokenSchema);
```

---

## 4. SCHEMA CHANGES TO EXISTING MODELS

### 4a. Add `groupId` to 7 data models

Add this field to each model schema:

```js
groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
```

| Model | File | Insert after |
|-------|------|-------------|
| Loan | `models/Loans.js` | After `userId` field (line 4) |
| Saving | `models/Savings.js` | After `userId` field (line 4) |
| Transaction | `models/Transaction.js` | After `userId` field (line 3) |
| Fine | `models/Fine.js` | After `userId` field (line 4) |
| BankBalance | `models/BankBalance.js` | After `balance` field (line 4) |
| Threshold | `models/Threshold.js` | After `cycle` field (line 5) |
| GroupSettings | `models/GroupSettings.js` | After `groupName` field (line 4) |

**Unique constraints** (one per group):

In `BankBalance.js`: `bankBalanceSchema.index({ groupId: 1 }, { unique: true });`
In `GroupSettings.js`: `groupSettingsSchema.index({ groupId: 1 }, { unique: true });`

### 4b. Change `userId` refs from 'User' to 'GroupMember'

In these 4 model files, change the `ref` on userId fields:

```js
// Before:
userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
// After:
userId: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMember', required: true }
```

Files: `models/Loans.js`, `models/Savings.js`, `models/Transaction.js`,
`models/Fine.js` (both `userId` and `issuedBy` fields)

The actual ObjectId values stay the same (migration creates GroupMember with
matching _ids), so no data migration is needed for these fields.

### 4c. Old User model

**File:** `models/User.js` — keep the file but stop using it in controllers.
Do NOT delete it yet — the migration script reads from it. Mark deprecated
with a comment at the top:

```js
// DEPRECATED: Replaced by GroupMember + Clerk auth. Kept for migration reference.
```

---

## 5. CLERK SETUP

### 5a. Backend — Install and configure

```bash
cd mern_vb_backend && pnpm add @clerk/express
```

**File:** `mern_vb_backend/.env` — add:
```
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
INVITE_JWT_SECRET=<generate a separate random secret for invite tokens>
```

**File:** `mern_vb_backend/server.js` — add Clerk middleware:

```js
const { clerkMiddleware } = require('@clerk/express');

// Add BEFORE route mounting, AFTER cors and json:
app.use(clerkMiddleware());
```

### 5b. Frontend — Install and configure

```bash
cd mern-vb-frontend && pnpm add @clerk/clerk-react
```

**File:** `mern-vb-frontend/.env` — add:
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

**File:** `mern-vb-frontend/src/main.jsx` — wrap app with ClerkProvider:

```jsx
import { ClerkProvider } from '@clerk/clerk-react';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

root.render(
  <ClerkProvider publishableKey={clerkKey}>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </ClerkProvider>
);
```

---

## 6. AUTH MIDDLEWARE (replaces middleware/auth.js)

### 6a. Clerk auth — replaces verifyToken

**File:** `mern_vb_backend/middleware/auth.js` — rewrite:

```js
const { requireAuth, getAuth } = require('@clerk/express');

// Verifies Clerk session token. Replaces the old JWT verifyToken.
// After this middleware, req.auth.userId contains the Clerk user ID.
const verifyToken = requireAuth();

// Role checking — now reads from req.role (set by resolveGroup below)
const requireRole = (role) => (req, res, next) => {
  if (req.role !== role) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

module.exports = { verifyToken, requireRole };
```

### 6b. resolveGroup — new middleware

**Create file:** `mern_vb_backend/middleware/resolveGroup.js`

```js
const GroupMember = require('../models/GroupMember');

/**
 * Looks up the authenticated Clerk user's GroupMember record.
 * Attaches to req: groupId, memberId, role, member, groupScope.
 *
 * Mount AFTER verifyToken (Clerk's requireAuth) on all group-scoped routes.
 * If the user has no GroupMember record, returns 403 with onboarding flag.
 */
async function resolveGroup(req, res, next) {
  try {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
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

    // Backward compat: controllers that check req.user.role still work
    req.user = { id: member._id, role: member.role, groupId: member.groupId };

    next();
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve group', details: err.message });
  }
}

module.exports = { resolveGroup };
```

**The `code: 'NO_GROUP'` response** is how the frontend detects the onboarding
gate — if a Clerk-authenticated user gets this code, redirect to `/onboarding`.

### 6c. Wire into route files

Every route file currently imports:
```js
const { verifyToken, requireRole } = require('../middleware/auth');
```

Add after it:
```js
const { resolveGroup } = require('../middleware/resolveGroup');
```

Update every route's middleware chain — insert `resolveGroup` after `verifyToken`:

```js
// Before:
router.get('/', verifyToken, controller.getAll);
// After:
router.get('/', verifyToken, resolveGroup, controller.getAll);
```

**9 route files to update:** `routes/users.js`, `routes/loans.js`,
`routes/savings.js`, `routes/payment.js`, `routes/transactions.js`,
`routes/bankBalance.js`, `routes/cycle.js`, `routes/reports.js`,
`routes/groupSettings.js`

**Do NOT add to `routes/auth.js`** — login/register/invite routes handle
auth differently.

### 6d. The `allowRoles` helper in route files

Several route files define a local `allowRoles` helper that checks
`req.user.role`. Since `resolveGroup` sets `req.user = { role }` for
backward compat, these helpers continue working without changes.

---

## 7. CONTROLLER SCOPING — Every Function

### 7a. Scoping Pattern (same as original plan)

Every query gets `...req.groupScope` spread into it:

```js
// Before (leaks across groups):
const loans = await Loan.find({ archived: { $ne: true } });

// After (scoped to group):
const loans = await Loan.find({ ...req.groupScope, archived: { $ne: true } });
```

For `findById` calls, switch to `findOne` with group check:
```js
const loan = await Loan.findOne({ _id: loanId, ...req.groupScope });
```

For `create` calls, spread groupScope into the new document:
```js
const loan = new Loan({ ...req.groupScope, userId: req.memberId, amount, ... });
```

### 7b. User lookups — replace User model with GroupMember

Many controllers do `User.findOne({ username })` to look up members. Replace:

```js
// Before:
const User = require('../models/User');
const user = await User.findOne({ username });

// After:
const GroupMember = require('../models/GroupMember');
const member = await GroupMember.findOne({ name: username, ...req.groupScope });
```

Controllers that need this change:
- `loanController.js`: `createLoan` (line 236), `repayInstallment` (line 334)
- `savingsController.js`: `createSaving` (line 26)
- `paymentController.js`: `repayment` (line 50), `fine` (line 186)

Also update `populate('userId', 'username name email')` calls to
`populate('userId', 'name email phone')` (GroupMember has `name` not `username`).

### 7c. Internal Helper Signature Changes

**`transactionController.js` — `logTransaction`** (line 34, 11 call sites):

```js
// Change to accept groupId:
exports.logTransaction = async ({ userId, type, amount, referenceId, note, groupId }, session = null) => {
  const transaction = new Transaction({ userId, type, amount, referenceId, note, groupId });
```

Every caller passes `groupId: req.groupId`:
- `loanController.js` lines 46, 215, 271, 308
- `paymentController.js` lines 125, 173, 207, 293, 329
- `savingsController.js` lines 48, 141

**`bankBalanceController.js` — `updateBankBalance`** (line 37, 11 call sites):

```js
// Change to accept groupId:
exports.updateBankBalance = async (amount, groupId, session = null) => {
  let doc = await BankBalance.findOne({ groupId }).session(session);
  if (!doc) {
    doc = await BankBalance.create([{ balance: 0, groupId }], { session });
    doc = doc[0];
  }
  // ... rest unchanged
```

Every caller passes `groupId` as second arg:
- `loanController.js` lines 43, 212, 278, 305
- `savingsController.js` lines 55, 138
- `paymentController.js` lines 122, 172, 215, 292, 328

**`groupSettingsController.js` — `getSettings`** (line 7, 4 call sites):

```js
exports.getSettings = async (groupId) => {
  const settings = await GroupSettings.findOne({ groupId });
```

Every caller passes `req.groupId`:
- `loanController.js` lines 241, 346
- `savingsController.js` lines 21, 109

### 7d. Complete Controller Edit List

Same list as the original plan Section 6c — every function, same scoping
pattern. The only additional change is replacing `User` model references
with `GroupMember` references as described in 7b above.

### 7e. userController.js — major rewrite

This controller currently manages User records. It becomes a GroupMember
manager scoped to the current group.

**Rename file:** `controllers/userController.js` → keep the filename but
change internals to operate on GroupMember:

```js
const GroupMember = require('../models/GroupMember');

exports.getMembers = async (req, res) => {
  const members = await GroupMember.find({ ...req.groupScope, active: true })
    .select('-clerkUserId');
  res.json(members);
};

exports.updateMember = async (req, res) => {
  const member = await GroupMember.findOne({ _id: req.params.id, ...req.groupScope });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const { name, role, phone, email } = req.body;
  if (name) member.name = name;
  if (role) member.role = role;
  if (phone) member.phone = phone;
  if (email) member.email = email;
  await member.save();
  res.json(member);
};

exports.deactivateMember = async (req, res) => {
  const member = await GroupMember.findOne({ _id: req.params.id, ...req.groupScope });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  member.active = false;
  await member.save();
  res.json({ message: 'Member deactivated' });
};
```

`createUser` is removed — members are added via the invite flow (Section 10).

---

## 8. MIGRATION SCRIPT

**Create file:** `mern_vb_backend/scripts/migrateAddGroupId.js`

```js
require('dotenv').config();
const mongoose = require('mongoose');

// Models
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupSettings = require('../models/GroupSettings');
const Loan = require('../models/Loans');
const Saving = require('../models/Savings');
const Transaction = require('../models/Transaction');
const Fine = require('../models/Fine');
const BankBalance = require('../models/BankBalance');
const Threshold = require('../models/Threshold');

// Old model — read-only during migration
const User = mongoose.model('LegacyUser', new mongoose.Schema({}, { strict: false }), 'users');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true }
};

const DRY_RUN = process.argv.includes('--dry-run');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);
  console.log(`Connected to MongoDB ${DRY_RUN ? '(DRY RUN — no writes)' : ''}`);

  // Step 1: Find or create Group for William's group
  let group = await Group.findOne({ slug: 'williams-group' });
  if (!group) {
    if (DRY_RUN) {
      console.log('[DRY] Would create Group: "William\'s Group" (slug: williams-group)');
      // Use a fake ObjectId for dry-run logging
      group = { _id: new mongoose.Types.ObjectId(), name: "William's Group" };
    } else {
      group = await Group.create({ name: "William's Group", slug: 'williams-group' });
      console.log('Created Group:', group._id);
    }
  } else {
    console.log('Group already exists:', group._id);
  }
  const groupId = group._id;

  // Step 2: Create GroupMember records from existing User records
  // Use the SAME _id so existing userId references in Loans/Savings/etc. still work
  const legacyUsers = await User.find({});
  console.log(`Found ${legacyUsers.length} legacy User records`);

  for (const user of legacyUsers) {
    const exists = await GroupMember.findById(user._id);
    if (exists) {
      console.log(`  GroupMember already exists for ${user.name || user.username} — skip`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`[DRY] Would create GroupMember: _id=${user._id}, name=${user.name || user.username}, role=${user.role}`);
    } else {
      await GroupMember.create({
        _id: user._id,
        clerkUserId: null,  // Set later when user links Clerk account
        groupId,
        role: user.role || 'member',
        name: user.name || user.username,
        phone: user.phone || null,
        email: user.email || null,
      });
      console.log(`  Created GroupMember: ${user.name || user.username} (${user.role})`);
    }
  }

  // Step 3: Stamp all data documents that lack groupId
  const filter = { groupId: { $exists: false } };
  const collections = [
    { model: Loan, name: 'Loan' },
    { model: Saving, name: 'Saving' },
    { model: Transaction, name: 'Transaction' },
    { model: Fine, name: 'Fine' },
    { model: BankBalance, name: 'BankBalance' },
    { model: Threshold, name: 'Threshold' },
    { model: GroupSettings, name: 'GroupSettings' },
  ];

  for (const { model, name } of collections) {
    const count = await model.countDocuments(filter);
    if (DRY_RUN) {
      console.log(`[DRY] Would stamp ${count} ${name} documents with groupId`);
    } else {
      const result = await model.updateMany(filter, { $set: { groupId } });
      console.log(`${name}: stamped ${result.modifiedCount} documents`);
    }
  }

  // Step 4: Link group to first admin member
  const adminMember = await GroupMember.findOne({ role: 'admin', groupId });
  if (adminMember && !DRY_RUN) {
    await Group.findByIdAndUpdate(groupId, { clerkAdminId: null }); // Set when William links Clerk
    console.log('Admin member found:', adminMember.name);
  }

  console.log(DRY_RUN ? '\nDry run complete. No data was modified.' : '\nMigration complete.');
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

**Run dry-run first:**
```bash
cd mern_vb_backend && node scripts/migrateAddGroupId.js --dry-run
```

**Then run for real:**
```bash
cd mern_vb_backend && node scripts/migrateAddGroupId.js
```

**Safety guarantees:**
- Dry-run mode logs every action without writing
- GroupMember creation checks `findById` first — idempotent
- Data stamping uses `{ groupId: { $exists: false } }` — idempotent
- Never deletes or overwrites existing data

---

## 9. FRONTEND AUTH — Replace Custom JWT with Clerk

### 9a. Rewrite store/auth.jsx

**File:** `mern-vb-frontend/src/store/auth.jsx`

The old AuthProvider (custom JWT, login function, localStorage token) is
replaced by Clerk's hooks. The store becomes a thin wrapper:

```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import axios from 'axios';
import { API_BASE_URL } from '../lib/utils';

const AppContext = createContext();

export const AuthProvider = ({ children }) => {
  const { getToken, isSignedIn, isLoaded } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [groupMember, setGroupMember] = useState(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Axios interceptor: inject Clerk session token on every request
  useEffect(() => {
    const id = axios.interceptors.request.use(async (config) => {
      if (isSignedIn) {
        const token = await getToken();
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
    return () => axios.interceptors.request.eject(id);
  }, [isSignedIn, getToken]);

  // After sign-in, fetch group membership from backend
  useEffect(() => {
    if (!isSignedIn) {
      setGroupMember(null);
      setNeedsOnboarding(false);
      return;
    }
    axios.get(`${API_BASE_URL}/auth/me`)
      .then(res => {
        setGroupMember(res.data);
        setNeedsOnboarding(false);
      })
      .catch(err => {
        if (err.response?.data?.code === 'NO_GROUP') {
          setNeedsOnboarding(true);
        }
      });
  }, [isSignedIn]);

  const value = {
    isLoaded,
    isSignedIn,
    clerkUser,
    user: groupMember,       // { _id, name, role, groupId } — backward compat
    needsOnboarding,
    refreshMembership: () => {
      // Re-fetch after onboarding or invite acceptance
      return axios.get(`${API_BASE_URL}/auth/me`)
        .then(res => { setGroupMember(res.data); setNeedsOnboarding(false); });
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAuth = () => useContext(AppContext);
```

### 9b. New backend endpoint: GET /api/auth/me

**File:** `mern_vb_backend/controllers/authController.js` — rewrite:

```js
const { getAuth } = require('@clerk/express');
const GroupMember = require('../models/GroupMember');

exports.me = async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

  const member = await GroupMember.findOne({ clerkUserId, active: true });
  if (!member) {
    return res.status(403).json({ error: 'No group membership', code: 'NO_GROUP' });
  }
  res.json({
    _id: member._id,
    name: member.name,
    role: member.role,
    groupId: member.groupId,
    phone: member.phone,
    email: member.email,
  });
};
```

**Route:** In `routes/auth.js`:
```js
const { verifyToken } = require('../middleware/auth');
router.get('/me', verifyToken, authController.me);
```

### 9c. App.jsx — Onboarding Gate

**File:** `mern-vb-frontend/src/App.jsx`

Replace the old `RoleRoute` with Clerk-aware routing:

```jsx
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { useAuth } from './store/auth';

function ProtectedRoute({ children }) {
  const { isLoaded, needsOnboarding } = useAuth();
  if (!isLoaded) return <LoadingSpinner />;
  return (
    <SignedIn>
      {needsOnboarding ? <Navigate to="/onboarding" replace /> : children}
    </SignedIn>
  );
}

function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}
```

Routes:
```jsx
<Route path="/sign-in/*" element={<SignInPage />} />
<Route path="/sign-up/*" element={<SignUpPage />} />
<Route path="/onboarding" element={<SignedIn><Onboarding /></SignedIn>} />
<Route path="/invite" element={<InviteAccept />} />
<Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
{/* ... all other protected routes wrapped in ProtectedRoute */}
```

### 9d. Sign-in and Sign-up pages

**Create:** `mern-vb-frontend/src/pages/SignIn.jsx`
```jsx
import { SignIn } from '@clerk/clerk-react';
export default function SignInPage() {
  return <SignIn routing="path" path="/sign-in" afterSignInUrl="/dashboard" />;
}
```

**Create:** `mern-vb-frontend/src/pages/SignUp.jsx`
```jsx
import { SignUp } from '@clerk/clerk-react';
export default function SignUpPage() {
  return <SignUp routing="path" path="/sign-up" afterSignUpUrl="/dashboard" />;
}
```

Remove old `pages/Login.jsx` or keep as redirect to `/sign-in`.

---

## 10. ONBOARDING FLOW (Treasurer creates group)

### 10a. Backend: POST /api/groups

**Create file:** `mern_vb_backend/controllers/groupController.js`

```js
const mongoose = require('mongoose');
const { getAuth } = require('@clerk/express');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupSettings = require('../models/GroupSettings');
const BankBalance = require('../models/BankBalance');

exports.createGroup = async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const { groupName, treasurerName, phone } = req.body;

  if (!groupName || !treasurerName) {
    return res.status(400).json({ error: 'groupName and treasurerName are required' });
  }

  const slug = groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Check if user already has a group
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

      const [group] = await Group.create([{
        name: groupName, slug, clerkAdminId: clerkUserId
      }], { session });

      const [member] = await GroupMember.create([{
        clerkUserId,
        groupId: group._id,
        role: 'admin',
        name: treasurerName,
        phone: phone || null,
      }], { session });

      // Default GroupSettings (same values as seed script)
      await GroupSettings.create([{
        groupId: group._id,
        groupName,
        cycleLengthMonths: 6,
        interestRate: 10,
        interestMethod: 'reducing',
        defaultLoanDuration: 4,
        loanLimitMultiplier: 3,
        latePenaltyRate: 15,
        overdueFineAmount: 1000,
        earlyPaymentCharge: 200,
        savingsInterestRate: 10,
        minimumSavingsMonth1: 3000,
        minimumSavingsMonthly: 1000,
        maximumSavingsFirst3Months: 5000,
        savingsShortfallFine: 500,
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

**Route:** Create `routes/groups.js`:
```js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const groupController = require('../controllers/groupController');

router.post('/', verifyToken, groupController.createGroup);

module.exports = router;
```

Mount in `server.js`: `app.use('/api/groups', require('./routes/groups'));`

### 10b. Frontend: Onboarding Page

**Create:** `mern-vb-frontend/src/pages/Onboarding.jsx`

Simple wizard form:
- Step 1: Group name
- Step 2: Treasurer's display name + phone
- Step 3: Confirm & create

Calls `POST /api/groups`, then calls `refreshMembership()` from auth store,
then redirects to `/dashboard`.

---

## 11. INVITE FLOW

### 11a. Generate invite — POST /api/invites

**Create file:** `mern_vb_backend/controllers/inviteController.js`

```js
const jwt = require('jsonwebtoken');
const InviteToken = require('../models/InviteToken');

const INVITE_SECRET = process.env.INVITE_JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://villagebanking.netlify.app';

exports.createInvite = async (req, res) => {
  const { name, phone, role } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const allowedRoles = ['member', 'treasurer', 'loan_officer'];
  const inviteRole = allowedRoles.includes(role) ? role : 'member';

  // Sign a JWT invite token (48 hour expiry)
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const payload = {
    groupId: req.groupId.toString(),
    role: inviteRole,
    invitedBy: req.memberId.toString(),
    name,
  };
  const token = jwt.sign(payload, INVITE_SECRET, { expiresIn: '48h' });

  // Store in DB for one-time-use enforcement
  await InviteToken.create({
    token,
    groupId: req.groupId,
    role: inviteRole,
    name,
    phone: phone || null,
    invitedBy: req.memberId,
    expiresAt,
  });

  const inviteLink = `${FRONTEND_URL}/invite?token=${token}`;
  res.status(201).json({ inviteLink, token, expiresAt });
};

exports.getInvites = async (req, res) => {
  const invites = await InviteToken.find({
    ...req.groupScope,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  res.json(invites);
};
```

### 11b. Accept invite — POST /api/invites/accept

```js
// In inviteController.js:

exports.acceptInvite = async (req, res) => {
  const { token: inviteToken } = req.body;
  if (!inviteToken) return res.status(400).json({ error: 'token is required' });

  // Verify JWT signature and expiry
  let payload;
  try {
    payload = jwt.verify(inviteToken, INVITE_SECRET);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid or expired invite token' });
  }

  // Check one-time use in DB
  const invite = await InviteToken.findOne({ token: inviteToken });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.usedAt) return res.status(400).json({ error: 'Invite has already been used' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite has expired' });

  // Get Clerk user ID from the authenticated request
  const { getAuth } = require('@clerk/express');
  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

  // Check if user is already in this group
  const existing = await GroupMember.findOne({
    clerkUserId,
    groupId: payload.groupId,
  });
  if (existing) return res.status(409).json({ error: 'Already a member of this group' });

  // Create GroupMember
  const GroupMember = require('../models/GroupMember');
  const member = await GroupMember.create({
    clerkUserId,
    groupId: payload.groupId,
    role: payload.role,
    name: payload.name,
    phone: invite.phone || null,
  });

  // Mark invite as used
  invite.usedAt = new Date();
  invite.usedBy = clerkUserId;
  await invite.save();

  res.status(201).json({
    member: { id: member._id, name: member.name, role: member.role, groupId: member.groupId },
  });
};
```

### 11c. Routes

**Create file:** `mern_vb_backend/routes/invites.js`

```js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { resolveGroup } = require('../middleware/resolveGroup');
const inviteController = require('../controllers/inviteController');

// Treasurer/admin generates invite link (requires group context)
router.post('/', verifyToken, resolveGroup, inviteController.createInvite);
router.get('/', verifyToken, resolveGroup, inviteController.getInvites);

// Member accepts invite (Clerk-authenticated but NO resolveGroup — they don't have a group yet)
router.post('/accept', verifyToken, inviteController.acceptInvite);

module.exports = router;
```

Mount in `server.js`: `app.use('/api/invites', require('./routes/invites'));`

### 11d. Frontend: Invite Accept Page

**Create:** `mern-vb-frontend/src/pages/InviteAccept.jsx`

Flow:
1. Read `token` from URL query params
2. If user is not signed in → show "Sign up to join this group" with link
   to `/sign-up?redirect_url=/invite?token=xxx`
3. If user is signed in → call `POST /api/invites/accept` with the token
4. On success → call `refreshMembership()` → redirect to `/dashboard`
5. On error → show appropriate message (expired, already used, already member)

### 11e. Clerk Webhook (alternative to manual accept)

If you want automatic GroupMember creation when a user signs up via an invite
link, set up a Clerk webhook for `user.created`:

**File:** `mern_vb_backend/controllers/webhookController.js`

```js
const { Webhook } = require('svix');
const InviteToken = require('../models/InviteToken');
const GroupMember = require('../models/GroupMember');

exports.handleClerkWebhook = async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  const headers = req.headers;
  const payload = JSON.stringify(req.body);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt;
  try {
    evt = wh.verify(payload, {
      'svix-id': headers['svix-id'],
      'svix-timestamp': headers['svix-timestamp'],
      'svix-signature': headers['svix-signature'],
    });
  } catch (err) {
    return res.status(400).json({ error: 'Webhook verification failed' });
  }

  if (evt.type === 'user.created') {
    // Check if there's a pending invite — this is optional.
    // The primary flow is the explicit POST /api/invites/accept call.
    // The webhook is a backup for edge cases.
    console.log('Clerk user.created:', evt.data.id);
  }

  res.json({ received: true });
};
```

**Route:** In `routes/auth.js`:
```js
// Webhook must receive raw body — add express.raw() middleware
router.post('/webhook', express.raw({ type: 'application/json' }), webhookController.handleClerkWebhook);
```

**Note:** The webhook is optional for MVP. The explicit `POST /api/invites/accept`
flow is the primary mechanism. Add the webhook later for robustness.

---

## 12. MEMBER DASHBOARD — Access Control

### 12a. What members CAN access

| Route | Endpoint | What they see |
|-------|----------|---------------|
| Dashboard | `GET /api/savings/dashboard` | Their own savings total only |
| My Loans | `GET /api/loans/user/:id` | Only their own loans |
| My Savings | `GET /api/savings/user/:id` | Only their own savings |
| My Transactions | `GET /api/transactions/:userId` | Only their own transactions |
| My Fines | `GET /api/fines` | Only their own fines |
| Bank Balance | `GET /api/bank-balance` | Group's balance (read-only) |
| Reports | `GET /api/reports/enhanced` | Group-level reports (read-only) |

### 12b. What members CANNOT access

| Action | Route | Enforcement |
|--------|-------|-------------|
| Create loans | `POST /api/loans` | `allowRoles('admin', 'loan_officer')` |
| Create savings | `POST /api/savings` | `allowRoles('admin', 'loan_officer')` |
| Record payments | `POST /api/payments/repayment` | `allowRoles('admin', 'treasurer', 'loan_officer')` |
| Issue fines | `POST /api/payments/fine` | `allowRoles('admin', 'treasurer', 'loan_officer')` |
| Manage users | `GET/POST /api/users` | `requireRole('admin')` |
| Edit bank balance | `PUT /api/bank-balance` | `allowRoles('admin', 'treasurer', 'loan_officer')` |
| Begin new cycle | `POST /api/cycle/begin-new-cycle` | `allowRoles('admin')` |
| Generate invites | `POST /api/invites` | `allowRoles('admin', 'treasurer')` |
| Update settings | `PUT /api/group-settings` | `requireRole('admin')` |

### 12c. Backend enforcement for member-only data

For routes that members access to see their own data, the controller must
filter by BOTH `req.groupScope` AND `req.memberId`:

```js
// In getAllFines (paymentController.js):
if (req.role === 'member') {
  query.userId = req.memberId;  // Members see only their own fines
}
```

This pattern already exists in the codebase (line 243-245 of paymentController.js)
and just needs to use `req.memberId` instead of `req.user.id`.

### 12d. Frontend enforcement

The existing `canAccessOperations` helper in `Navbar.jsx` (line 22) already
hides operations from members:

```js
const canAccessOperations = user => ['admin', 'treasurer', 'loan_officer'].includes(user?.role);
```

This continues to work because `user.role` is set from GroupMember.role.

For the member dashboard, `getDashboardStats` (savingsController.js) should
return only the member's own savings total when `req.role === 'member'`.

---

## 13. IMPLEMENTATION ORDER

### Phase 1: Models + Migration

| Step | What | Files |
|------|------|-------|
| 1 | Create Group model | `models/Group.js` (new) |
| 2 | Create GroupMember model | `models/GroupMember.js` (new) |
| 3 | Create InviteToken model | `models/InviteToken.js` (new) |
| 4 | Add `groupId` to 7 data models | `models/Loans.js`, `Savings.js`, `Transaction.js`, `Fine.js`, `BankBalance.js`, `Threshold.js`, `GroupSettings.js` |
| 5 | Change `userId` refs to GroupMember | `models/Loans.js`, `Savings.js`, `Transaction.js`, `Fine.js` |
| 6 | Run migration (dry-run then real) | `scripts/migrateAddGroupId.js` (new) |

### Phase 2: Clerk + Auth Middleware

| Step | What | Files |
|------|------|-------|
| 7 | Install Clerk packages | `pnpm add` in both backend and frontend |
| 8 | Rewrite auth middleware | `middleware/auth.js` |
| 9 | Create resolveGroup middleware | `middleware/resolveGroup.js` (new) |
| 10 | Add Clerk env vars | `.env` files in both backend and frontend |
| 11 | Add clerkMiddleware to server.js | `server.js` |
| 12 | Wire resolveGroup into all 9 route files | `routes/*.js` |

### Phase 3: Controller Scoping (helpers first, then callers)

| Step | What | Files |
|------|------|-------|
| 13 | Update `getSettings(groupId)` | `controllers/groupSettingsController.js` |
| 14 | Update `logTransaction({...groupId})` | `controllers/transactionController.js` |
| 15 | Update `updateBankBalance(amount, groupId, session)` | `controllers/bankBalanceController.js` |
| 16 | Rewrite userController → GroupMember ops | `controllers/userController.js` |
| 17 | Scope loanController (+ replace User refs) | `controllers/loanController.js` |
| 18 | Scope savingsController (+ replace User refs) | `controllers/savingsController.js` |
| 19 | Scope paymentController (+ replace User refs) | `controllers/paymentController.js` |
| 20 | Scope thresholdController | `controllers/thresholdController.js` |
| 21 | Scope cycleController | `controllers/cycleController.js` |
| 22 | Scope enhancedReportsController | `controllers/enhancedReportsController.js` |

### Phase 4: Frontend + Onboarding

| Step | What | Files |
|------|------|-------|
| 23 | Rewrite auth store (Clerk hooks) | `store/auth.jsx` |
| 24 | Add ClerkProvider to main.jsx | `main.jsx` |
| 25 | Rewrite App.jsx routing (ProtectedRoute, onboarding gate) | `App.jsx` |
| 26 | Create SignIn + SignUp pages | `pages/SignIn.jsx`, `pages/SignUp.jsx` (new) |
| 27 | Create Onboarding page | `pages/Onboarding.jsx` (new) |
| 28 | Create auth/me endpoint | `controllers/authController.js`, `routes/auth.js` |
| 29 | Create group creation endpoint | `controllers/groupController.js` (new), `routes/groups.js` (new) |

### Phase 5: Invite Flow

| Step | What | Files |
|------|------|-------|
| 30 | Create invite controller | `controllers/inviteController.js` (new) |
| 31 | Create invite routes | `routes/invites.js` (new) |
| 32 | Create InviteAccept frontend page | `pages/InviteAccept.jsx` (new) |
| 33 | Add "Invite Member" UI to admin dashboard | `pages/Users.jsx` or new component |

---

## 14. TEST CASES

### 14a. Group Isolation

1. Register Group A (treasurer signs up via Clerk, creates group via onboarding)
2. Register Group B (different Clerk account, different group)
3. Add loans, savings, fines to both groups
4. Log in as Group A admin:
   - `GET /api/loans` → ONLY Group A loans
   - `GET /api/savings` → ONLY Group A savings
   - `GET /api/users` → ONLY Group A members
   - `GET /api/bank-balance` → Group A balance
   - `GET /api/transactions` → ONLY Group A transactions
   - `GET /api/fines` → ONLY Group A fines
5. Log in as Group B admin:
   - All endpoints return ONLY Group B data
   - Cannot see Group A's members, loans, savings, or balance

### 14b. Member Isolation Within a Group

1. Create two members in Group A (Member X and Member Y) via invite flow
2. Log in as Member X:
   - `GET /api/fines` → Only Member X's fines
   - Cannot access other members' loan or savings details
   - Cannot access admin/treasurer routes (403)
3. Log in as Member Y:
   - Same — only sees own data

### 14c. Invite Token Security

1. Generate invite for Group A → get token
2. Accept invite with valid Clerk session → 201 success
3. Try to use same token again → 400 "Invite has already been used"
4. Generate new invite → wait 48+ hours (or mock) → 400 "Invite has expired"
5. Tamper with token payload → 400 "Invalid or expired invite token"

### 14d. Role Enforcement

1. Log in as member → try `POST /api/loans` → 403
2. Log in as member → try `POST /api/payments/repayment` → 403
3. Log in as member → try `POST /api/invites` → 403
4. Log in as member → try `PUT /api/group-settings` → 403
5. Log in as loan_officer → `POST /api/loans` → 200 (allowed)

### 14e. Onboarding Gate

1. Sign up via Clerk (new user, no GroupMember record)
2. Hit any protected route → get `{ code: 'NO_GROUP' }` response
3. Frontend detects this → redirects to `/onboarding`
4. Complete onboarding → Group + GroupMember created
5. Hit protected route again → 200 success

### 14f. Legacy Data (William's Group)

1. After migration, log in as William (needs to link Clerk account to his
   GroupMember record — either via a one-time "Link Account" flow or by
   manually setting `clerkUserId` on his GroupMember doc)
2. Bank balance = K20,633.67 (unchanged)
3. All existing loans, savings, transactions visible
4. Create a new loan → succeeds with groupId from resolveGroup middleware
5. All existing data continues to work

---

## 15. DEPLOYMENT CHANGES

### 15a. New Environment Variables

**Backend `.env`:**
```
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
INVITE_JWT_SECRET=<random 64-char hex string>
FRONTEND_URL=https://villagebanking.netlify.app
```

**Frontend `.env`:**
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 15b. Deployment Sequence

1. **Set up Clerk project** in Clerk Dashboard — configure allowed sign-in
   methods (email + Google OAuth), set redirect URLs
2. **Run migration** against production MongoDB (dry-run first):
   ```bash
   cd mern_vb_backend && node scripts/migrateAddGroupId.js --dry-run
   cd mern_vb_backend && node scripts/migrateAddGroupId.js
   ```
3. **Deploy backend** to Render with new env vars
4. **Deploy frontend** to Netlify with `VITE_CLERK_PUBLISHABLE_KEY`
5. **Link William's account** — after William signs up via Clerk, manually
   update his GroupMember doc: `db.groupmembers.updateOne({ name: "William" },
   { $set: { clerkUserId: "user_xxx" } })`

### 15c. CORS

Add Clerk's domain to CORS if needed. The Clerk JS SDK makes requests to
Clerk's servers directly (not through your backend), so usually no CORS
change is needed. Verify in `server.js` that `cors()` allows the Netlify domain.

### 15d. Rollback Plan

- Old JWT auth code can be kept in a branch
- The `groupId` field addition is additive — rolling back code ignores it
- GroupMember records exist alongside old User records — no data lost
- If Clerk has issues, revert to old JWT auth branch (all data intact)

---

## 16. LINKING LEGACY ACCOUNTS

William's group members have GroupMember records with `clerkUserId: null`.
When they sign up via Clerk, they need to link their Clerk identity to
their existing GroupMember record. Two approaches:

**Option A (Manual — simplest for MVP):** Admin runs a MongoDB command to
set `clerkUserId` on each member's GroupMember record after they sign up.

**Option B (Self-serve):** Build a "Link Existing Account" page that:
1. User signs in via Clerk
2. Backend sees no GroupMember for their clerkUserId
3. User enters their old username
4. Backend finds GroupMember by `{ name: username, clerkUserId: null }`
5. Sets `clerkUserId` on that GroupMember record
6. Optional: require admin approval before linking

Recommend **Option A** for launch (only 10-30 members) and build Option B
later if needed.

---

## 17. NEW PACKAGES TO INSTALL

**Backend:**
```bash
cd mern_vb_backend && pnpm add @clerk/express svix
```
- `@clerk/express` — Clerk middleware for Express
- `svix` — webhook signature verification (used by Clerk webhooks)

**Frontend:**
```bash
cd mern-vb-frontend && pnpm add @clerk/clerk-react
```

---

This revised plan is self-contained. A fresh Sonnet session can implement
it from this file alone.
