# Plan: Super Admin Menu (Platform Administration)

> **Executor:** Sonnet (fresh session, no prior context).
> **Style:** implement in the order listed, test after each phase, follow every UI rule in `UI_SPEC.md`.
> **Author context:** The user is William, a group treasurer running his own group on the app and also the platform super admin.
> **Do not invent features or skip steps.** Everything Sonnet needs is in this file.

---

## 0. Read These Files First (5 min)

Before writing any code, read:

1. `CLAUDE.md` — project-wide rules, verification loop
2. `UI_SPEC.md` — especially §2 colours, §6.18 Confirmation Modal, §8 Responsive, §10.1 Super Admin Dashboard, §12 Do Not Do List
3. `mern_vb_backend/middleware/resolveGroup.js` — super-admin branch already exists
4. `mern_vb_backend/controllers/authController.js` (`me()`) — how `isSuperAdmin` flows to the client
5. `mern_vb_backend/controllers/adminController.js` + `routes/admin.js` — the two read-only endpoints that already exist
6. `mern_vb_backend/controllers/inviteController.js` (`inviteByEmail`, lines 90–180) — Resend email HTML template to mirror
7. `mern-vb-frontend/src/store/auth.jsx` — `isSuperAdmin` flag is already plumbed
8. `mern-vb-frontend/src/components/layout/AppShell.jsx`, `DesktopSidebar.jsx`, `MobileBottomNav.jsx`, `TopBar.jsx` — the shell to mirror for the admin mode

---

## 1. Context — What Already Exists vs. What's Missing

### Already exists
- `SuperAdmin` model (`clerkUserId`, `email`). Seeded by `scripts/seedSuperAdmin.js`.
- `resolveGroup` middleware sets `req.isSuperAdmin = true` when the authenticated Clerk user is a super admin.
- `authController.me()` returns `{ isSuperAdmin: true, ... }` for super admins.
- Frontend `useAuth()` exposes `isSuperAdmin` (`store/auth.jsx` line 112).
- `App.jsx` already skips the onboarding redirect for super admins (`needsOnboarding && !isSuperAdmin`).
- `checkTrial` middleware bypasses super admins (`middleware/checkTrial.js:16`).
- `GET /api/admin/groups` and `GET /api/admin/groups/:groupId` (`controllers/adminController.js`) — read-only.
- `scripts/activateGroup.js` — manually activates a group to paid. The UI will replace it.
- Resend integration is working (`controllers/inviteController.js:145`, `controllers/billingController.js:52`).

### Missing (this plan builds all of it)
- No `/admin/*` frontend routes.
- No mode-switch UI between "My Group" view and "Super Admin" view.
- No way for a super admin to edit groups, settings, billing, or members.
- No soft-delete (`deletedAt`) on `Group` or `GroupMember`.
- No way to suspend a group.
- No super-admin invitation flow (promote by email).
- No audit log.
- No platform overview / analytics.

---

## 2. Architectural Decisions (Locked-In)

These are user-confirmed answers — do **not** renegotiate them:

1. **Mode switch, not merged nav.** A super admin sees their normal group UI by default. A toggle in the top-bar user avatar dropdown switches them into "Platform Admin" mode (different sidebar, different routes under `/admin/*`). Same visual language, different menu.
2. **Soft delete + typed confirmation** for destructive actions. Deleted groups/members get `deletedAt: Date` and are hidden from normal queries but still visible in the super-admin list with a "Deleted" badge and a "Restore" option.
3. **Billing extend policy:** `paidUntil = max(today, existing paidUntil) + durationMonths`. An expired group restarts from today; a still-paid group extends from their current end date. Three inputs in the UI: plan (select: Starter / Standard), duration (number of months), optional custom `paidUntil` date override.
4. **Super-admin promotion by email.** A super admin invites another Clerk user by email via Resend. The invitee clicks a link, signs in (or signs up) via Clerk, and the `/admin/accept-invite?token=xxx` page POSTs the token to promote them. Same one-time-use + 48h expiry pattern used by `InviteToken`.
5. **Per-group viewing, not impersonation.** Super admins read group data through dedicated `/admin/*` endpoints. They do **not** "log in as" a group member.
6. **UI_SPEC §10.1 is authoritative.** Use the same colour palette, component library, sidebar pattern, and breakpoints. The admin section must feel like the same product.

---

## 3. Backend — Models

All schema files live in `mern_vb_backend/models/`.

### 3.1 Extend `Group.js` — add soft-delete + suspend

**File:** `mern_vb_backend/models/Group.js`

Add two fields (after `paidUntil`):

```js
deletedAt: { type: Date, default: null },
suspendedAt: { type: Date, default: null },
suspendedReason: { type: String, default: null },
```

No index changes. Existing documents get `null` for both by default.

### 3.2 Extend `GroupMember.js` — add soft-delete

**File:** `mern_vb_backend/models/GroupMember.js`

Add one field (after `active`):

```js
deletedAt: { type: Date, default: null },
```

Keep `active` for "deactivated but still in group" (existing behaviour). `deletedAt` means "removed from group" — harder delete.

### 3.3 Extend `SuperAdmin.js` — track invite metadata

**File:** `mern_vb_backend/models/SuperAdmin.js`

Replace the schema with:

```js
const mongoose = require('mongoose');

const superAdminSchema = new mongoose.Schema({
  clerkUserId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  name: { type: String, default: null },
  invitedBy: { type: String, default: null }, // clerkUserId of the super admin who invited them
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('SuperAdmin', superAdminSchema);
```

`revokedAt` is a soft-delete for super-admin access. Seeded records stay with `revokedAt: null`. Existing `createdAt` field becomes `timestamps` `createdAt` — read `scripts/seedSuperAdmin.js` to confirm it still works (it uses `SuperAdmin.create({ clerkUserId, email })` which is compatible).

### 3.4 New model: `SuperAdminInvite.js`

**Create file:** `mern_vb_backend/models/SuperAdminInvite.js`

```js
const mongoose = require('mongoose');

const superAdminInviteSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  invitedBy: { type: String, required: true }, // clerkUserId
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  usedBy: { type: String, default: null }, // clerkUserId of accepter
}, { timestamps: true });

// Auto-delete expired unused invites after 7 days (same policy as InviteToken)
superAdminInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('SuperAdminInvite', superAdminInviteSchema);
```

### 3.5 New model: `AdminAuditLog.js`

**Create file:** `mern_vb_backend/models/AdminAuditLog.js`

```js
const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema({
  actorClerkUserId: { type: String, required: true },
  actorEmail: { type: String, required: true },
  action: { type: String, required: true }, // e.g. 'group.update', 'group.suspend', 'member.remove'
  targetType: { type: String, required: true, enum: ['group', 'group_member', 'group_settings', 'super_admin', 'billing'] },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, // before/after snapshots, reason, etc.
}, { timestamps: true });

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ groupId: 1, createdAt: -1 });
adminAuditLogSchema.index({ actorClerkUserId: 1, createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
```

---

## 4. Backend — Middleware

### 4.1 Create `requireSuperAdmin.js`

**Create file:** `mern_vb_backend/middleware/requireSuperAdmin.js`

```js
const SuperAdmin = require('../models/SuperAdmin');
const { getAuth } = require('@clerk/express');

/**
 * Gate that blocks non-super-admins with 403.
 * Must be mounted AFTER verifyToken.
 * Attaches req.superAdmin (the SuperAdmin document) for downstream controllers.
 */
async function requireSuperAdmin(req, res, next) {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

    const superAdmin = await SuperAdmin.findOne({ clerkUserId, revokedAt: null });
    if (!superAdmin) return res.status(403).json({ error: 'Super admin access required' });

    req.superAdmin = superAdmin;
    req.isSuperAdmin = true;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify super admin', details: err.message });
  }
}

module.exports = { requireSuperAdmin };
```

### 4.2 Update `resolveGroup.js`

**File:** `mern_vb_backend/middleware/resolveGroup.js`

Change the `SuperAdmin.findOne` call on line 21 to also check `revokedAt: null`:

```js
const superAdmin = await SuperAdmin.findOne({ clerkUserId, revokedAt: null });
```

No other changes.

### 4.3 Create audit helper

**Create file:** `mern_vb_backend/utils/auditLog.js`

```js
const AdminAuditLog = require('../models/AdminAuditLog');

/**
 * Writes an audit log entry. Never throws — failures are logged only.
 * Call from super-admin controllers on every state-changing action.
 */
async function logAdminAction({ req, action, targetType, targetId = null, groupId = null, metadata = {} }) {
  try {
    await AdminAuditLog.create({
      actorClerkUserId: req.superAdmin?.clerkUserId || req.auth?.userId,
      actorEmail: req.superAdmin?.email || 'unknown',
      action,
      targetType,
      targetId,
      groupId,
      metadata,
    });
  } catch (err) {
    console.error('[auditLog] failed to write entry:', err.message);
  }
}

module.exports = { logAdminAction };
```

---

## 5. Backend — Controllers

All controller files live in `mern_vb_backend/controllers/`. Keep the existing `adminController.js` but expand it; split into domain files where it grows large. The structure below is the target.

### 5.1 Replace `adminController.js` with five focused controllers

Move the two existing functions (`listGroups`, `getGroup`) into `adminGroupsController.js` and delete `adminController.js`. Then build the rest.

### 5.2 `controllers/adminGroupsController.js`

```js
const mongoose = require('mongoose');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupSettings = require('../models/GroupSettings');
const BankBalance = require('../models/BankBalance');
const { logAdminAction } = require('../utils/auditLog');

// GET /api/admin/groups?includeDeleted=true|false
exports.listGroups = async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const filter = includeDeleted ? {} : { deletedAt: null };

  const groups = await Group.find(filter).sort({ createdAt: -1 }).lean();
  const groupIds = groups.map(g => g._id);
  const counts = await GroupMember.aggregate([
    { $match: { groupId: { $in: groupIds }, active: true, deletedAt: null } },
    { $group: { _id: '$groupId', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map(m => [m._id.toString(), m.count]));

  const now = new Date();
  const result = groups.map(g => {
    let status = 'trial_active';
    if (g.deletedAt) status = 'deleted';
    else if (g.suspendedAt) status = 'suspended';
    else if (g.isPaid && (!g.paidUntil || g.paidUntil > now)) status = 'paid';
    else if (g.trialExpiresAt && g.trialExpiresAt < now) status = 'expired';
    return {
      _id: g._id,
      name: g.name,
      slug: g.slug,
      memberCount: countMap[g._id.toString()] || 0,
      trialExpiresAt: g.trialExpiresAt,
      isPaid: g.isPaid,
      paidUntil: g.paidUntil,
      suspendedAt: g.suspendedAt,
      deletedAt: g.deletedAt,
      status,
      createdAt: g.createdAt,
    };
  });
  res.json(result);
};

// GET /api/admin/groups/:groupId
exports.getGroup = async (req, res) => {
  const group = await Group.findById(req.params.groupId).lean();
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const [members, settings, bankBalance] = await Promise.all([
    GroupMember.find({ groupId: group._id }).select('name role phone email active deletedAt createdAt clerkUserId').lean(),
    GroupSettings.findOne({ groupId: group._id }).lean(),
    BankBalance.findOne({ groupId: group._id }).lean(),
  ]);

  res.json({ ...group, members, settings, bankBalance });
};

// PATCH /api/admin/groups/:groupId  — update name / slug / clerkAdminId
exports.updateGroup = async (req, res) => {
  const { name, slug, clerkAdminId } = req.body;
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const before = { name: group.name, slug: group.slug, clerkAdminId: group.clerkAdminId };

  if (name) group.name = name;
  if (slug) group.slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (clerkAdminId !== undefined) group.clerkAdminId = clerkAdminId;

  try {
    await group.save();
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug already taken' });
    throw err;
  }

  await logAdminAction({
    req, action: 'group.update', targetType: 'group', targetId: group._id, groupId: group._id,
    metadata: { before, after: { name: group.name, slug: group.slug, clerkAdminId: group.clerkAdminId } },
  });
  res.json(group);
};

// POST /api/admin/groups  — create a group manually (super admin shortcut)
exports.createGroup = async (req, res) => {
  const { name, slug: rawSlug, clerkAdminId, adminName, adminEmail, trialDays } = req.body;
  if (!name || !adminName) return res.status(400).json({ error: 'name and adminName are required' });

  const slug = (rawSlug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const trialExpiresAt = new Date(Date.now() + (trialDays || 15) * 24 * 60 * 60 * 1000);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existing = await Group.findOne({ slug }).session(session);
      if (existing) throw Object.assign(new Error('Slug already taken'), { status: 409 });

      const [group] = await Group.create([{ name, slug, clerkAdminId: clerkAdminId || null, trialExpiresAt }], { session });

      if (clerkAdminId) {
        await GroupMember.create([{
          clerkUserId: clerkAdminId, groupId: group._id, role: 'admin',
          name: adminName, email: adminEmail || null,
        }], { session });
      } else {
        await GroupMember.create([{
          clerkUserId: null, groupId: group._id, role: 'admin',
          name: adminName, email: adminEmail || null,
        }], { session });
      }

      // Default GroupSettings (match groupController.createGroup defaults)
      await GroupSettings.create([{
        groupId: group._id, groupName: name,
        cycleLengthMonths: 6, interestRate: 10, interestMethod: 'reducing',
        defaultLoanDuration: 4, loanLimitMultiplier: 3,
        latePenaltyRate: 15, overdueFineAmount: 1000, earlyPaymentCharge: 200,
        savingsInterestRate: 10, minimumSavingsMonth1: 3000, minimumSavingsMonthly: 1000,
        maximumSavingsFirst3Months: 5000, savingsShortfallFine: 500,
        profitSharingMethod: 'proportional', lateFineType: 'fixed',
      }], { session });

      await BankBalance.create([{ balance: 0, groupId: group._id }], { session });

      result = group;
    });

    await logAdminAction({
      req, action: 'group.create', targetType: 'group', targetId: result._id, groupId: result._id,
      metadata: { name, slug, clerkAdminId, trialDays },
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

// POST /api/admin/groups/:groupId/suspend  { reason }
exports.suspendGroup = async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  group.suspendedAt = new Date();
  group.suspendedReason = req.body.reason || null;
  await group.save();

  await logAdminAction({
    req, action: 'group.suspend', targetType: 'group', targetId: group._id, groupId: group._id,
    metadata: { reason: group.suspendedReason },
  });
  res.json(group);
};

// POST /api/admin/groups/:groupId/unsuspend
exports.unsuspendGroup = async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  group.suspendedAt = null;
  group.suspendedReason = null;
  await group.save();

  await logAdminAction({
    req, action: 'group.unsuspend', targetType: 'group', targetId: group._id, groupId: group._id,
  });
  res.json(group);
};

// DELETE /api/admin/groups/:groupId  — soft delete. Requires typed confirmation in body.
exports.softDeleteGroup = async (req, res) => {
  const { confirmation } = req.body;
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (confirmation !== group.name) {
    return res.status(400).json({ error: 'Confirmation text does not match group name' });
  }

  group.deletedAt = new Date();
  await group.save();

  await logAdminAction({
    req, action: 'group.soft_delete', targetType: 'group', targetId: group._id, groupId: group._id,
    metadata: { groupName: group.name, memberCount: await GroupMember.countDocuments({ groupId: group._id }) },
  });
  res.json({ message: 'Group soft-deleted', group });
};

// POST /api/admin/groups/:groupId/restore
exports.restoreGroup = async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  group.deletedAt = null;
  await group.save();

  await logAdminAction({
    req, action: 'group.restore', targetType: 'group', targetId: group._id, groupId: group._id,
  });
  res.json(group);
};
```

**NOTE on data isolation after soft-delete:** Regular group routes should NOT serve a soft-deleted group. Update `resolveGroup.js` to also check `deletedAt` on the group itself — fetch the group and return 403 `GROUP_DELETED` when `group.deletedAt != null`. See §4.2 addendum below.

**Addendum to §4.2:** After resolving a `GroupMember`, also fetch the Group and reject if deleted/suspended:

```js
// Inside resolveGroup, after finding the member (non-super-admin path), before assigning req.groupId:
const Group = require('../models/Group');
const group = await Group.findById(member.groupId);
if (!group || group.deletedAt) {
  return res.status(403).json({ error: 'Group has been deleted', code: 'GROUP_DELETED' });
}
if (group.suspendedAt) {
  return res.status(403).json({ error: 'Group is suspended', code: 'GROUP_SUSPENDED' });
}
```

Super admins already pass through the `req.isSuperAdmin` branch above — they still see deleted/suspended groups.

### 5.3 `controllers/adminGroupSettingsController.js`

```js
const GroupSettings = require('../models/GroupSettings');
const { logAdminAction } = require('../utils/auditLog');

// GET /api/admin/groups/:groupId/settings
exports.getSettings = async (req, res) => {
  const settings = await GroupSettings.findOne({ groupId: req.params.groupId });
  if (!settings) return res.status(404).json({ error: 'Settings not found for this group' });
  res.json(settings);
};

// PATCH /api/admin/groups/:groupId/settings
exports.updateSettings = async (req, res) => {
  const settings = await GroupSettings.findOne({ groupId: req.params.groupId });
  if (!settings) return res.status(404).json({ error: 'Settings not found' });

  const before = settings.toObject();
  const allowed = [
    'groupName', 'meetingDay', 'lateFineType',
    'cycleLengthMonths', 'interestRate', 'interestMethod', 'defaultLoanDuration', 'loanLimitMultiplier',
    'latePenaltyRate', 'overdueFineAmount', 'earlyPaymentCharge',
    'savingsInterestRate', 'minimumSavingsMonth1', 'minimumSavingsMonthly',
    'maximumSavingsFirst3Months', 'savingsShortfallFine',
    'profitSharingMethod',
  ];
  for (const key of allowed) {
    if (req.body[key] !== undefined) settings[key] = req.body[key];
  }
  await settings.save();

  await logAdminAction({
    req, action: 'group_settings.update', targetType: 'group_settings', targetId: settings._id,
    groupId: settings.groupId,
    metadata: { before, after: settings.toObject() },
  });
  res.json(settings);
};
```

### 5.4 `controllers/adminBillingController.js`

```js
const Group = require('../models/Group');
const { logAdminAction } = require('../utils/auditLog');

const PLANS = {
  Starter: { price: 150, currency: 'ZMW' },
  Standard: { price: 250, currency: 'ZMW' },
};

// GET /api/admin/billing/plans
exports.listPlans = (req, res) => res.json(PLANS);

// POST /api/admin/groups/:groupId/billing/activate
// Body: { plan: 'Starter'|'Standard', durationMonths: number, customPaidUntil?: ISO date }
exports.activate = async (req, res) => {
  const { plan, durationMonths, customPaidUntil } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!customPaidUntil && (!durationMonths || durationMonths < 1)) {
    return res.status(400).json({ error: 'durationMonths must be >= 1 unless customPaidUntil is provided' });
  }

  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const before = { isPaid: group.isPaid, paidUntil: group.paidUntil, trialExpiresAt: group.trialExpiresAt };

  let newPaidUntil;
  if (customPaidUntil) {
    newPaidUntil = new Date(customPaidUntil);
    if (Number.isNaN(newPaidUntil.getTime())) return res.status(400).json({ error: 'Invalid customPaidUntil' });
  } else {
    // extend from max(today, existing paidUntil)
    const now = new Date();
    const base = (group.paidUntil && group.paidUntil > now) ? new Date(group.paidUntil) : new Date(now);
    base.setMonth(base.getMonth() + durationMonths);
    newPaidUntil = base;
  }

  group.isPaid = true;
  group.paidUntil = newPaidUntil;
  // Lock trial expiry far in the future — same behaviour as activateGroup.js script
  group.trialExpiresAt = new Date('2099-12-31');
  await group.save();

  await logAdminAction({
    req, action: 'billing.activate', targetType: 'billing', targetId: group._id, groupId: group._id,
    metadata: { plan, durationMonths, customPaidUntil, before, after: { isPaid: group.isPaid, paidUntil: group.paidUntil } },
  });
  res.json({ group, plan, paidUntil: newPaidUntil });
};

// POST /api/admin/groups/:groupId/billing/mark-unpaid — flips isPaid to false
exports.markUnpaid = async (req, res) => {
  const group = await Group.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const before = { isPaid: group.isPaid, paidUntil: group.paidUntil };
  group.isPaid = false;
  group.paidUntil = null;
  await group.save();

  await logAdminAction({
    req, action: 'billing.mark_unpaid', targetType: 'billing', targetId: group._id, groupId: group._id,
    metadata: { before },
  });
  res.json(group);
};
```

### 5.5 `controllers/adminMembersController.js`

```js
const GroupMember = require('../models/GroupMember');
const { logAdminAction } = require('../utils/auditLog');

// GET /api/admin/groups/:groupId/members?includeDeleted=true|false
exports.listMembers = async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const filter = { groupId: req.params.groupId };
  if (!includeDeleted) filter.deletedAt = null;
  const members = await GroupMember.find(filter).sort({ createdAt: -1 });
  res.json(members);
};

// PATCH /api/admin/groups/:groupId/members/:memberId  { name, role, phone, email, active }
exports.updateMember = async (req, res) => {
  const member = await GroupMember.findOne({ _id: req.params.memberId, groupId: req.params.groupId });
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const before = { name: member.name, role: member.role, phone: member.phone, email: member.email, active: member.active };

  const allowed = ['name', 'role', 'phone', 'email', 'active'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) member[key] = req.body[key];
  }
  await member.save();

  await logAdminAction({
    req, action: 'member.update', targetType: 'group_member', targetId: member._id, groupId: member.groupId,
    metadata: { before, after: { name: member.name, role: member.role, phone: member.phone, email: member.email, active: member.active } },
  });
  res.json(member);
};

// DELETE /api/admin/groups/:groupId/members/:memberId  — soft delete (typed confirmation)
exports.softDeleteMember = async (req, res) => {
  const { confirmation } = req.body;
  const member = await GroupMember.findOne({ _id: req.params.memberId, groupId: req.params.groupId });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (confirmation !== member.name) {
    return res.status(400).json({ error: 'Confirmation text does not match member name' });
  }
  member.deletedAt = new Date();
  member.active = false;
  await member.save();

  await logAdminAction({
    req, action: 'member.soft_delete', targetType: 'group_member', targetId: member._id, groupId: member.groupId,
    metadata: { memberName: member.name },
  });
  res.json({ message: 'Member removed', member });
};

// POST /api/admin/groups/:groupId/members/:memberId/restore
exports.restoreMember = async (req, res) => {
  const member = await GroupMember.findOne({ _id: req.params.memberId, groupId: req.params.groupId });
  if (!member) return res.status(404).json({ error: 'Member not found' });
  member.deletedAt = null;
  member.active = true;
  await member.save();

  await logAdminAction({
    req, action: 'member.restore', targetType: 'group_member', targetId: member._id, groupId: member.groupId,
  });
  res.json(member);
};
```

Controllers that return group data to members must also exclude `deletedAt != null`. Audit `userController.js`, `paymentController.js` `getAllFines`, etc., and add `, deletedAt: null` to the GroupMember filters. Grep for `GroupMember.find(` across the backend and update each call where full member listings are returned.

### 5.6 `controllers/superAdminController.js`

```js
const crypto = require('crypto');
const { Resend } = require('resend');
const SuperAdmin = require('../models/SuperAdmin');
const SuperAdminInvite = require('../models/SuperAdminInvite');
const { logAdminAction } = require('../utils/auditLog');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://chama360.nxhub.online';

// GET /api/admin/super-admins
exports.list = async (req, res) => {
  const admins = await SuperAdmin.find({ revokedAt: null }).sort({ createdAt: -1 });
  const pending = await SuperAdminInvite.find({ usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  res.json({ admins, pendingInvites: pending });
};

// POST /api/admin/super-admins/invite  { email }
exports.invite = async (req, res) => {
  const { email: rawEmail } = req.body;
  if (!rawEmail) return res.status(400).json({ error: 'email is required' });
  const email = rawEmail.toLowerCase().trim();

  // Already a super admin?
  const existing = await SuperAdmin.findOne({ email, revokedAt: null });
  if (existing) return res.status(409).json({ error: 'This email is already a super admin' });

  // Already invited?
  const pending = await SuperAdminInvite.findOne({ email, usedAt: null, expiresAt: { $gt: new Date() } });
  if (pending) return res.status(409).json({ error: 'An invite is already pending for this email' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await SuperAdminInvite.create({ token, email, invitedBy: req.superAdmin.clerkUserId, expiresAt });

  const inviteLink = `${FRONTEND_URL}/admin/accept-invite?token=${token}`;

  // Send email via Resend — mirror the HTML template style from inviteController.inviteByEmail
  if (!process.env.RESEND_API_KEY) {
    return res.status(201).json({ inviteLink, token, expiresAt, warning: 'Resend not configured — share link manually' });
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Chama360 <onboarding@resend.dev>',
    to: email,
    subject: 'You have been invited as a Chama360 Platform Super Admin',
    html: `
      <div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #F0EDE8;">
        <div style="background: #FFFFFF; border-radius: 16px; padding: 32px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 48px; height: 48px; background: #C8501A; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
              <span style="color: white; font-weight: 700; font-size: 18px;">C</span>
            </div>
            <h1 style="color: #C8501A; font-size: 20px; font-weight: 700; margin: 12px 0 4px;">Chama360</h1>
          </div>
          <h2 style="color: #1C1510; font-size: 22px; font-weight: 700; margin: 0 0 8px;">Platform Admin Access</h2>
          <p style="color: #6B6560; font-size: 15px; margin: 0 0 24px;">
            You have been invited to become a <strong style="color: #1C1510;">Super Admin</strong> for the Chama360 platform.
            Super admins manage all groups, billing, and members across the platform.
          </p>
          <a href="${inviteLink}" style="display: block; background: #C8501A; color: white; text-align: center; padding: 14px 24px; border-radius: 9999px; font-weight: 600; font-size: 15px; text-decoration: none; margin-bottom: 24px;">
            Accept Super Admin Invite
          </a>
          <p style="color: #A09990; font-size: 12px; margin: 0;">
            Sign in with this email address (${email}). This invite expires in 48 hours.
          </p>
        </div>
      </div>
    `,
  });

  await logAdminAction({
    req, action: 'super_admin.invite', targetType: 'super_admin', metadata: { email },
  });
  res.status(201).json({ inviteLink, expiresAt });
};

// POST /api/admin/super-admins/accept-invite  { token }  (auth required; NOT requireSuperAdmin)
exports.acceptInvite = async (req, res) => {
  const { getAuth } = require('@clerk/express');
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });

  const invite = await SuperAdminInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.usedAt) return res.status(400).json({ error: 'Invite already used' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite expired' });

  const { userId: clerkUserId } = getAuth(req);
  if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

  // Cross-check the authed user's email matches the invite email
  // We rely on Clerk's primary email — look it up via @clerk/express helpers or the session claims
  // For MVP, trust the invite email field as the identity and require the user to accept while signed in.
  // A future hardening pass can verify primary email match via Clerk SDK.

  const existing = await SuperAdmin.findOne({ clerkUserId });
  if (existing && !existing.revokedAt) return res.status(409).json({ error: 'You are already a super admin' });

  if (existing?.revokedAt) {
    existing.revokedAt = null;
    existing.invitedBy = invite.invitedBy;
    await existing.save();
  } else {
    await SuperAdmin.create({
      clerkUserId, email: invite.email, invitedBy: invite.invitedBy,
    });
  }

  invite.usedAt = new Date();
  invite.usedBy = clerkUserId;
  await invite.save();

  res.status(201).json({ message: 'Super admin access granted' });
};

// DELETE /api/admin/super-admins/:id  — revoke (soft delete). Cannot revoke self.
exports.revoke = async (req, res) => {
  const target = await SuperAdmin.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Super admin not found' });
  if (target.clerkUserId === req.superAdmin.clerkUserId) {
    return res.status(400).json({ error: 'You cannot revoke your own super admin access' });
  }
  target.revokedAt = new Date();
  await target.save();

  await logAdminAction({
    req, action: 'super_admin.revoke', targetType: 'super_admin', targetId: target._id,
    metadata: { email: target.email },
  });
  res.json({ message: 'Super admin revoked', target });
};
```

### 5.7 `controllers/platformAdminController.js`

```js
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const AdminAuditLog = require('../models/AdminAuditLog');

// GET /api/admin/overview
exports.overview = async (req, res) => {
  const now = new Date();
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [totalGroups, paidGroups, trialGroups, expiringThisWeek, totalMembers] = await Promise.all([
    Group.countDocuments({ deletedAt: null }),
    Group.countDocuments({ deletedAt: null, isPaid: true, $or: [{ paidUntil: null }, { paidUntil: { $gt: now } }] }),
    Group.countDocuments({ deletedAt: null, $or: [{ isPaid: false }, { paidUntil: { $lte: now } }], trialExpiresAt: { $gt: now } }),
    Group.countDocuments({ deletedAt: null, trialExpiresAt: { $gt: now, $lte: weekFromNow }, isPaid: { $ne: true } }),
    GroupMember.countDocuments({ deletedAt: null, active: true }),
  ]);

  // MRR estimate — count paid groups × Standard plan price (conservative: use Starter)
  // Since we do not store plan choice yet, use a simple estimate
  const starterPrice = 150;
  const mrrEstimate = paidGroups * starterPrice;

  res.json({
    totalGroups, paidGroups, trialGroups, expiringThisWeek, totalMembers, mrrEstimate, currency: 'ZMW',
  });
};

// GET /api/admin/audit-log?groupId=&actor=&limit=50&page=1
exports.auditLog = async (req, res) => {
  const { groupId, actor, limit = 50, page = 1 } = req.query;
  const filter = {};
  if (groupId) filter.groupId = groupId;
  if (actor) filter.actorClerkUserId = actor;

  const logs = await AdminAuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit));
  const total = await AdminAuditLog.countDocuments(filter);
  res.json({ logs, total, page: Number(page), limit: Number(limit) });
};
```

---

## 6. Backend — Routes

### 6.1 Replace `routes/admin.js`

**File:** `mern_vb_backend/routes/admin.js`

```js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');

const platform = require('../controllers/platformAdminController');
const groups = require('../controllers/adminGroupsController');
const settings = require('../controllers/adminGroupSettingsController');
const billing = require('../controllers/adminBillingController');
const members = require('../controllers/adminMembersController');
const superAdmins = require('../controllers/superAdminController');

// Public-ish: accept-invite only requires Clerk auth, not super-admin status
router.post('/super-admins/accept-invite', verifyToken, superAdmins.acceptInvite);

// All routes below require super admin
router.use(verifyToken, requireSuperAdmin);

// Overview + audit
router.get('/overview', platform.overview);
router.get('/audit-log', platform.auditLog);

// Groups
router.get('/groups', groups.listGroups);
router.post('/groups', groups.createGroup);
router.get('/groups/:groupId', groups.getGroup);
router.patch('/groups/:groupId', groups.updateGroup);
router.delete('/groups/:groupId', groups.softDeleteGroup);
router.post('/groups/:groupId/restore', groups.restoreGroup);
router.post('/groups/:groupId/suspend', groups.suspendGroup);
router.post('/groups/:groupId/unsuspend', groups.unsuspendGroup);

// Group settings
router.get('/groups/:groupId/settings', settings.getSettings);
router.patch('/groups/:groupId/settings', settings.updateSettings);

// Billing
router.get('/billing/plans', billing.listPlans);
router.post('/groups/:groupId/billing/activate', billing.activate);
router.post('/groups/:groupId/billing/mark-unpaid', billing.markUnpaid);

// Members per group
router.get('/groups/:groupId/members', members.listMembers);
router.patch('/groups/:groupId/members/:memberId', members.updateMember);
router.delete('/groups/:groupId/members/:memberId', members.softDeleteMember);
router.post('/groups/:groupId/members/:memberId/restore', members.restoreMember);

// Super admins
router.get('/super-admins', superAdmins.list);
router.post('/super-admins/invite', superAdmins.invite);
router.delete('/super-admins/:id', superAdmins.revoke);

module.exports = router;
```

No change required in `server.js` — `app.use('/api/admin', ...)` is already mounted.

---

## 7. Frontend — Architecture

### 7.1 Mode switch — data model

Add to `store/auth.jsx`:

```js
// Add to useState block:
const [adminMode, setAdminMode] = useState(() => sessionStorage.getItem('adminMode') === 'true');

// Add a setter that persists the choice:
const toggleAdminMode = () => {
  const next = !adminMode;
  setAdminMode(next);
  sessionStorage.setItem('adminMode', String(next));
};

// Clear on sign out (in the !isSignedIn branch):
setAdminMode(false);
sessionStorage.removeItem('adminMode');

// Expose in value:
adminMode, toggleAdminMode,
```

**Rules:**
- `adminMode` is ignored when `!isSuperAdmin` (guarded by UI).
- Switching mode does not refetch anything — it just changes which sidebar + routes are shown.
- `sessionStorage` (not `localStorage`) so a new browser session starts in group mode by default.

### 7.2 New route namespace `/admin/*`

**File:** `mern-vb-frontend/src/App.jsx`

Add import:

```jsx
import AdminShell from './components/layout/AdminShell';
import AdminOverview from './pages/admin/AdminOverview';
import AdminGroupsList from './pages/admin/AdminGroupsList';
import AdminGroupDetail from './pages/admin/AdminGroupDetail';
import AdminSuperAdmins from './pages/admin/AdminSuperAdmins';
import AdminAuditLog from './pages/admin/AdminAuditLog';
import AdminAcceptInvite from './pages/admin/AdminAcceptInvite';
```

Add a `SuperAdminRoute` guard (similar to `RoleRoute`):

```jsx
function SuperAdminRoute({ children }) {
  const { isLoaded, authLoading, isSuperAdmin } = useAuth();
  if (!isLoaded || authLoading) return <LoadingSpinner />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

const AdminLayout = ({ children }) => <AdminShell>{children}</AdminShell>;
```

Add routes (place before the `<Route path="*" />` fallback):

```jsx
<Route path="/admin/accept-invite" element={
  <ProtectedRoute><AdminAcceptInvite /></ProtectedRoute>
} />
<Route path="/admin" element={
  <ProtectedRoute><SuperAdminRoute><AdminLayout><AdminOverview /></AdminLayout></SuperAdminRoute></ProtectedRoute>
} />
<Route path="/admin/groups" element={
  <ProtectedRoute><SuperAdminRoute><AdminLayout><AdminGroupsList /></AdminLayout></SuperAdminRoute></ProtectedRoute>
} />
<Route path="/admin/groups/:groupId" element={
  <ProtectedRoute><SuperAdminRoute><AdminLayout><AdminGroupDetail /></AdminLayout></SuperAdminRoute></ProtectedRoute>
} />
<Route path="/admin/super-admins" element={
  <ProtectedRoute><SuperAdminRoute><AdminLayout><AdminSuperAdmins /></AdminLayout></SuperAdminRoute></ProtectedRoute>
} />
<Route path="/admin/audit" element={
  <ProtectedRoute><SuperAdminRoute><AdminLayout><AdminAuditLog /></AdminLayout></SuperAdminRoute></ProtectedRoute>
} />
```

`/admin/accept-invite` is intentionally **not** wrapped in `SuperAdminRoute` — the point is that a non-super-admin accepts and becomes one.

### 7.3 Mode-switch entry point — TopBar avatar dropdown

**File:** `mern-vb-frontend/src/components/layout/TopBar.jsx`

In the avatar dropdown menu, above "Account Settings" and "Sign Out", add:

```jsx
{isSuperAdmin && (
  <button
    onClick={() => { toggleAdminMode(); navigate(adminMode ? '/dashboard' : '/admin'); }}
    className="w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-surface-page flex items-center gap-2"
  >
    <Shield size={16} className="text-brand-primary" />
    {adminMode ? 'Switch to My Group' : 'Switch to Platform Admin'}
  </button>
)}
```

Source the needed values from `useAuth()`. Add Lucide `Shield` import. If the TopBar doesn't currently render a dropdown, add one now — minimal: avatar circle → menu with `Account Settings`, the mode-switch line, `Sign Out`. Follow UI_SPEC §7.3.

### 7.4 Build `AdminShell.jsx`

**Create file:** `mern-vb-frontend/src/components/layout/AdminShell.jsx`

Mirror `AppShell.jsx` structure but:

- Import `AdminSidebar` (below) instead of `DesktopSidebar`.
- Use `AdminMobileBottomNav` (below).
- Omit the action sheet and modals (no "Begin New Cycle" / "Add Loan" inside admin mode).
- Main content: `<main className="md:ml-60 pt-16 pb-28 md:pb-8 px-4 md:px-8">` (identical spacing to `AppShell`).
- **No TrialBanner** in admin mode.

### 7.5 Build `AdminSidebar.jsx`

**Create file:** `mern-vb-frontend/src/components/layout/AdminSidebar.jsx`

Based on `DesktopSidebar.jsx`. Nav items (match UI_SPEC §10.1 with additions):

```jsx
const NAV_ITEMS = [
  { label: 'Overview', to: '/admin', icon: LayoutGrid, exact: true },
  { label: 'All Groups', to: '/admin/groups', icon: Users },
  { label: 'Super Admins', to: '/admin/super-admins', icon: Shield },
  { label: 'Audit Log', to: '/admin/audit', icon: FileText },
];
```

Bottom of sidebar: render a "Exit Admin Mode" button that calls `toggleAdminMode()` and navigates to `/dashboard`. Pill-shaped, `border border-border-default`, ghost style. Replaces the trial card in `DesktopSidebar`.

Logo: same orange "C" circle + "Chama360" wordmark. Add a small `text-xs uppercase tracking-widest text-text-secondary` sub-label "PLATFORM ADMIN" below the wordmark so the user can tell at a glance which mode they're in.

### 7.6 Build `AdminMobileBottomNav.jsx`

**Create file:** `mern-vb-frontend/src/components/layout/AdminMobileBottomNav.jsx`

Based on `MobileBottomNav.jsx`. Four items (no `+` button — admin mode has no quick-create action sheet):

```jsx
const NAV_ITEMS = [
  { label: 'Overview', to: '/admin', icon: LayoutGrid },
  { label: 'Groups', to: '/admin/groups', icon: Users },
  { label: 'Super Admins', to: '/admin/super-admins', icon: Shield },
  { label: 'Audit', to: '/admin/audit', icon: FileText },
];
```

Four even slots, active item gets `bg-brand-primary text-white` circle (follow UI_SPEC §6.2). Same `fixed bottom-3 left-3 right-3 bg-surface-dark rounded-xl` container. `md:hidden`.

### 7.7 Pages

All pages go in `mern-vb-frontend/src/pages/admin/`. Each page follows these patterns:

- **Page wrapper:** `<div className="max-w-[1200px] mx-auto">` inside `AdminShell`'s `<main>`.
- **Page header:** `h1` `text-display` (28px, bold), optional subtitle `text-body text-text-secondary`, right-aligned primary action button (e.g. "Invite Super Admin" on `/admin/super-admins`).
- **Section cards:** `bg-surface-card rounded-lg p-5 md:p-6`, stacked with `space-y-4 md:space-y-6`.
- **Tables (desktop, ≥768px):** full-width, `text-sm`, header row `text-xs uppercase tracking-wide text-text-secondary border-b border-border-default pb-2`, data row `py-3 border-b border-border-default last:border-0`.
- **Tables (mobile, <768px):** render as stacked cards. Each row becomes `<div className="bg-surface-card rounded-md p-4 mb-3">` with label/value pairs.

Do **not** try to reuse a single table component that toggles via CSS — render the mobile card variant with `md:hidden` and the desktop table variant with `hidden md:block`. This is explicitly the pattern UI_SPEC §12 requires (`Use table layout for mobile transaction lists → Use card rows on mobile, table on desktop`).

#### 7.7.1 `AdminOverview.jsx`

- Fetch `GET /api/admin/overview`.
- Render 4 stat cards in a grid: `grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4`.
- Cards: Total Groups, Active Trials, Paid Groups (+ MRR estimate), Expiring This Week.
- Use UI_SPEC §6.3 pattern: label uppercase `text-xs text-text-secondary`, value `text-display font-bold text-text-primary`.
- Hero card slot (optional): "Welcome, Super Admin" dark card (`bg-surface-dark text-white rounded-xl p-5`) showing the super admin's email and a shortcut "Manage Groups" ghost button.
- Below: "Recent activity" section — last 5 audit log entries. Card container with simple list (action, target, timestamp).

#### 7.7.2 `AdminGroupsList.jsx`

- Fetch `GET /api/admin/groups?includeDeleted=<toggle>`.
- Controls bar: search input (client-side filter by group name/slug), status filter pills (All / Trial / Paid / Expired / Suspended / Deleted), "Show deleted" toggle, "Create Group" primary button top-right.
- Desktop table columns: Group Name | Admin | Created | Trial/Paid Until | Status | Members | Actions.
- Mobile card: name (heading) + slug (caption), status badge, 3 meta rows (Members, Admin, Expires), a single "View" button full-width at the bottom.
- Status badges (UI_SPEC §6.14): `trial_active` → trial palette, `paid` → paid palette, `expired` → overdue palette, `suspended` → pending palette, `deleted` → inactive palette.
- Actions column (desktop): "View" (links to `/admin/groups/:id`) · "Mark Paid" (opens `BillingActivationDrawer`) · kebab menu for Suspend / Unsuspend / Restore / Delete.
- Uses `TypedConfirmationModal` for delete.

#### 7.7.3 `AdminGroupDetail.jsx`

URL: `/admin/groups/:groupId`. Fetches `GET /api/admin/groups/:groupId`.

Layout:
- Back link top-left ("← All Groups").
- Page header: group name (`text-display`), status badge next to it, "Admin email" in caption.
- Horizontal tabs (UI_SPEC style, similar to the `ManagePaymentModal` pill tabs). Tabs:
  1. **Overview** — slug, admin, created, bank balance (read-only).
  2. **Members** — table/cards from §7.7.5 below.
  3. **Settings** — editable form of `GroupSettings` (§7.7.6).
  4. **Billing** — current plan status + Activate/Extend form + Mark Unpaid.
  5. **Danger Zone** — Suspend (with reason), Unsuspend, Soft-delete (typed confirm), Restore.
  6. **Activity** — this group's audit-log entries.

Mobile: tabs become a horizontally-scrollable strip with `overflow-x-auto snap-x`. Content area below.

#### 7.7.4 `BillingActivationDrawer.jsx` (shared)

`mern-vb-frontend/src/components/admin/BillingActivationDrawer.jsx`. Reuse the `SlideoverDrawer` UI per UI_SPEC §6.15.

Fields:
- Plan: Select (Starter / Standard). Populated from `GET /api/admin/billing/plans`.
- Duration (months): Number input, default 1, min 1, max 36.
- Custom end date (optional): Date input. If set, duration is ignored. Helper text: "Overrides duration — sets paidUntil to this exact date."
- Summary row: "New paidUntil: YYYY-MM-DD" computed client-side using `max(today, existing paidUntil) + durationMonths`, re-renders live as user types.
- Submit → `POST /api/admin/groups/:id/billing/activate`. Toast on success. Drawer closes. Parent list/detail refetches.

#### 7.7.5 `AdminMembersTab.jsx`

Renders inside `AdminGroupDetail` "Members" tab. Uses `GET /api/admin/groups/:id/members`.

- Toggle: "Show removed members" (`includeDeleted=true`).
- Desktop table: Name | Email | Phone | Role | Active | Clerk linked? | Actions.
- Mobile cards: avatar + name + role badge + inactive/removed badge + "Edit" / "Remove" buttons.
- Edit opens `EditMemberDrawer` (SlideoverDrawer) — fields: name, email, phone, role select, active toggle.
- Remove opens `TypedConfirmationModal` — must type member name to confirm. On confirm: `DELETE /api/admin/groups/:id/members/:memberId`.
- Restore button appears for removed members → `POST .../restore`.

#### 7.7.6 `AdminSettingsTab.jsx`

Renders inside `AdminGroupDetail` "Settings" tab. Reuse the existing `Settings.jsx` read-only field structure, but wired to `GET/PATCH /api/admin/groups/:id/settings`.

- Stack of section cards (follow UI_SPEC §10.3 pattern):
  1. Group Info — groupName, meetingDay
  2. Lending Rules — interestRate, interestMethod (select), defaultLoanDuration, loanLimitMultiplier, cycleLengthMonths
  3. Fine Rules — latePenaltyRate, overdueFineAmount, earlyPaymentCharge, lateFineType
  4. Savings Rules — savingsInterestRate, minimumSavingsMonth1, minimumSavingsMonthly, maximumSavingsFirst3Months, savingsShortfallFine
  5. Profit Sharing — profitSharingMethod (select)
- Each card has an "Edit" pencil button top-right. Edit mode swaps labels→inputs; Save and Cancel buttons appear at card bottom.
- Validation: match `GroupSettings` schema `min`/`max`/`enum` constraints client-side; also surface the backend 400 error under the submit button.

#### 7.7.7 `AdminSuperAdmins.jsx`

- Header with "Invite Super Admin" primary button.
- Two sections:
  1. Active super admins — list (or desktop table): email, name, invited by, created at, actions (Revoke — disabled for self).
  2. Pending invites — list: email, expires at, invited by, "Copy link" button.
- Invite drawer: email input + helper text "An email will be sent via Resend."
- Revoke: `TypedConfirmationModal` — type the email to confirm.

#### 7.7.8 `AdminAuditLog.jsx`

- Filter bar: group select (from `GET /api/admin/groups`), actor select (active super admins), clear filters.
- Infinite-scroll or paginated list. Desktop table: Time | Actor | Action | Target | Group | Metadata (truncated + expandable).
- Mobile: card with all of the same fields stacked.
- "Metadata" expansion: click to reveal pretty-printed JSON (before/after snapshot).

#### 7.7.9 `AdminAcceptInvite.jsx`

- URL: `/admin/accept-invite?token=...`
- Reads `token` from query string.
- Minimal centred card (UI_SPEC §9.2 pattern).
- On mount: if `!isSignedIn`, show "Sign in to accept" button linking to `/sign-in?redirect_url=/admin/accept-invite?token=xxx`.
- If signed in: "You have been invited to become a Super Admin. Accept?" → POST `/api/admin/super-admins/accept-invite` → on success, call `refreshMembership()` then navigate to `/admin`.
- Error states: expired, already used, already super admin, generic — show destructive pill box with UI_SPEC error colours.

### 7.8 `TypedConfirmationModal.jsx`

**Create file:** `mern-vb-frontend/src/components/ui/TypedConfirmationModal.jsx`

```jsx
// Props: open, onClose, onConfirm, title, description, confirmWord, confirmLabel='Confirm', danger=true
// Behaviour:
//  - Input required before Confirm button enables (strict equality with confirmWord, case-sensitive)
//  - Confirm button: destructive palette when danger=true (bg-status-overdue-bg text-status-overdue-text),
//    brand-primary when false
//  - Cancel: ghost pill button
//  - Closes on backdrop click OR Cancel (never closes from Confirm — parent controls that after the request resolves)
//  - Layout: UI_SPEC §6.18 (overlay rgba(0,0,0,0.4), card white, rounded-xl, max-w-[400px], centred, padding 24px)
```

### 7.9 Hide normal nav items in admin mode

In `AppShell.jsx` → the user is in admin mode only if they navigate to `/admin/*`; we don't need to change `AppShell` itself. But do add a small sanity guard so super admins with `adminMode=true` landing on `/dashboard` don't see their group data stripped: just let them use both shells as they want. The mode switch is purely navigational.

---

## 8. Mobile Responsiveness — Non-Negotiable Rules

Every admin page must obey these rules. Test every screen at 375px width (iPhone SE) and 768px+ before declaring done.

1. **Tap targets ≥ 44×44px** (UI_SPEC §8.3). Buttons: min-height `h-11` on mobile.
2. **No horizontal scroll on the page itself.** Only tables that the user explicitly swipes (wrap in `overflow-x-auto` with a visual hint).
3. **Font-size ≥ 16px on inputs** (iOS zoom prevention). Use `text-base` not `text-sm` on `<input>`/`<select>`/`<textarea>`.
4. **Stat card grid:** `grid-cols-2 md:grid-cols-4` — always. Never 3-col on mobile.
5. **Action buttons stack:** primary actions stack vertically full-width under 768px (`flex flex-col md:flex-row gap-2 md:gap-3`).
6. **Tables:** desktop table hidden on mobile (`hidden md:table`), mobile cards hidden on desktop (`md:hidden`).
7. **Drawers:** follow UI_SPEC §6.15 — slide up on mobile, slide from right on desktop. Reuse `SlideoverDrawer` component.
8. **Tabs:** on mobile, make the tab strip horizontally scrollable (`overflow-x-auto flex gap-2 snap-x`). Tabs are pill-shaped per UI_SPEC §6.12.
9. **Bottom nav overlap:** content must end with `pb-28 md:pb-8` (same as AppShell).
10. **iOS safe area:** bottom nav must include `env(safe-area-inset-bottom)` padding — already handled by copying `MobileBottomNav.jsx` pattern.

---

## 9. Environment Variables

No new env vars required. Existing vars used:

- `RESEND_API_KEY` — super-admin invite emails (gracefully skipped if missing, returns invite link in response payload).
- `FRONTEND_URL` — used to build `${FRONTEND_URL}/admin/accept-invite?token=xxx`.
- `CLERK_SECRET_KEY` — already configured.

If `RESEND_API_KEY` is missing, the invite endpoint still returns the link in the response body so the super admin can share it manually. Mirror the graceful-skip pattern in `billingController.requestUpgrade`.

---

## 10. Implementation Order (Phases)

Implement phases **in order**, run tests after each.

### Phase 1 — Models + middleware
1. Update `models/Group.js` (add `deletedAt`, `suspendedAt`, `suspendedReason`).
2. Update `models/GroupMember.js` (add `deletedAt`).
3. Update `models/SuperAdmin.js` (add `name`, `invitedBy`, `revokedAt`, `timestamps: true`).
4. Create `models/SuperAdminInvite.js`.
5. Create `models/AdminAuditLog.js`.
6. Create `middleware/requireSuperAdmin.js`.
7. Update `middleware/resolveGroup.js` (check `revokedAt`, add group deleted/suspended check).
8. Create `utils/auditLog.js`.

**Test after phase 1:** `pnpm test` in backend — existing tests should still pass. Start the server locally — confirm it boots with no errors.

### Phase 2 — Controllers + routes
1. Delete `controllers/adminController.js`.
2. Create `controllers/adminGroupsController.js`.
3. Create `controllers/adminGroupSettingsController.js`.
4. Create `controllers/adminBillingController.js`.
5. Create `controllers/adminMembersController.js`.
6. Create `controllers/superAdminController.js`.
7. Create `controllers/platformAdminController.js`.
8. Rewrite `routes/admin.js`.
9. Audit existing controllers that return `GroupMember.find(...)` and add `deletedAt: null` to filters — specifically `userController.js`, `paymentController.js` `getAllFines`, `loanController.js` populate calls should not surface deleted members.

**Test after phase 2:** backend `pnpm test`. Use `curl` or Postman to hit each endpoint while signed in as super admin in the app:
  - `GET /api/admin/overview` → returns stats.
  - `GET /api/admin/groups` → returns William's group.
  - `GET /api/admin/groups/:id` → returns detail with members, settings, bankBalance.
  - `PATCH /api/admin/groups/:id` → rename a test group.
  - `POST /api/admin/groups/:id/billing/activate` with `{ plan: 'Starter', durationMonths: 1 }` → extends paidUntil.
  - `DELETE /api/admin/groups/:id` with wrong confirmation → 400. With matching name → 200.
  - `POST /api/admin/groups/:id/restore` → 200, group undeleted.
  - `POST /api/admin/super-admins/invite` → 201, inviteLink returned.
  - `GET /api/admin/audit-log` → lists all the actions above.

### Phase 3 — Frontend shell + mode switch
1. Update `store/auth.jsx` (adminMode state + `toggleAdminMode`).
2. Add mode-switch to `TopBar.jsx` avatar dropdown.
3. Create `components/layout/AdminShell.jsx`.
4. Create `components/layout/AdminSidebar.jsx`.
5. Create `components/layout/AdminMobileBottomNav.jsx`.
6. Create `components/ui/TypedConfirmationModal.jsx`.
7. Update `App.jsx` — add `SuperAdminRoute` and admin routes.

**Test after phase 3:** Sign in as super admin → dropdown shows "Switch to Platform Admin" → click it → land on `/admin` with the admin sidebar and bottom nav. Click "Exit Admin Mode" → back to `/dashboard`. Sign in as non-super-admin → dropdown does NOT show the switch. Visit `/admin` directly → redirected to `/dashboard`.

### Phase 4 — Frontend pages (build in order, test each)
1. `pages/admin/AdminOverview.jsx`.
2. `pages/admin/AdminGroupsList.jsx` + `components/admin/BillingActivationDrawer.jsx`.
3. `pages/admin/AdminGroupDetail.jsx` with Overview tab only.
4. Add Members tab + `components/admin/EditMemberDrawer.jsx`.
5. Add Settings tab.
6. Add Billing tab (reuse `BillingActivationDrawer`).
7. Add Danger Zone tab (suspend + delete).
8. Add Activity tab.
9. `pages/admin/AdminSuperAdmins.jsx` + `components/admin/InviteSuperAdminDrawer.jsx`.
10. `pages/admin/AdminAuditLog.jsx`.
11. `pages/admin/AdminAcceptInvite.jsx`.

After each page/tab, open it in the browser at **desktop width (≥1024px)** and **mobile width (375px)** and verify:
- No horizontal scroll on the body.
- All buttons ≥ 44px tall.
- No sm/xs font on inputs (≥16px).
- Colours match UI_SPEC §2 (no hardcoded `blue-600` / `gray-700` / etc.).
- Destructive actions go through `TypedConfirmationModal`.

### Phase 5 — Backend test coverage
Add a new test file `mern_vb_backend/tests/adminRoutes.test.js`:
- 403 when non-super-admin hits `/api/admin/*`.
- 200 when super admin hits `/api/admin/groups`.
- Billing extend policy: group paidUntil in future → extends from that date. Group paidUntil expired → extends from today.
- Soft-delete + restore round-trip preserves data.
- `updateSettings` validation fails cleanly on out-of-enum values.
- Invite flow: create invite → accept with a different Clerk user → promoted.
- Self-revoke is blocked with 400.

---

## 11. Test Cases (Executor Checklist)

Run through each test scenario manually after implementation. Take a screenshot of each on mobile + desktop.

### 11.1 Mode switching
- [ ] Super admin sees "Switch to Platform Admin" in the avatar dropdown; non-super-admin does not.
- [ ] Clicking the toggle navigates to `/admin` and the sidebar/bottom-nav changes.
- [ ] Refreshing the page persists the mode (sessionStorage).
- [ ] Signing out clears the mode.
- [ ] Normal group members visiting `/admin` are redirected to `/dashboard`.

### 11.2 Groups list
- [ ] Shows the correct count, member count, and status for each group.
- [ ] "Include deleted" toggle shows soft-deleted groups with the Deleted badge + Restore action.
- [ ] Create-group form produces a working group (admin visible in detail view, default settings seeded).
- [ ] Suspend disables access for that group's members (they hit `GROUP_SUSPENDED` on next API call).
- [ ] Unsuspend restores access.

### 11.3 Group detail
- [ ] Overview tab shows slug, admin, created, bank balance.
- [ ] Members tab lists all members; edit saves; remove with wrong confirmation rejects; removed member hidden from the group's normal /members page.
- [ ] Settings tab edits persist in the DB; a subsequent login as that group's admin reflects the new settings.
- [ ] Billing tab: activate from trial → paidUntil set. Activate again with 1 month → paidUntil extends by one month from existing date. Custom paidUntil override sets exact date.
- [ ] Mark unpaid sets `isPaid=false`, `paidUntil=null`.
- [ ] Danger Zone: soft-delete with typed confirmation works; the group disappears from members' `/dashboard` with `GROUP_DELETED` 403.

### 11.4 Super admins
- [ ] Invite sends an email (check inbox). Link works.
- [ ] Accepting with the same email as the invite promotes the accepting Clerk user.
- [ ] Accepting an already-used token returns 400.
- [ ] Revoking another super admin works; they lose `/admin` access on next request.
- [ ] Self-revoke is blocked.

### 11.5 Audit log
- [ ] Every state-changing action from sections above creates an entry.
- [ ] Filters by group and actor work.
- [ ] Metadata before/after snapshots are readable.

### 11.6 Mobile-responsive smoke test
On Chrome DevTools iPhone SE (375×667):
- [ ] `/admin` overview: stat cards 2×2, no overflow.
- [ ] `/admin/groups`: each group a card (not a table), status badge visible, "View" full-width.
- [ ] `/admin/groups/:id`: tab strip scrollable, each tab's content readable without pinch-zoom.
- [ ] `BillingActivationDrawer`: slides up from bottom, full-width inputs, footer sticky.
- [ ] `TypedConfirmationModal`: centred, stays in viewport, inputs at 16px.
- [ ] `AdminAuditLog`: entries render as stacked cards, filter bar wraps.

---

## 12. Verification Loop (before reporting done)

Run in order. Do not skip.

```bash
# Step 1 — Backend tests
cd mern_vb_backend && pnpm test

# Step 2 — Frontend tests
cd mern-vb-frontend && pnpm test

# Step 3 — Financial audit (confirms none of the admin endpoints corrupted balances)
cd mern_vb_backend && node scripts/auditBankBalance.js
```

Then grep for stragglers:

```bash
# No console.log in new code
grep -rn "console.log" mern_vb_backend/controllers/admin* mern_vb_backend/controllers/platform* mern_vb_backend/controllers/superAdmin* mern_vb_backend/middleware/requireSuperAdmin.js mern_vb_backend/utils/auditLog.js

grep -rn "console.log" mern-vb-frontend/src/pages/admin mern-vb-frontend/src/components/admin mern-vb-frontend/src/components/layout/Admin*

# No hardcoded Tailwind colours (blue-600, gray-700, red-600, etc.) in new UI
grep -rn -E "(blue|gray|red|green|amber|yellow)-[0-9]{3}" mern-vb-frontend/src/pages/admin mern-vb-frontend/src/components/admin mern-vb-frontend/src/components/layout/Admin*
```

Final report format:

```
✓ Backend tests passed
✓ Frontend tests passed
✓ Balance audit clean
✓ No console.log in new files
✓ No hardcoded Tailwind colours — UI_SPEC tokens only
✓ Manual QA (desktop + mobile) passed for all sections 11.1–11.6
Ready to commit.
```

---

## 13. Commit Plan

One commit per phase, conventional-commit style, no `Co-Authored-By` lines (user preference).

1. `feat(admin): add super-admin data model (soft delete, invites, audit log)` — phase 1
2. `feat(admin): add platform admin API (groups, settings, billing, members, super admins)` — phase 2
3. `feat(admin): add platform admin UI shell and mode switch` — phase 3
4. `feat(admin): add platform admin pages (overview, groups, members, settings, billing, audit, super admins)` — phase 4
5. `test(admin): cover platform admin routes and billing extend policy` — phase 5

---

## 14. Rollback

The whole plan is additive — no destructive migrations.

- Removing the routes in `routes/admin.js` reverts the API surface.
- The `deletedAt`, `suspendedAt`, `revokedAt` fields on existing models are nullable and default to `null`; rolling back code ignores them.
- No data migration is run.
- `TypedConfirmationModal`, `AdminShell`, and admin pages are self-contained under `admin/` directories — deleting the directories removes them cleanly.

If a post-deploy bug is found in billing activation, revert `controllers/adminBillingController.js` to a no-op 501 and continue using `scripts/activateGroup.js` while fixing forward.

---

## 15. Out of Scope (do NOT build)

- Cross-group analytics (MRR history, churn charts). Overview shows a single MRR estimate; everything else is parked.
- CSV export of the audit log. Parked.
- Impersonate / "Log in as" a group member. Explicitly rejected by the user.
- Mobile push notifications. Parked.
- Two-factor auth for super admins. Parked (rely on Clerk).
- Editing Clerk user records directly (email, name). Out of scope — Clerk Dashboard handles it.

---

*End of plan. Hand this file to a fresh Sonnet session. No other context is required.*
