# Implementation Plan — Contributions Feature (Dual-Balance)

> Author: Opus planning pass. Date: 2026-05-28.
> Scope: backend models, routes, controllers, atomic flows, seeding, tests, frontend inventory.
> **No application code is written by this plan. It is a build spec for a fresh Sonnet session.**

---

## 0. Codebase Reality Check (read before planning around CLAUDE.md)

CLAUDE.md is partly stale. The actual code I inspected differs in ways that materially affect this feature. Build against the **actual** patterns below, not CLAUDE.md's descriptions.

1. **Auth is Clerk, not raw JWT/localStorage.** `middleware/auth.js` uses `@clerk/express` `getAuth(req)`. The chain on every group-scoped route is:
   ```
   verifyToken → resolveGroup → checkTrial → allowRoles(...) → controller
   ```
2. **Multi-group is already live.** `middleware/resolveGroup.js` attaches to `req`:
   - `req.groupId` (ObjectId)
   - `req.groupScope` = `{ groupId }` (spread into every query: `{ ...req.groupScope, ... }`)
   - `req.memberId` (the acting GroupMember's `_id`)
   - `req.role` (`admin` | `treasurer` | `loan_officer` | `member`)
   - `req.member`, `req.user = { id, role, groupId }`, `req.isSuperAdmin`
   Every new query, document, and transaction MUST be group-scoped.
3. **`checkTrial`** blocks all non-GET writes once a trial expires. New write routes get this automatically by sitting behind `checkTrial`.
4. **Two reusable helpers already exist and must be reused:**
   - `bankBalanceController.updateBankBalance(amount, groupId, session = null)` — mutates the single BankBalance doc, creates it if missing, returns new balance. Handles `session` correctly (uses `BankBalance.create([..], { session })`).
   - `transactionController.logTransaction({ userId, type, amount, referenceId, note, groupId }, session = null)` — writes a Transaction and **re-throws on failure** so the surrounding transaction aborts. Does NOT currently accept `cycleNumber`/`cycleEndDate`.
5. **Two session styles exist.** Prefer the newer `session.withTransaction(async () => { ... })` form (used in `voidFine`, `deleteFine`, `createGroup`) over the manual `startTransaction`/`commitTransaction`/`abortTransaction` form (used in `repayment`). `withTransaction` auto-handles commit/abort and transient-error retries. **Use `withTransaction` for all new code in this feature.**
6. **`req.body` validation pattern:** controllers validate inline and return `res.status(4xx).json({ error })`; inside `withTransaction` they `throw Object.assign(new Error('msg'), { status: 4xx })` and the catch maps `err.status || 500`.
7. **Member-scoped reads:** the `getAllFines` pattern is the template — officers/admin see everything; `if (req.role === 'member') query.userId = req.memberId`.
8. **`Transaction.userId` is `required: true`** and is `populate`d as `('userId', 'name')` in several places. This is a real constraint for social-fund expenses (see §B and §I).

---

## A. New Mongoose Models

All models live in `mern_vb_backend/models/`. Mirror the existing field-style (plain schemas, `ref: 'Group'`/`ref: 'GroupMember'`, `groupId` indexed). Add `{ timestamps: true }` to the two transactional records (Contribution, SocialFundExpense) for consistency with `GroupMember`; the two "config/balance" docs can keep the explicit `createdAt`/`updatedAt` style used by `GroupSettings`/`BankBalance`.

### A.1 `ContributionType.js`
Treasurer-configured catalog of contribution kinds, per group.

```js
{
  groupId:           { type: ObjectId, ref: 'Group', required: true, index: true },
  name:              { type: String, required: true, trim: true },        // e.g. "Admin Fee"
  affectsMainBalance:{ type: Boolean, required: true, default: true },     // default routing
  active:            { type: Boolean, default: true },                     // toggle on/off
  isDefault:         { type: Boolean, default: false },                    // true for the 2 seeded types
  createdBy:         { type: ObjectId, ref: 'GroupMember', default: null },
  createdAt / updatedAt
}
```
- **Index:** `{ groupId: 1, name: 1 }` **unique** — prevents duplicate type names within a group. (Names compared as stored; recommend lowercasing for the uniqueness check OR a case-insensitive collation `{ locale: 'en', strength: 2 }` to stop "Admin fee" vs "Admin Fee" duplicates.)
- **Validation:** `name` required + trimmed; reject empty after trim in the controller.
- **Deletion policy:** types are **never hard-deleted** — only `active` is toggled, so historical Contributions keep a valid `contributionTypeId`. PATCH handles both rename and active toggle.

### A.2 `Contribution.js`
One row per recorded contribution (the credit side).

```js
{
  groupId:            { type: ObjectId, ref: 'Group', required: true, index: true },
  userId:             { type: ObjectId, ref: 'GroupMember', required: true },   // the contributing member
  contributionTypeId: { type: ObjectId, ref: 'ContributionType', required: true },
  typeName:           { type: String, required: true },   // denormalized snapshot at record time
  amount:             { type: Number, required: true, min: 0.01 },
  affectsMainBalance: { type: Boolean, required: true },  // RESOLVED effective value (default or override)
  overrodeDefault:    { type: Boolean, default: false },  // true if recorder flipped the type's default
  note:               { type: String },
  recordedBy:         { type: ObjectId, ref: 'GroupMember', required: true },
  transactionId:      { type: ObjectId, ref: 'Transaction' },  // link to the ledger entry
  date:               { type: Date, default: Date.now },
  cycleNumber:        { type: Number },
  cycleEndDate:       { type: Date },
  archived:           { type: Boolean, default: false },
  createdAt / updatedAt
}
```
- **Indexes:** `{ groupId: 1, createdAt: -1 }` (list view), `{ groupId: 1, userId: 1 }` (member's own list).
- **Why `typeName` is denormalized:** if a treasurer renames or deactivates a type later, historical receipts/reports must still show the name used at the time. Same defensive pattern as `Fine.username`.
- **Why store resolved `affectsMainBalance` + `overrodeDefault`:** the row must be self-describing for the audit and reports without re-reading the (possibly since-changed) ContributionType.

### A.3 `SocialFundBalance.js`
Direct structural mirror of `BankBalance.js` — a single document per group.

```js
{
  balance: { type: Number, required: true, default: 0 },
  groupId: { type: ObjectId, ref: 'Group', required: true },
}
// index: { groupId: 1 } unique
```

### A.4 `SocialFundExpense.js`
The debit side of the social-fund mini-ledger.

```js
{
  groupId:             { type: ObjectId, ref: 'Group', required: true, index: true },
  amount:              { type: Number, required: true, min: 0.01 },   // stored POSITIVE; direction implied by type
  category:            { type: String, enum: ['birthday','bereavement','stationery','refreshments','other'], default: 'other' },
  description:         { type: String, required: true, trim: true },
  beneficiaryMemberId: { type: ObjectId, ref: 'GroupMember', default: null }, // optional — internal member
  beneficiaryName:     { type: String, default: null },              // optional — external payee free text
  recordedBy:          { type: ObjectId, ref: 'GroupMember', required: true },
  transactionId:       { type: ObjectId, ref: 'Transaction' },
  cancelled:           { type: Boolean, default: false },            // void pattern, mirrors Fine
  cancelledAt:         { type: Date },
  cancelReason:        { type: String },
  date:                { type: Date, default: Date.now },
  cycleNumber:         { type: Number },
  cycleEndDate:        { type: Date },
  archived:            { type: Boolean, default: false },
  createdAt / updatedAt
}
```
- **Index:** `{ groupId: 1, createdAt: -1 }`.
- **Amount sign convention:** stored **positive**, direction implied by the transaction `type` — this matches how `payout` and `loan` are stored (positive amount, treated as `-amount` in the audit). Do NOT store negative amounts on the primary expense record.

---

## B. Changes to Existing Models

### B.1 `Transaction.js` — enum additions (required)
Extend the `type` enum to:
```js
enum: ['loan','saving','fine','payment','loan_payment','payout','cycle_reset',
       'contribution','social_fund_credit','social_fund_debit']
```
- `contribution` → credit to **main** BankBalance.
- `social_fund_credit` → credit to **SocialFundBalance**.
- `social_fund_debit` → debit from **SocialFundBalance** (expense).

### B.2 `Transaction.userId` constraint — decision required
`userId` is `required: true` and is `populate('userId','name')`'d in reports/transaction lists. Social-fund **expenses** are not always tied to a member (stationery, refreshments).
- **Chosen approach (lowest risk, no migration):** always set `Transaction.userId` for `social_fund_debit` to `beneficiaryMemberId` when present, otherwise to `recordedBy` (the acting treasurer's `req.memberId`). This keeps every ledger row populatable and avoids relaxing the schema. The "true" beneficiary detail lives on `SocialFundExpense` (`beneficiaryMemberId` / `beneficiaryName`).
- **Rejected alternative:** making `userId` optional — touches existing populate sites and the audit, higher regression surface during the launch sprint.

### B.3 `GroupSettings.js` — no required change
The feature works without GroupSettings edits. **Optional** (only if product wants a per-group kill-switch): add
```js
socialFundEnabled: { type: Boolean, default: true }
```
If added, the social-fund routes/UI check it. Not required for v1 — leave out unless requested, to avoid touching the seed payloads in two controllers.

### B.4 `BankBalance.js` — no schema change
Behavior only: a `contribution` (affectsMainBalance = true) calls the existing `updateBankBalance(+amount, ...)`. No structural change.

---

## C. New API Routes

Three new route files, each following `routes/payment.js` exactly: local `allowRoles(...roles)` helper checking `req.user.role`, chain `verifyToken, resolveGroup, checkTrial, allowRoles(...), controller`. **Static routes before dynamic `:id` routes** (Express 5 ordering gotcha — CLAUDE.md history item #3).

New controllers: `contributionTypeController.js`, `contributionController.js`, `socialFundController.js`.

### Mount in `server.js` (after the existing `app.use('/api/...')` block)
```js
app.use('/api/contribution-types', require('./routes/contributionTypes'));
app.use('/api/contributions',      require('./routes/contributions'));
app.use('/api/social-fund',        require('./routes/socialFund'));
```

### Route table

| Method | Path | Controller fn | Roles allowed | Notes |
|---|---|---|---|---|
| POST  | `/api/contribution-types`      | `contributionTypeController.createType`  | admin, treasurer | financial config; **member blocked** |
| GET   | `/api/contribution-types`      | `contributionTypeController.listTypes`    | all roles | supports `?active=true` filter |
| PATCH | `/api/contribution-types/:id`  | `contributionTypeController.updateType`   | admin, treasurer | rename + toggle `active`; mounted AFTER the static GET/POST |
| POST  | `/api/contributions`           | `contributionController.recordContribution` | admin, treasurer, loan_officer | recorders, same as savings/fines; **member blocked** |
| GET   | `/api/contributions`           | `contributionController.listContributions` | all roles | members see only own (`req.role==='member' → query.userId = req.memberId`) |
| GET   | `/api/social-fund/balance`     | `socialFundController.getBalance`         | all roles | transparency read |
| POST  | `/api/social-fund/expenses`    | `socialFundController.recordExpense`      | admin, treasurer | money out of the pot; loan_officer excluded (judgment call — see §I.7) |
| GET   | `/api/social-fund/expenses`    | `socialFundController.listExpenses`       | all roles | full history for transparency |

Role rationale: contribution **types** are configuration (treasurer/admin only). **Recording** a contribution matches who records savings/fines today (admin/treasurer/loan_officer). **Reads** are open to all roles because the social fund is a transparency feature. The two permission test cases (member cannot record a contribution; member cannot create a type) are satisfied by the `allowRoles` lists above.

---

## D. Atomic Flow — Recording a Contribution

Controller: `contributionController.recordContribution`. Use `session.withTransaction`.

**Request body:** `{ username | userId, contributionTypeId, amount, note?, affectsMainBalance? }`
(`affectsMainBalance` present in body = the per-transaction override toggle.)

```
const session = await mongoose.startSession();
try {
  let result;
  await session.withTransaction(async () => {

    // 1. Validate amount
    const amt = Number(amount);
    if (!amt || amt <= 0) throw Object.assign(new Error('Invalid amount'), { status: 400 });

    // 2. Resolve contributing member (group-scoped, active, not soft-deleted)
    const member = await GroupMember.findOne({ name: username, ...req.groupScope, active: true, deletedAt: null }).session(session);
    if (!member) throw Object.assign(new Error(`Member '${username}' not found`), { status: 404 });

    // 3. Load the contribution type (must belong to group AND be active)
    const type = await ContributionType.findOne({ _id: contributionTypeId, ...req.groupScope, active: true }).session(session);
    if (!type) throw Object.assign(new Error('Contribution type not found or inactive'), { status: 400 });

    // 4. Resolve effective routing (override toggle)
    const effectiveAffectsMain = (typeof affectsMainBalance === 'boolean') ? affectsMainBalance : type.affectsMainBalance;
    const overrodeDefault = effectiveAffectsMain !== type.affectsMainBalance;

    // 5. Create the Contribution row (snapshot typeName, resolved routing)
    const [contribution] = await Contribution.create([{
      ...req.groupScope, userId: member._id,
      contributionTypeId: type._id, typeName: type.name,
      amount: amt, affectsMainBalance: effectiveAffectsMain, overrodeDefault,
      note, recordedBy: req.memberId,
    }], { session });

    // 6. Log the ledger Transaction (re-throws on failure → aborts everything)
    const tx = await logTransaction({
      userId: member._id,
      type: effectiveAffectsMain ? 'contribution' : 'social_fund_credit',
      amount: amt,
      referenceId: contribution._id,
      note: note || `${type.name} contribution`,
      groupId: req.groupId,
    }, session);

    // 7. Update the correct balance (+amount)
    if (effectiveAffectsMain) {
      await updateBankBalance(amt, req.groupId, session);
    } else {
      await updateSocialFundBalance(amt, req.groupId, session);   // new helper, see §socialFundController
    }

    // 8. Back-link the transaction onto the contribution
    contribution.transactionId = tx._id;
    await contribution.save({ session });

    result = contribution;
  });
  res.status(201).json(result);
} catch (err) {
  res.status(err.status || 500).json({ error: err.message, details: err.message });
} finally {
  session.endSession();
}
```

**Order written:** Contribution row → Transaction → balance mutation → back-link save. **Rollback:** any thrown error (validation, missing member/type, balance write failure, transaction-log failure) causes `withTransaction` to abort — no Contribution, no Transaction, and no balance change persist. The `loanDataChanged`-style global refresh is a frontend concern (§J).

---

## E. Atomic Flow — Recording a Social Fund Expense

Controller: `socialFundController.recordExpense`. Use `session.withTransaction`.

**Request body:** `{ amount, description, category?, beneficiaryMemberId?, beneficiaryName? }`

```
const session = await mongoose.startSession();
try {
  let result;
  await session.withTransaction(async () => {

    // 1. Validate
    const amt = Number(amount);
    if (!amt || amt <= 0) throw Object.assign(new Error('Invalid amount'), { status: 400 });
    if (!description || !description.trim()) throw Object.assign(new Error('Description is required'), { status: 400 });

    // 2. Resolve optional beneficiary member (group-scoped)
    let beneficiary = null;
    if (beneficiaryMemberId) {
      beneficiary = await GroupMember.findOne({ _id: beneficiaryMemberId, ...req.groupScope, deletedAt: null }).session(session);
      if (!beneficiary) throw Object.assign(new Error('Beneficiary member not found'), { status: 404 });
    }

    // 3. Guard against overspend — read current social fund balance in-session
    let sf = await SocialFundBalance.findOne({ groupId: req.groupId }).session(session);
    const currentBalance = sf ? sf.balance : 0;
    if (amt > currentBalance) {
      throw Object.assign(new Error(`Insufficient social fund balance (available K${currentBalance})`), { status: 400 });
    }

    // 4. Create the expense row (amount stored POSITIVE)
    const [expense] = await SocialFundExpense.create([{
      ...req.groupScope, amount: amt,
      category: category || 'other', description: description.trim(),
      beneficiaryMemberId: beneficiary ? beneficiary._id : null,
      beneficiaryName: beneficiary ? null : (beneficiaryName || null),
      recordedBy: req.memberId,
    }], { session });

    // 5. Log the ledger Transaction. userId = beneficiary || recorder (see §B.2). Amount POSITIVE; type implies debit.
    const tx = await logTransaction({
      userId: beneficiary ? beneficiary._id : req.memberId,
      type: 'social_fund_debit',
      amount: amt,
      referenceId: expense._id,
      note: `Social fund expense: ${description.trim()}`,
      groupId: req.groupId,
    }, session);

    // 6. Decrement the social fund balance (-amount)
    await updateSocialFundBalance(-amt, req.groupId, session);

    // 7. Back-link
    expense.transactionId = tx._id;
    await expense.save({ session });

    result = expense;
  });
  res.status(201).json(result);
} catch (err) {
  res.status(err.status || 500).json({ error: err.message, details: err.message });
} finally {
  session.endSession();
}
```

**`updateSocialFundBalance(amount, groupId, session = null)`** — new helper in `socialFundController.js`, a direct copy of `updateBankBalance` but targeting `SocialFundBalance`. Creates the doc if missing (`SocialFundBalance.create([{ balance: 0, groupId }], { session })`), adds `amount`, saves with session, returns new balance.

**Overspend policy decision:** step 3 blocks expenses that exceed the available pot (no negative social fund). This is the recommended default for a real treasurer's pot. If product wants to allow a negative/"owed" balance, drop step 3 — flag to William before changing.

**Void/cancel (future, not in the 8 listed routes):** if a cancel endpoint is added later, mirror `voidFine`: require a `cancelReason`, set `cancelled`/`cancelledAt`/`cancelReason`, log a compensating `social_fund_credit` of `+amount` (or a negative `social_fund_debit`, pick one convention and keep it), and `updateSocialFundBalance(+amount,...)` — all in one `withTransaction`. Not building it now; noted so the schema (`cancelled` fields) is ready.

---

## F. Updated Bank Balance Formula

**Main BankBalance (lending pool):**
```
Bank Balance = Starting Balance (cycle_reset)
             + All Savings Deposits          (saving)            (+)
             + All Loan Payments             (loan_payment)      (+)
             + All Fine Payments             (fine, paid only)   (+)
             + All Main-Balance Contributions(contribution)      (+)   ← NEW
             - All Loan Disbursements        (loan)              (-)
             - All Payouts                   (payout)            (-)
```
`social_fund_credit` and `social_fund_debit` are **NOT** part of the main balance.

**SocialFundBalance (separate, non-lendable pot):**
```
Social Fund Balance = Σ social_fund_credit   (contributions where affectsMainBalance=false)   (+)
                    - Σ social_fund_debit     (expenses)                                       (-)
```

---

## G. Seeding Strategy — Default Contribution Types + Social Fund

Two seed defaults per group, created **inside the same `withTransaction`** that creates Group/GroupSettings/BankBalance, so a group is never half-provisioned. There are **TWO** group-creation paths and **both** must be updated identically:

1. `controllers/groupController.js` → `createGroup` (self-serve onboarding wizard) — currently seeds Group, GroupMember, GroupSettings, BankBalance inside `session.withTransaction`.
2. `controllers/adminGroupsController.js` → `createGroup` (super-admin creates a group) — same seed block.

In each, **after** the `BankBalance.create([...], { session })` line, add:

```js
// Seed the social fund pot (starts at 0)
await SocialFundBalance.create([{ balance: 0, groupId: group._id }], { session });

// Seed the two default contribution types
await ContributionType.create([
  { groupId: group._id, name: 'Admin Fee',   affectsMainBalance: true,  isDefault: true, active: true },
  { groupId: group._id, name: 'Social Fund',  affectsMainBalance: false, isDefault: true, active: true },
], { session });
```
- Add the `require` for `SocialFundBalance` and `ContributionType` at the top of both controllers.
- `ContributionType.create([...], { session })` accepts an array → inserts both in one call within the transaction.
- **Backfill for existing groups:** write a one-off, idempotent script `scripts/seedContributionDefaults.js` that iterates all non-deleted Groups and, for any group missing a `SocialFundBalance` doc or the two default types, creates them. Use `findOneAndUpdate(..., { upsert: true })` / existence checks so re-running is safe. (Existing groups predate this feature and won't have these rows — onboarding seeding only covers new groups.)

---

## H. Test Cases To Write (do NOT implement yet)

Add to `mern_vb_backend/tests/`. Follow the existing Jest + Supertest style in `loanSavingsController.test.js`. Each test must assert BOTH the record row AND the resulting balance (the balance assertion is what catches the bugs this app has had before).

**Contribution recording**
1. **Happy path — main balance:** record a contribution of a type with `affectsMainBalance: true`. Assert: Contribution row created with `affectsMainBalance: true`, a `contribution` Transaction exists with matching `referenceId`, **main BankBalance increased by amount**, SocialFundBalance unchanged.
2. **Happy path — social fund:** record a contribution of a type with `affectsMainBalance: false`. Assert: `social_fund_credit` Transaction created, **SocialFundBalance increased by amount**, main BankBalance unchanged.
3. **Override toggle:** type default is `affectsMainBalance: true`, but request body sends `affectsMainBalance: false`. Assert: Contribution stored with `affectsMainBalance: false` and `overrodeDefault: true`, `social_fund_credit` Transaction, **SocialFundBalance** moved (not main).
4. **Session rollback:** force the balance update (or transaction log) to throw mid-flow (e.g. mock `updateBankBalance` to reject, or feed an invalid type after the row insert). Assert: **no Contribution row persisted, no Transaction persisted, no balance changed** — full rollback.

**Social fund expense**
5. **Happy path — expense reduces balance:** seed social fund to K1000, record a K300 expense. Assert: SocialFundExpense row (amount 300, positive), `social_fund_debit` Transaction, **SocialFundBalance = 700**, main BankBalance unchanged.
6. **Overspend guard:** social fund = K200, attempt K500 expense. Assert: 400 error, no expense row, no transaction, balance still K200.

**Permissions**
7. **Member cannot record a contribution:** `POST /api/contributions` as `member` → 403.
8. **Member cannot create a contribution type:** `POST /api/contribution-types` as `member` → 403.

**Group scoping (recommended extra)**
9. **Cross-group isolation:** group B's contributions/types/social-fund are never returned to group A; recording in A never moves B's balances.

**Seeding (recommended extra)**
10. **New group seeds defaults:** after `createGroup`, exactly two `isDefault` ContributionTypes ("Admin Fee" main=true, "Social Fund" main=false) and one zeroed `SocialFundBalance` exist for the group.

---

## I. Risks & Gotchas (mapped to this codebase's known history)

1. **Audit script will silently miscount the new types (HIGH — same class as the prior `'saving'` vs `'savings'` bug).**
   `scripts/auditBankBalance.js` has a `switch(type)` whose **`default` branch does `balanceEffect = amount`** — i.e. any unrecognized type is added to the main balance. The moment `social_fund_credit`/`social_fund_debit` transactions exist, the audit will fold them into the main pool and report a **false discrepancy**. Required edits:
   - Add `case 'contribution': balanceEffect = amount;` to the main-balance switch.
   - Add `case 'social_fund_credit': case 'social_fund_debit': balanceEffect = 0; break;` so they are explicitly excluded from the **main** balance.
   - Add a **separate** social-fund audit (new `scripts/auditSocialFund.js`) that sums `social_fund_credit` (+) and `social_fund_debit` (−) and compares to `SocialFundBalance`. (Also note: the existing audit uses `BankBalance.findOne()` with no `groupId` — it implicitly audits one group only; pre-existing limitation, out of scope here but worth flagging.)

2. **Non-atomic writes cause balance drift (HIGH — CLAUDE.md history #1).** Both flows MUST use `session.withTransaction`, and EVERY balance mutation MUST be accompanied by a `logTransaction` in the **same** session. Never call `updateBankBalance`/`updateSocialFundBalance` outside a session in these flows. Note: the existing `payout` and `payFine` handlers do NOT use sessions — do **not** copy those; copy `repayment`/`voidFine` instead.

3. **`Transaction.userId` is required (MEDIUM).** Social-fund expenses without a member beneficiary will violate the schema unless `userId` is set. Resolution in §B.2: set it to `beneficiaryMemberId || req.memberId`. Forgetting this throws inside the transaction → the whole expense rolls back (fails safe, but the route 500s). Cover with test #5/#6.

4. **Express 5 route ordering (MEDIUM — CLAUDE.md history #3).** In `routes/contributionTypes.js`, the static `POST /` and `GET /` must be declared before `PATCH /:id`. In `routes/socialFund.js`, `/balance` and `/expenses` are distinct static paths (no `:id` collision) — fine as written, but if a `/:id` route is added later it goes last.

5. **Override toggle must be stored resolved, not recomputed (MEDIUM).** Reports and the audit must rely on `Contribution.affectsMainBalance` (the value at record time), never re-derive it from the live ContributionType — the type's default may have been toggled since. This is why §A.2 denormalizes both `affectsMainBalance` and `typeName`. Same defensive reasoning as the `paid=false but paidAmount>0` corruption guard (history #7): the record must be internally consistent and self-describing.

6. **Type deactivation vs. historical records (LOW/MEDIUM).** Never hard-delete a ContributionType (would orphan `contributionTypeId` refs). PATCH only flips `active`. Recording validates `active: true`, so deactivated types can't receive new contributions but old rows remain valid and reportable via `typeName`.

7. **Social-fund expense role scope (LOW — judgment call).** Plan grants `POST /api/social-fund/expenses` to admin + treasurer only (loan_officer excluded, since loan officers handle loans/savings, not the social pot). If William wants loan officers to record expenses, add `'loan_officer'` to that route's `allowRoles`. Confirm before shipping.

8. **Do NOT add backend PDF/Excel routes (LOW — CLAUDE.md history #5).** Any contribution/social-fund report export is **frontend-only** (`src/lib/export.js`, jspdf/xlsx). Do not add backend export endpoints for this feature.

9. **No hardcoded financial values (process).** This feature introduces no interest/fine/limit numbers, so there's nothing to read from GroupSettings — but the verification loop's "no hardcoded financial values" check still applies: amounts come from `req.body`, routing comes from ContributionType, nothing magic-numbered.

---

## J. Frontend Components (LIST ONLY — Sonnet builds these)

**Pages to update**
- `pages/Dashboard.jsx` — add a **Social Fund Balance** stat card next to the existing Bank Balance card (fetch `GET /api/social-fund/balance` alongside the current `Promise.all`); make the main Bank Balance card's label explicit ("Lending Pool"/"Bank Balance") to disambiguate the two pots.
- `pages/OperationsPage.jsx` — add "Record Contribution" and "Record Social Fund Expense" actions (this is where savings/fines/payments recording lives).
- `pages/Settings.jsx` (+ `components/settings/`) — add a **Contribution Types** management panel (list, add custom type, toggle active, set default routing).
- `pages/Reports.jsx` — add Contributions and Social Fund ledger sections; export via existing `src/lib/export.js`.

**New components**
- `RecordContributionModal` — react-hook-form + Zod; member select, type select (from `GET /api/contribution-types?active=true`), amount, optional note, and the **affectsMainBalance override toggle** (pre-filled from the chosen type's default, editable).
- `RecordSocialFundExpenseModal` — react-hook-form + Zod; amount, category, description, optional beneficiary (member picker or free-text name).
- `ContributionTypesManager` — settings panel: list + add + rename + active toggle.
- `ContributionsList` / `ContributionsTable` — list view (members see only their own, matching backend scoping).
- `SocialFundLedger` — combined credits + expenses history with running balance.
- `SocialFundBalanceCard` — dashboard stat card.

**Cross-component refresh**
- Reuse the existing global-event pattern: after a successful contribution or expense, `window.dispatchEvent(new Event('loanDataChanged'))` (or a new `contributionsChanged` event) so Dashboard/Reports refetch — same mechanism the loans flow uses.

**API access**
- All calls go through `axios` with `API_BASE_URL` from `src/lib/utils.js` (Clerk token is injected by the existing axios/auth setup in `store/auth.jsx`). No new client config needed.

---

This plan is complete and self-contained for a fresh Sonnet session.
