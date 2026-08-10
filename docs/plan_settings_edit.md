# Plan — Settings Page Edit Functionality
**Sprint:** Chama360 Session 2 — April 23, 2026
**Author:** Opus 4.7 planning session
**For execution by:** Fresh Sonnet session
**Scope:** Wire the Edit buttons on the `/settings` page for two cards only — Group Profile and Financial Rules. Admin-only.

---

## 1. Audit Summary (read before writing any code)

### 1a. Settings page component
- Path: `mern-vb-frontend/src/pages/Settings.jsx`
- Currently renders five cards: Group Profile, Financial Rules, Fine Rules, Member Roles, Billing, Danger Zone.
- `SectionCard` helper on lines 8–21 renders a hardcoded Edit button with **no onClick handler** on all three of the first three cards. The Edit buttons are non-functional today.
- Data fetched from `GET /api/group-settings` on mount.

### 1b. Backend route — already exists, reuse it
- Route: `PUT /api/group-settings`
- File: `mern_vb_backend/routes/groupSettings.js:19`
- Middleware chain: `verifyToken` → `resolveGroup` → `checkTrial` → `allowRoles('admin')`
- Controller: `mern_vb_backend/controllers/groupSettingsController.js:27` (`updateGroupSettings`)
- Allowed fields include everything this sprint needs: `groupName`, `meetingDay`, `cycleLengthMonths`, `interestRate`, `interestMethod`, `loanLimitMultiplier`, `profitSharingMethod`.
- **No backend changes are required.** Do NOT create `PUT /api/settings/profile` or `PUT /api/settings/financial`. The combined route already handles all sprint fields — send only the fields being edited.

### 1c. Schema constraints (from `mern_vb_backend/models/GroupSettings.js`)
These bound the frontend validation:
- `cycleLengthMonths`: enum `[6, 12]` only — **no 3-month option exists in the schema.**
  - User prompt mentioned "3 months / 6 months / 12 months". **Do not offer 3** — a submit of `3` would fail Mongoose enum validation and the PUT would 500. Cycle Length select offers only 6 and 12.
- `interestRate`: min 1, max 50.
  - User prompt said 0–100. Use min=1, max=50 in the form validation to match the schema. A submit of 0 or 101 would fail validation.
- `interestMethod`: enum `['reducing', 'flat']`.
- `loanLimitMultiplier`: min 1, max 10.
- `profitSharingMethod`: enum `['proportional', 'equal']` — these are the only two options. Do not invent others.
- `groupName`: required string, no max. Enforce max 60 chars client-side per the user prompt.
- `meetingDay`: free string, default null. Frontend offers a fixed list of options.

### 1d. Shared primitives already available (reuse, do not recreate)
- **SlideoverDrawer:** `mern-vb-frontend/src/components/ui/SlideoverDrawer.jsx` — props: `{ open, onClose, title, children, footer }`. Handles ESC, body scroll lock, backdrop click, desktop right-slide + mobile bottom-sheet responsive behaviour. The built-in footer already renders a centred "Cancel" link below `footer`, so `footer` should contain only the Save button (not Save + Cancel).
- **Toast:** `sonner` is wired app-wide. Import: `import { toast } from 'sonner';`. Use `toast.success('Settings updated')` on success and `toast.error(msg)` on failure.
- **Auth / role:** `import { useAuth } from '../store/auth';` — returns `{ user }` where `user.role` is one of `'admin' | 'treasurer' | 'loan_officer' | 'member'`. Same pattern used in `App.jsx:79–84` (`RoleRoute`).
- **API base URL:** `import { API_BASE_URL } from '../lib/utils';`.
- **Axios:** Clerk token is injected automatically by an interceptor in `store/auth.jsx:22–30`. Call `axios.put(\`${API_BASE_URL}/group-settings\`, payload)` directly — no manual auth header needed.

### 1e. Out of scope — do not touch
- `mern_vb_backend/controllers/adminGroupSettingsController.js` — this is the Super Admin settings editor (`PATCH /api/admin/groups/:groupId/settings`). Leave untouched.
- Fine Rules card, Member Roles card, Billing card, Danger Zone, onboarding wizard.
- Currency field — stays read-only, hardcoded "ZMW (Zambian Kwacha)" display.

---

## 2. Deliverables

| # | File | Action |
|---|---|---|
| D1 | `mern-vb-frontend/src/components/settings/GroupProfileDrawer.jsx` | Create new |
| D2 | `mern-vb-frontend/src/components/settings/FinancialRulesDrawer.jsx` | Create new |
| D3 | `mern-vb-frontend/src/pages/Settings.jsx` | Modify — refactor SectionCard, wire drawers, role-gate |

No backend files, no new hooks, no new utilities. The existing `useAuth`, `SlideoverDrawer`, `API_BASE_URL`, and `sonner` cover every need.

---

## 3. Step-by-step implementation

### Step 1 — Create `GroupProfileDrawer.jsx` (D1)

**Path:** `mern-vb-frontend/src/components/settings/GroupProfileDrawer.jsx` (create the `settings/` subdirectory).

**Purpose:** Controlled drawer component. Renders form fields for Group Profile. On submit, PUTs only the Group Profile fields to `/api/group-settings` and calls `onSaved(updatedSettings)`.

**Props:**
```
open          boolean
onClose       () => void
onSaved       (updatedSettings) => void    // parent updates displayed values without full re-fetch
settings      { groupName, meetingDay, cycleLengthMonths }   // initial values, may be null briefly
```

**Form fields and validation rules:**
| Field | Input type | Validation | Notes |
|---|---|---|---|
| Group Name | text input | required, trimmed length 1–60 | `name="groupName"` |
| Meeting Day | `<select>` | required | Options: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday, Not set. Map "Not set" to `null` when submitting. |
| Cycle Length | `<select>` | required | Options only: `6` → "6 months", `12` → "12 months". **Do NOT include 3 months** — schema enum rejects it. |
| Currency | static text | read-only | Display "ZMW (Zambian Kwacha)" as plain text, no input. Do not include in submitted payload. |

**Behaviour:**
1. Use local `useState` for form values. Initialise from `settings` prop; re-sync with a `useEffect` that runs when `settings` changes or `open` flips to true (pre-populate on every open).
2. Track `saving` (boolean) and `error` (string | null) in local state.
3. On submit:
   - Trim `groupName`. If empty or length > 60, set inline `error` and abort.
   - Build payload: `{ groupName, meetingDay: meetingDay === 'Not set' ? null : meetingDay, cycleLengthMonths: Number(cycleLengthMonths) }`.
   - `setSaving(true); setError(null);`
   - `await axios.put(\`${API_BASE_URL}/group-settings\`, payload)` — response shape is `{ message, settings }`.
   - On success: `toast.success('Group profile updated')`, `onSaved(res.data.settings)`, `onClose()`.
   - On error: `setError(err?.response?.data?.error || 'Failed to update. Please try again.')`. Do NOT close the drawer. Do NOT toast on error — use the inline error banner so the user keeps their typed values.
   - `finally { setSaving(false); }`
4. Cancel link (provided automatically by `SlideoverDrawer` footer) closes without saving.

**Styling — use UI_SPEC tokens only:**
- Labels: `text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5`.
- Inputs/selects: `w-full border border-border-default rounded-md px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary`. (Match the pattern already used in `components/ui/AddFineModal.jsx`.)
- Error banner (when `error` is set): `bg-status-overdue-bg border border-status-overdue-text/30 text-status-overdue-text text-sm rounded-md px-3 py-2 mb-4`.
- Fields stacked vertically with 16px gap (`space-y-4`).
- Read-only Currency row: label above, value in `text-sm text-text-muted` (muted because non-editable).

**Footer (Save button only — `SlideoverDrawer` adds the Cancel link):**
```jsx
<button
  type="submit"
  form="group-profile-form"
  disabled={saving}
  className="w-full bg-brand-primary hover:bg-brand-hover text-white font-semibold rounded-md px-5 py-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
>
  {saving ? 'Saving…' : 'Save Changes'}
</button>
```
Wrap the fields in `<form id="group-profile-form" onSubmit={handleSubmit}>` so the footer button submits.

**Outer shell:**
```jsx
<SlideoverDrawer
  open={open}
  onClose={onClose}
  title="Edit Group Profile"
  footer={<SaveButton />}
>
  {/* form with fields */}
</SlideoverDrawer>
```

### Step 2 — Create `FinancialRulesDrawer.jsx` (D2)

**Path:** `mern-vb-frontend/src/components/settings/FinancialRulesDrawer.jsx`.

**Purpose:** Same pattern as Step 1, for Financial Rules fields.

**Props:**
```
open        boolean
onClose     () => void
onSaved     (updatedSettings) => void
settings    { interestRate, interestMethod, loanLimitMultiplier, profitSharingMethod }
```

**Form fields and validation:**
| Field | Input type | Validation | Notes |
|---|---|---|---|
| Interest Rate | number input, step 0.1 | required, min 1, max 50 | Suffix label "%" rendered after the input (not inside). Matches schema (`min: 1, max: 50`). |
| Interest Method | `<select>` | required | Options: `flat` → "Flat Rate", `reducing` → "Reducing Balance". |
| Loan Limit Multiplier | number input, step 1 | required, min 1, max 10 | Helper text below input: "e.g. 3 means members can borrow up to 3× their savings." |
| Profit Sharing Method | `<select>` | required | Options only: `proportional` → "Proportional (by savings)", `equal` → "Equal split". **Do not invent other options** — schema enum rejects them. |

**Behaviour:**
1. Identical lifecycle + submit pattern as Step 1: pre-populate on open, local `saving`/`error` state, PUT to `/api/group-settings` with **only these four fields** in the payload, toast on success, inline error on failure, close on success only.
2. Coerce number inputs to `Number()` before sending (HTML number inputs return strings).
3. Client-side validation before PUT:
   - `interestRate < 1 || interestRate > 50` → inline error "Interest rate must be between 1 and 50%."
   - `loanLimitMultiplier < 1 || loanLimitMultiplier > 10` → "Multiplier must be between 1 and 10."

**Styling:** Same tokens as Step 1. Drawer title: `"Edit Financial Rules"`.

### Step 3 — Update `Settings.jsx` (D3)

**Path:** `mern-vb-frontend/src/pages/Settings.jsx`.

**Changes required (in order):**

**3a.** Add imports at top of file:
```js
import { useAuth } from '../store/auth';
import GroupProfileDrawer from '../components/settings/GroupProfileDrawer';
import FinancialRulesDrawer from '../components/settings/FinancialRulesDrawer';
```

**3b.** Refactor `SectionCard` (lines 8–21) to accept an optional `onEdit` prop. Render the Edit button **only when `onEdit` is truthy**. This removes the dead Edit button from the Fine Rules card as a side effect (intended — keeps the UI honest; Fine Rules editing is out of scope for this sprint).

Replacement:
```jsx
function SectionCard({ title, onEdit, children }) {
  return (
    <div className="bg-surface-card rounded-lg p-6">
      <div className="flex items-center justify-between border-b border-border-default pb-3 mb-5">
        <h2 className="text-xl font-bold text-text-primary">{title}</h2>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary border border-border-default rounded-full px-3 py-1.5 hover:bg-surface-page transition-colors"
          >
            <Pencil size={13} />
            Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
```

**3c.** In the `Settings` component body, just below the existing `const [loading, setLoading] = useState(true);`, add:
```js
const { user } = useAuth();
const isAdmin = user?.role === 'admin';
const [profileOpen, setProfileOpen] = useState(false);
const [financialOpen, setFinancialOpen] = useState(false);
```

**3d.** Wire the two in-scope Edit buttons. Change the Group Profile `<SectionCard>`:
```jsx
<SectionCard
  title="Group Profile"
  onEdit={isAdmin ? () => setProfileOpen(true) : undefined}
>
```
And the Financial Rules `<SectionCard>`:
```jsx
<SectionCard
  title="Financial Rules"
  onEdit={isAdmin ? () => setFinancialOpen(true) : undefined}
>
```
Fine Rules `<SectionCard>` gets **no `onEdit` prop** — its Edit button disappears, which is the desired behaviour for this sprint.

**3e.** Render both drawers at the bottom of the returned JSX (just before the closing `</div>` of the outer wrapper):
```jsx
<GroupProfileDrawer
  open={profileOpen}
  onClose={() => setProfileOpen(false)}
  onSaved={(updated) => setSettings(updated)}
  settings={settings}
/>
<FinancialRulesDrawer
  open={financialOpen}
  onClose={() => setFinancialOpen(false)}
  onSaved={(updated) => setSettings(updated)}
  settings={settings}
/>
```

**3f.** Do NOT change the existing `useEffect` fetch, the `Field` helper, the Fine Rules / Member Roles / Billing / Danger Zone cards, or the "ZMW (Zambian Kwacha)" display. They stay as-is.

### Step 4 — Role gating verification

Task 4 is satisfied entirely by Step 3c + 3d: passing `undefined` as `onEdit` when the user is not admin suppresses the Edit button inside `SectionCard` (which only renders the button when `onEdit` is truthy). No hiding via CSS, no disabled state — the button is not rendered at all for non-admin roles, matching the "hidden (not just disabled)" requirement in the sprint prompt.

Server-side, the PUT route is already gated by `allowRoles('admin')` (`routes/groupSettings.js:19`), so even if a non-admin somehow triggered the call, it would 403. Frontend gating here is for UX only; the backend is already safe.

### Step 5 — Styling audit before commit

Before declaring done, grep the two new drawer files for raw Tailwind colour classes (per UI_SPEC §12):
```bash
grep -nE "\\b(blue|red|green|yellow|gray|slate|zinc|neutral|stone)-[0-9]" \
  mern-vb-frontend/src/components/settings/GroupProfileDrawer.jsx \
  mern-vb-frontend/src/components/settings/FinancialRulesDrawer.jsx
```
Must return zero matches. Only design-token classes (`brand-*`, `surface-*`, `text-primary|secondary|muted|brand`, `border-default`, `status-*`, `trial-*`, `amount-*`) are allowed.

### Step 6 — Verification loop (per CLAUDE.md §Verification Loop)

Frontend-only change — run in order:
1. `cd mern-vb-frontend && pnpm test` — must pass.
2. `grep -rn "console.log" mern-vb-frontend/src/components/settings mern-vb-frontend/src/pages/Settings.jsx` — must return zero matches.
3. No financial logic was touched, so skip the balance audit script.
4. Hardcoded financial values check: the two drawers read current values from the `settings` prop and send them back to the server. No hardcoded rates, multipliers, or amounts appear in either drawer. Confirm by inspection.
5. Manual browser check (golden path):
   - Log in as admin → `/settings` → both Edit buttons visible → open Group Profile drawer → values pre-populated → change Meeting Day → Save → toast appears → drawer closes → displayed value updates without a full page reload.
   - Repeat for Financial Rules.
   - Log in as a non-admin role (e.g. treasurer) → `/settings` → both Edit buttons absent.
6. Report the result in the format specified in CLAUDE.md §Verification Loop Step 5.

---

## 4. Things NOT to do in this sprint (explicit guard list)

- **Do not** create `PUT /api/settings/profile` or `PUT /api/settings/financial`. Reuse `PUT /api/group-settings`.
- **Do not** modify `mern_vb_backend/models/GroupSettings.js` to add a 3-month cycle option. The schema enum is out of scope; the dropdown will only offer 6 and 12.
- **Do not** change `mern_vb_backend/controllers/groupSettingsController.js` — it already accepts every field this sprint needs.
- **Do not** touch `adminGroupSettingsController.js` or any file under `pages/admin/`. The Super Admin settings editor is separate and already built.
- **Do not** make Currency editable.
- **Do not** wire an Edit button on the Fine Rules card. Removing the dead button (via the `SectionCard` refactor) is correct — fine-rule editing is explicitly out of scope.
- **Do not** introduce `react-hook-form` or `zod` here. The existing modals use plain `useState` + manual validation; match that pattern to avoid yak-shaving.
- **Do not** add optimistic updates that mutate on failure — the success path updates via `onSaved(res.data.settings)` only after the PUT resolves.
- **Do not** auto-close the drawer while the PUT is in flight, or on error.
- **Do not** add backwards-compat shims, removed-code comments, or feature flags.

---

## 5. Open notes for the executing Sonnet session

- If `settings` is still `null` when the admin clicks Edit (e.g. the initial fetch is still loading), the drawer's `useEffect` pre-populate will see `null` and fall back to empty strings — which fails validation and prevents submit. Acceptable: the Edit button is visible only after loading resolves (the current page already hides the cards behind the `loading` spinner on line 56–58), so this race cannot occur in practice. Do not add extra guards for it.
- The existing `window.dispatchEvent(new Event('loanDataChanged'))` global-event pattern is for loan pages. **Do not** emit a similar event for settings — `onSaved` → local state update is sufficient; no other page in the app consumes group-settings changes.
- Commit message style (per `feedback_commits` memory): conventional commit, no Co-Authored-By line. Suggested: `feat(settings): wire group profile and financial rules edit drawers`.

---

Is this plan self-contained for a fresh Sonnet session?
