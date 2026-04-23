# Session 1 Implementation Plan — Role Cleanup & Member Verification Status

**For:** Fresh Sonnet session (Chama360, MERN stack, Clerk auth)
**Date written:** 2026-04-23
**Reviewed against:** `CLAUDE.md`, `UI_SPEC.md`, live code (GroupMember, SuperAdmin, Group, inviteController, webhookRoutes, userController, MembersPage)

---

## Ground truth — field names verified against live models

Before writing any code, note these actual field names (do NOT assume):

- **`GroupMember`** (`mern_vb_backend/models/GroupMember.js`): `clerkUserId`, `groupId`, `role` (enum: admin/treasurer/loan_officer/member), `name`, `phone`, `email`, `active`, `deletedAt`, timestamps. Compound unique index on `{ clerkUserId, groupId }` with partial filter `clerkUserId: { $ne: null }`.
- **`SuperAdmin`** (`mern_vb_backend/models/SuperAdmin.js`): `clerkUserId` (unique), `email`, `name`, `invitedBy`, `revokedAt`, timestamps.
- **`Group`** (`mern_vb_backend/models/Group.js`): `name`, `slug`, **`clerkAdminId`** (this is the field — NOT `adminClerkUserId`), `trialExpiresAt`, `isPaid`, `paidUntil`, `deletedAt`, `suspendedAt`, `suspendedReason`, timestamps.
- **`PendingInvite`**: fields include `email`, `groupId`, `role`, `invitedBy`, `name`, `expiresAt` (inferred from webhook + inviteController usage).

All scripts follow the existing boilerplate pattern from `scripts/seedSuperAdmin.js`: `require('dotenv').config()` → `mongoose.connect(process.env.MONGODB_URI, { serverApi: { version: '1', strict: true, deprecationErrors: true } })` → do work → `mongoose.disconnect()`.

**Execution sequencing (strict order):**
1. Run audit script → review output → proceed only if state matches expectations
2. Run fix script → run audit again to confirm → proceed
3. Add `isVerified` to schema
4. Run backfill script
5. Update webhook handler
6. Update invite controller
7. Update MembersPage
8. Run verification loop (tests, console.log sweep)

Do not commit until all steps pass.

---

## Step 1 — Create the read-only audit script

**File to create:** `mern_vb_backend/scripts/auditRolesSession1.js`

**Purpose:** Print current state without writing anything. This is a go/no-go gate before Step 2.

**What it must do:**

1. Connect to MongoDB using the standard script boilerplate.
2. Look up and print the **`SuperAdmin` document** for `wmweemba@gmail.com`:
   - Query: `SuperAdmin.findOne({ email: 'wmweemba@gmail.com' })`
   - Print: `_id`, `clerkUserId`, `email`, `revokedAt`, `createdAt`
   - Flag: "ACTIVE" if `revokedAt === null`, else "REVOKED"
   - If no document: print "SuperAdmin record MISSING for wmweemba@gmail.com"
3. Look up and print **all `GroupMember` documents** for `wmweemba@gmail.com`:
   - Query: `GroupMember.find({ email: 'wmweemba@gmail.com' })`
   - For each: print `_id`, `groupId`, `clerkUserId`, `role`, `name`, `deletedAt`, `active`
4. Look up and print the **`GroupMember` document** for `admin@vb.com`:
   - Query: `GroupMember.find({ email: 'admin@vb.com' })` (use `find` because there might be multiples)
   - For each: print `_id`, `groupId`, `clerkUserId`, `role`, `name`, `deletedAt`, `active`
   - If none: print "No GroupMember records found for admin@vb.com — nothing to clean up"
5. Look up and print the **`Group` document(s)** whose name contains "William" (case-insensitive):
   - Query: `Group.find({ name: { $regex: /william/i } })`
   - For each: print `_id`, `name`, `slug`, `clerkAdminId`, `deletedAt`
   - For each group, also resolve who `clerkAdminId` maps to by looking up any GroupMember in that group with that clerkUserId:
     - `GroupMember.findOne({ clerkUserId: group.clerkAdminId, groupId: group._id })` → print that member's `email` and `name`
6. Print a final **SUMMARY SECTION** with four lines:
   - `SuperAdmin for William: <ACTIVE | MISSING | REVOKED>`
   - `William's GroupMember role: <role> (deletedAt: <value>)`
   - `admin@vb.com GroupMember records: <count>`
   - `Group.clerkAdminId points to: <email or "unknown Clerk ID">`

**Do NOT write anything to the database in this script.** No `save`, `create`, `update`, `delete`. Read-only only.

**How to run:**
```bash
cd mern_vb_backend && node scripts/auditRolesSession1.js
```

**Stop here. Do not proceed to Step 2 until the operator has reviewed the audit output and confirmed it matches the expected pre-fix state:**
- admin@vb.com GroupMember exists with some role
- William's GroupMember exists but role is NOT admin (likely `loan_officer`)
- SuperAdmin for William is present or absent
- Group.clerkAdminId may point to admin@vb.com's Clerk ID

If the state is already clean (William is admin, SuperAdmin active, admin@vb.com gone, Group.clerkAdminId correct), skip Step 2.

---

## Step 2 — Create the idempotent fix script

**File to create:** `mern_vb_backend/scripts/fixRolesSession1.js`

**Purpose:** Reach the desired end state. Safe to run multiple times.

**What it must do** (each step logs "Found: ..." → then "Changed: ..." or "No change needed"):

1. Connect to MongoDB using standard boilerplate.

2. **Resolve William's Clerk user ID.** This is needed for later steps.
   - First, try `GroupMember.findOne({ email: 'wmweemba@gmail.com', clerkUserId: { $ne: null } })` → if found, use that `clerkUserId`.
   - If not found, try `SuperAdmin.findOne({ email: 'wmweemba@gmail.com' })` → use that `clerkUserId`.
   - If neither is found: **log an error and exit with code 1** — do not proceed. The operator must create a Clerk account first.
   - Log: `William's Clerk user ID resolved: <id>`

3. **Ensure William's GroupMember record has `role: 'admin'`.**
   - Query: `GroupMember.findOne({ email: 'wmweemba@gmail.com' })`
   - If not found: log error and exit — William must already exist as a GroupMember.
   - If `role === 'admin'`: log "William is already admin — no change"
   - Else: set `role = 'admin'`, save, log `Promoted William from <old> to admin`

4. **Ensure William's SuperAdmin record exists and is active.**
   - Query: `SuperAdmin.findOne({ clerkUserId: williamClerkId })`
   - If not found: `SuperAdmin.create({ clerkUserId: williamClerkId, email: 'wmweemba@gmail.com', name: williamMember.name })` → log "Created SuperAdmin for William"
   - If found but `revokedAt !== null`: set `revokedAt = null`, save, log "Reactivated SuperAdmin for William"
   - Else: log "SuperAdmin for William already active — no change"

5. **Update every `Group` whose `clerkAdminId` is incorrect to point to William's Clerk ID.**
   - Query all groups where William is an admin-level member:
     - Get all GroupMember records where `email === 'wmweemba@gmail.com'` and collect their `groupId` values into an array `williamGroupIds`.
   - For each `groupId` in that list:
     - Load `group = Group.findById(groupId)`
     - If `group.clerkAdminId !== williamClerkId`: set `group.clerkAdminId = williamClerkId`, save, log `Updated Group "<name>" clerkAdminId from <old> to <new>`
     - Else: log `Group "<name>" clerkAdminId already correct — no change`
   - **Do NOT touch any other groups.** Only the groups William is a member of.

6. **Hard-delete the `admin@vb.com` GroupMember record(s).**
   - Query: `GroupMember.find({ email: 'admin@vb.com' })`
   - For each match: log `Deleting admin@vb.com GroupMember: _id=<id>, groupId=<id>, role=<role>` → `GroupMember.deleteOne({ _id: match._id })`
   - If none found: log "No admin@vb.com records to delete"

7. Print a final summary block with same four lines as audit script (re-query each to confirm the end state).

8. Disconnect.

**Constraints:**
- Do NOT touch any other GroupMember records.
- Do NOT touch loans, savings, transactions, fines, GroupSettings, InviteTokens, or PendingInvites.
- Every write must be preceded by a log of the "before" state.
- Every write must be followed by a log of the "after" state or a "no change" message.

**How to run:**
```bash
cd mern_vb_backend && node scripts/fixRolesSession1.js
```

After running, re-run the audit script to confirm the end state matches expectations.

---

## Step 3 — Add `isVerified` field to GroupMember schema

**File to modify:** `mern_vb_backend/models/GroupMember.js`

**What to change:** Add one field to the schema, right after the existing `deletedAt` field and before the closing `}`.

Current code at lines 3–25:
```js
const groupMemberSchema = new mongoose.Schema({
  clerkUserId: {
    type: String,
    default: null,
    sparse: true,
  },
  groupId: { ... },
  role: { ... },
  name: { type: String, required: true },
  phone: { type: String },
  email: { type: String },
  active: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });
```

Add the new field **before** `}, { timestamps: true });`:

```js
  deletedAt: { type: Date, default: null },
  isVerified: { type: Boolean, default: false },
}, { timestamps: true });
```

Do not add any comments. Do not change anything else in the file.

---

## Step 4 — Create the backfill script

**File to create:** `mern_vb_backend/scripts/backfillVerified.js`

**Purpose:** Populate `isVerified` for every existing GroupMember record. Idempotent.

**What it must do:**

1. Connect to MongoDB using standard boilerplate.
2. Fetch all GroupMember records: `GroupMember.find({})`.
3. For each record:
   - If `clerkUserId` is a non-null, non-empty string: set `isVerified = true`.
   - Else: set `isVerified = false`.
   - Save the document (only if the value changed, to avoid needless writes — check `if (member.isVerified !== target) { member.isVerified = target; await member.save(); }`).
4. At the end, print a summary:
   - Total records processed: N
   - Set to `isVerified: true`: N (list each email)
   - Set to `isVerified: false`: N (count only, no list — could be large)
5. Disconnect.

**Constraints:**
- Do not touch any field other than `isVerified`.
- Log but do not error on records with no email (these still get `isVerified` based on `clerkUserId`).

**How to run:**
```bash
cd mern_vb_backend && node scripts/backfillVerified.js
```

Run this **once** after Step 3 is deployed.

---

## Step 5 — Update the Clerk webhook handler

**File to modify:** `mern_vb_backend/routes/webhookRoutes.js`

**What needs to change:** The current handler in the `user.created` branch creates a new GroupMember unconditionally if one doesn't already exist for that `clerkUserId + groupId`. This leaves legacy unverified records orphaned. Update it so that if an unverified GroupMember already exists for the same group+email, we UPDATE that record instead of creating a new one.

**Current logic (lines 28–59):**
```js
if (type === 'user.created') {
  try {
    const email = data.email_addresses?.[0]?.email_address;
    const clerkUserId = data.id;

    if (!email) return res.status(200).json({ received: true });

    const invite = await PendingInvite.findOne({
      email: email.toLowerCase().trim(),
    });

    if (invite) {
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

      await PendingInvite.deleteOne({ _id: invite._id });
    }
  } catch (err) { ... }
}
```

**Replace the `if (invite) { ... }` block with:**

```js
if (invite) {
  const normalizedEmail = email.toLowerCase().trim();

  // Already linked to this Clerk user in this group — nothing to do
  const alreadyLinked = await GroupMember.findOne({
    clerkUserId,
    groupId: invite.groupId,
  });

  if (!alreadyLinked) {
    // Look for a legacy unverified record for this email in this group
    const legacy = await GroupMember.findOne({
      groupId: invite.groupId,
      email: normalizedEmail,
      isVerified: false,
    });

    if (legacy) {
      legacy.clerkUserId = clerkUserId;
      legacy.isVerified = true;
      if (invite.role && legacy.role !== invite.role) legacy.role = invite.role;
      if (invite.name && !legacy.name) legacy.name = invite.name;
      await legacy.save();
    } else {
      await GroupMember.create({
        clerkUserId,
        groupId: invite.groupId,
        role: invite.role,
        name: invite.name,
        email: normalizedEmail,
        isVerified: true,
      });
    }
  }

  await PendingInvite.deleteOne({ _id: invite._id });
}
```

**Key behaviour:**
- New signup with no legacy record → creates GroupMember with `isVerified: true`.
- New signup with a matching legacy unverified record → updates that record (sets `clerkUserId`, `isVerified: true`, role if role on invite differs).
- Already-linked clerkUserId+groupId → no-op, invite is still cleared.

Do not change the webhook signature verification logic, the error handling, or any other part of the file.

---

## Step 6 — Update the invite controller to allow re-invites of unverified members

**File to modify:** `mern_vb_backend/controllers/inviteController.js`

**What needs to change:** In `exports.inviteByEmail`, the existing block at lines 117–124 rejects any invite where the email already matches a GroupMember. Update that check so unverified members can be re-invited, verified members cannot.

**Current logic (lines 117–124):**
```js
// Check email is not already a GroupMember of this group
const existingMember = await GroupMember.findOne({
  email: email.toLowerCase().trim(),
  groupId: req.groupId,
});
if (existingMember) {
  return res.status(409).json({ error: 'This email is already a member of your group' });
}
```

**Replace with:**
```js
// Check email is not already a GroupMember of this group
const normalizedEmail = email.toLowerCase().trim();
const existingMember = await GroupMember.findOne({
  email: normalizedEmail,
  groupId: req.groupId,
});
if (existingMember && existingMember.isVerified) {
  return res.status(409).json({ error: 'This member already has an active account.' });
}
// If existingMember exists but isVerified is false, this is a re-invite of a
// legacy member — proceed. The webhook handler links the Clerk signup back to
// this existing record on user.created.
```

**Also update** the place where the controller stores the `PendingInvite` (lines 134–142). After creating the PendingInvite, if `existingMember` exists and the passed-in `name` differs from `existingMember.name`, update the existing member's name so the legacy record matches what the admin is inviting them under. Do NOT change the email on the existing member at this point — the webhook handler will do that linkage once Clerk signup fires.

Insert this block immediately after the `await PendingInvite.create(...)` call:

```js
// If a legacy unverified member exists with a different name, align the name
// on the existing record so the re-invite doesn't create a mismatch.
if (existingMember && !existingMember.isVerified && name && existingMember.name !== name) {
  existingMember.name = name;
  await existingMember.save();
}
```

Do not change any other logic in this file.

---

## Step 7 — MembersPage: show "Pending" badge for unverified members

**File to modify:** `mern-vb-frontend/src/pages/MembersPage.jsx`

**What needs to change:** The `MemberRow` component (lines 43–69) needs to render a "Pending" badge for members where `member.isVerified === false`, visible only to non-`member` viewers.

The current row layout is:
```
[avatar] [name + email] [RoleBadge]
```

New layout:
```
[avatar] [name + Pending badge (if applicable)] [RoleBadge]
             email
```

The Pending badge goes next to the name (inline), on the same line, separated by a small gap. The badge uses the PENDING palette from `UI_SPEC.md` section 2.1:
- Background: `bg-status-pending-bg` (#FFF0E0 — pale amber)
- Text: `text-status-pending-text` (#B85A00 — dark amber-orange)
- NOT the red `status-overdue` palette. (The prompt originally said overdue, but UI_SPEC.md §6.14 defines PENDING as amber. Amber is correct here — pending verification is not an error state.)

**Implementation:**

1. Change the `MemberRow` function signature to accept `canSeeStatus`:
   ```jsx
   function MemberRow({ member, canSeeStatus }) {
   ```

2. Inside `MemberRow`, replace the name `<p>` block at line 61 with:
   ```jsx
   <div className="flex items-center gap-2">
     <p className="text-sm font-semibold text-text-primary truncate">{member.name}</p>
     {canSeeStatus && member.isVerified === false && (
       <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-status-pending-bg text-status-pending-text flex-shrink-0">
         Pending
       </span>
     )}
   </div>
   ```

3. In `MembersPage` (the default export, at the map on line 231), pass the new prop:
   ```jsx
   members.map(m => <MemberRow key={m._id} member={m} canSeeStatus={canInvite} />)
   ```
   (`canInvite` is already defined at line 180 as `user && user.role !== 'member'`, which is exactly the gate we want: admin, treasurer, loan_officer see the badge; regular members do not.)

Do not change anything else on the page — not the layout, not the pending-invites card at the bottom, not the invite drawer.

**Note on backend delivery:** `userController.getUsers` uses `.select('-clerkUserId')` which excludes only `clerkUserId`. The new `isVerified` field will be included by default — no backend controller change needed.

---

## Step 8 — Verification loop

After completing all above steps, run this sequence from `CLAUDE.md` §Verification Loop:

1. **Backend tests:**
   ```bash
   cd mern_vb_backend && pnpm test
   ```
   All must pass.

2. **Frontend tests:**
   ```bash
   cd mern-vb-frontend && pnpm test
   ```
   All must pass.

3. **Console.log sweep** (only on files you touched this session):
   ```bash
   grep -n "console.log" mern_vb_backend/controllers/inviteController.js mern_vb_backend/routes/webhookRoutes.js mern-vb-frontend/src/pages/MembersPage.jsx
   ```
   Scripts in `scripts/` are allowed to keep their `console.log` calls — those are operator-facing tools.

4. **Manual smoke test (optional but recommended):**
   - Run `pnpm start` to bring up both servers.
   - Log in as William → visit `/members` → confirm no "Pending" badge shows on William's row (he will be verified), but legacy members show one.
   - Log in as a regular member account → visit `/members` → confirm NO "Pending" badge shows on anyone.

5. **State the result** per `CLAUDE.md` §Step 5 format.

---

## Deliverables summary

| # | Deliverable | File path | Type |
|---|---|---|---|
| 1 | Audit script | `mern_vb_backend/scripts/auditRolesSession1.js` | NEW |
| 2 | Fix script | `mern_vb_backend/scripts/fixRolesSession1.js` | NEW |
| 3 | Schema change (`isVerified` field) | `mern_vb_backend/models/GroupMember.js` | EDIT |
| 4 | Backfill script | `mern_vb_backend/scripts/backfillVerified.js` | NEW |
| 5 | Webhook handler update | `mern_vb_backend/routes/webhookRoutes.js` | EDIT |
| 6 | Invite controller update | `mern_vb_backend/controllers/inviteController.js` | EDIT |
| 7 | MembersPage Pending badge | `mern-vb-frontend/src/pages/MembersPage.jsx` | EDIT |

Execution order: 1 → (review) → 2 → (re-audit) → 3 → 4 → 5 → 6 → 7 → Step 8 verification.

---

## Things explicitly out of scope

- Loan, savings, transaction, fine, repayment, cycle logic — no changes.
- GroupSettings, Threshold — no changes.
- Super Admin UI or `/admin` routes — no changes.
- Onboarding wizard, trial/billing logic — no changes.
- Any GroupMember field other than `isVerified` (and `role` for William only) — no changes.
- `acceptInvite` flow (legacy token-based invite) — no changes.

---

## One deviation from the original prompt to flag

The original prompt asked for the Pending badge to use the `status-overdue` palette (red). `UI_SPEC.md` §2.2 reserves red strictly for overdue/error states. Pending verification is not an error — it's a neutral "awaiting signup" state. The PENDING palette (amber) is the correct match per the spec's §6.14 Status Badges table. The plan uses PENDING amber. If the operator disagrees, they can swap `bg-status-pending-bg`/`text-status-pending-text` for `bg-status-overdue-bg`/`text-status-overdue-text` in one line.

---

Is this plan self-contained for a fresh Sonnet session?
