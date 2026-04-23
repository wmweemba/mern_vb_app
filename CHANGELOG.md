# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.5.9] - 2026-04-23

### Fixed
- **Mobile sign-in — nested Clerk card chrome (Chrome + Safari)**: neutralised Clerk's card background at the `variables` level (`colorBackground: 'transparent'`, `shadowShimmer: 'transparent'`, `colorShimmer: 'transparent'`) rather than only at the `elements` level. Variables are applied before Clerk renders its internal DOM, making this reliable across Chrome and Safari mobile where `elements` overrides were being ignored. Also added `colorInputBackground: '#ffffff'` and `colorInputText: '#1E1A16'` to keep input fields legible against the now-transparent card background.
- **Mobile sign-in — Safari iOS grey input background**: added a scoped `<style>` tag in `SignInPage.jsx` setting `-webkit-appearance: none` and `background-color: #ffffff !important` on email/text/password inputs to override Safari's default grey system fill.
- Desktop layout (`lg:` and above) is unchanged.

---

## [3.5.8] - 2026-04-23

### Fixed
- **Mobile sign-in card position**: moved card `top` from `25%` to `28%` so the top edge sits inside the dark brown zone and the card body straddles the brown/white boundary as intended.
- **Clerk form card chrome on mobile**: switched `mobileClerkAppearance.elements` from Tailwind className strings to CSS object syntax (`{ boxShadow: 'none', border: 'none', padding: '0', ... }`). Clerk was ignoring the className overrides and rendering its own card shell beneath the copy block. Object-style overrides suppress the nested chrome so the entire page — eyebrow, headline, subtext, and form — sits inside one seamless card.
- **Testimonial row visibility on mobile**: adjusted `bottom` from `24px` to `20px`; the outer container (`min-h-screen relative overflow-hidden`) was already correctly established as the containing block.

---

## [3.5.7] - 2026-04-23

### Changed
- **Sign-in page — responsive breakpoint**: shifted from `md` (768px) to `lg` (1024px). Large tablets in landscape (iPad Pro, etc.) now receive the full two-column desktop split-screen layout instead of the mobile view.
- **Sign-in page — mobile layout redesign** (below 1024px): replaced the single-column form with a layered full-viewport design:
  - Split background — top 42% `#1E1A16` dark brown, bottom 58% white.
  - Two decorative orange circles (`#C8501A`) positioned top-left (130×130px, opacity 0.9) and top-right (80×80px, opacity 0.5), clipped at screen edges.
  - "Chama360" wordmark anchored top-left in `#F0EDE8`.
  - Floating white card (88% wide, `border-radius: 16px`, soft shadow) straddling the colour boundary — roughly top third in the dark zone, bottom two thirds in white. Card contains the eyebrow label, headline, descriptor, and the Clerk `<SignIn />` form with brand-orange primary colour.
  - Testimonial row pinned to the bottom of the screen: William M. avatar, italic quote, attribution.
- Desktop layout (`lg` and above) is visually identical to 3.5.6 — only the breakpoint prefix changed.

---

## [3.5.6] - 2026-04-23

### Added
- **Custom branded sign-in page**: replaced the minimal Clerk `<SignIn />` wrapper with a two-column layout. Left panel (desktop only): dark `#1E1A16` background, decorative orange circles, "Chama360" wordmark, and a treasurer testimonial with avatar. Right panel: "Free 15-day trial" eyebrow, value-proposition headline, descriptor copy, and the Clerk form styled with brand orange (`#C8501A`) as the primary colour, no card chrome, and `font-family: inherit` (DM Sans).
- **`ClerkProvider` redirect props**: added `signInUrl="/sign-in"`, `signUpUrl="/sign-in"`, and `afterSignOutUrl="/sign-in"` to the provider in `main.jsx`. Ensures Clerk-initiated sign-outs (session expiry, etc.) redirect to `/sign-in` rather than `accounts.clerk.com`.

### Changed
- `src/pages/SignIn.jsx`: full rewrite — two-column branded layout replacing the centred wrapper. Default export name (`SignInPage`) and routing props unchanged.
- `src/main.jsx`: `<ClerkProvider>` receives three additional URL props; no other changes.

---

## [3.5.5] - 2026-04-23

### Added
- **Settings page — Group Profile edit**: admin users now see a functional Edit button on the Group Profile card. Clicking opens a slideover drawer (`GroupProfileDrawer`) pre-populated with current values. Fields: Group Name (required, max 60 chars), Meeting Day (Mon–Sun or Not set), Cycle Length (6 or 12 months only). Currency remains read-only. On save, PUTs to the existing `PUT /api/group-settings` route; displayed values update immediately without a page reload. Non-admin roles see no Edit button.
- **Settings page — Financial Rules edit**: same pattern for the Financial Rules card (`FinancialRulesDrawer`). Fields: Interest Rate (1–50%), Interest Method (Flat Rate / Reducing Balance), Loan Limit Multiplier (1–10×), Profit Sharing Method (Proportional / Equal split). Client-side validation matches schema constraints before submitting.
- Both drawers use the existing `SlideoverDrawer`, `sonner` toast, and `PUT /api/group-settings` — no new backend routes or utilities added.

### Changed
- **`SectionCard` in `Settings.jsx`**: refactored to accept an optional `onEdit` prop. The Edit button renders only when `onEdit` is provided, removing the previously non-functional dead Edit button from the Fine Rules card as a side effect.

---

## [3.5.4] - 2026-04-23

### Fixed
- **Clerk load failure no longer hangs the app**: added `onLoadError` handler to `ClerkProvider` and a missing-key guard in `main.jsx`. If Clerk's JS times out (e.g. CDN unreachable, invalid key, or domain not authorised in the Clerk dashboard), the app now shows a descriptive error screen with a Retry button instead of an infinite loading spinner.

---

## [3.5.3] - 2026-04-23

### Added
- **`isVerified` field on `GroupMember`**: tracks whether a member has signed up through Clerk. `true` = has a Clerk account; `false` = legacy/manually-added record awaiting signup. Backfilled on all 22 existing records based on presence of `clerkUserId`.
- **"Pending" badge on Members page**: admin, treasurer, and loan_officer roles now see an amber "Pending" badge next to the name of any member who has not yet created a Clerk account. Regular members see no badge.
- **Re-invite support for unverified members**: `POST /api/invites/email` now allows re-inviting members whose `isVerified` is `false`. Previously any existing GroupMember record blocked the invite with a 409. Verified members are still blocked.
- **Webhook links legacy records on signup**: `user.created` webhook now detects an existing unverified record for the same email+group and updates it (`clerkUserId`, `isVerified: true`) instead of creating a duplicate. New signups with no legacy record still create a fresh GroupMember as before.

### Fixed
- **Role and Clerk ID mismatch for William**: William's GroupMember record carried the dev-environment Clerk ID and was set to `loan_officer`. Fixed via `scripts/fixRolesSession1.js`: updated `clerkUserId` to the production ID, promoted role to `admin`, and set `Group.clerkAdminId` to the correct production value.
- **`admin@vb.com` placeholder GroupMember removed**: the seed account that held the `admin` role in William's group has been hard-deleted from production.

---

## [3.5.2] - 2026-04-23

### Fixed
- **`requireRole` middleware now accepts an array of roles**: previously only matched a single role string. Super admins now bypass the role check entirely. No existing single-role usages are affected.
- **`GET /api/users` accessible to treasurer and loan_officer**: was restricted to `admin` only, so treasurer and loan_officer got a 403 when the Members page loaded. Updated to allow `['admin', 'treasurer', 'loan_officer']`.

---

## [3.5.1] - 2026-04-22

### Fixed
- **Members page showing 0 active members**: `MembersPage` was fetching `GET /api/invites` (the legacy InviteToken list) instead of `GET /api/users` (the GroupMember list). Active members created via the webhook-based email invite flow were never shown. Fixed by pointing the members fetch to the correct `/users` endpoint.
- **"Begin New Cycle" banner visible to members**: The banner was rendered with `isVisible={true}` hardcoded, so all roles — including read-only members — saw the cycle management prompt. Now only shown to `admin`, `treasurer`, and `loan_officer` roles.

---

## [3.5.0] - 2026-04-21

### Fixed
- **Member invite 404 on chama360.nxhub.online**: clicking the invite email link returned a bare nginx 404 because the Coolify static deployment was not configured for SPA routing. Fix: enabled the "Is it a SPA?" toggle in Coolify (adds `try_files $uri $uri/ /index.html` to nginx) and added `public/_redirects` (`/* /index.html 200`) as a belt-and-suspenders fallback copied into `dist/` at build time.

### Fixed (PWA)
- **PWA manifest app name**: was still "Village Banking App" / "VB App" — updated to "Chama360" throughout.
- **PWA manifest icon paths**: manifest referenced `icon-192x192.png` / `icon-512x512.png` which do not exist; corrected to the SVG files that are actually present (`image/svg+xml`, `.svg` paths). Separate `any` and `maskable` entries added for the 512×512 icon per the W3C manifest spec.
- **PWA theme and background colors**: were hardcoded to `#2979FF` (old blue). Updated to `#C8501A` (brand orange) for `theme_color` and `#F0EDE8` (brand warm beige) for `background_color`.
- **Workbox API cache URL**: `urlPattern` was a placeholder (`your-api-domain.com`) so API responses were never cached. Now derived from `VITE_API_URL` at build time via `loadEnv`, so the correct origin is baked into the service worker in each environment.
- **PWA SPA routing for installed app**: added `navigateFallback: '/index.html'` and `navigateFallbackDenylist: [/^\/api\//]` to the Workbox config. Without this, navigating to any route other than `/` inside the installed PWA would fail when the service worker intercepted the request.
- **PWA asset precaching**: added `includeAssets: ['favicon.svg', 'favicon.ico']` so the favicon is included in the Workbox precache manifest.

---

## [3.4.0] - 2026-04-19

### Added
- **Platform Admin (Super Admin) mode**: super admins now have a dedicated "Platform Admin" UI accessible via the avatar dropdown ("Switch to Platform Admin"). A separate sidebar, mobile bottom nav, and route namespace (`/admin/*`) keep the admin view completely separate from the group view.
  - `/admin` — Overview dashboard with stat cards (total groups, active trials, paid groups, expiring this week, MRR estimate) and recent audit activity.
  - `/admin/groups` — Full groups list with search, status filter pills (Trial / Paid / Expired / Suspended / Deleted), desktop table + mobile cards, and quick actions (Billing, Suspend, Delete, Restore).
  - `/admin/groups/:id` — Group detail with six tabs: Overview, Members, Settings, Billing, Danger Zone, Activity.
  - `/admin/super-admins` — Manage super admin access; invite by email, revoke, view pending invites.
  - `/admin/audit` — Paginated audit log with group/actor filters and metadata expansion.
  - `/admin/accept-invite` — Token-based super admin promotion flow.
- **Soft delete + suspend for groups**: groups can be suspended (with reason) or soft-deleted (`deletedAt`). Suspended/deleted groups return `GROUP_SUSPENDED` / `GROUP_DELETED` 403 to regular members. Restore available via admin UI.
- **Soft delete for group members**: members can be removed (`deletedAt`) by super admins without destroying data. Restore available.
- **Admin audit log**: every state-changing admin action (group update, billing activate, member remove, super admin revoke, etc.) is written to `AdminAuditLog` with actor, action, target, and before/after metadata snapshot.
- **Super admin invite flow**: super admins can invite others by email via Resend. One-time-use token, 48h expiry, same pattern as `InviteToken`.
- **Billing management**: activate/extend paid status with plan select (Starter ZMW 150 / Standard ZMW 250), duration in months, or custom `paidUntil` date. Extend policy: `max(today, existing paidUntil) + duration`. Mark-unpaid action also available.
- **Group settings editing**: super admins can edit any group's `GroupSettings` (interest rate, method, fine rules, savings rules, profit sharing) directly from the admin UI.
- **Group creation**: super admins can create groups manually (name, admin name/email, trial days) from the admin UI with default settings seeded automatically.
- **`TypedConfirmationModal`**: reusable confirmation modal requiring the user to type a specific word before a destructive action is enabled. Used for group delete and member remove.
- **`BillingActivationDrawer`**: slideover drawer for activating/extending billing with live `paidUntil` preview.
- **New backend models**: `SuperAdminInvite`, `AdminAuditLog`.
- **`requireSuperAdmin` middleware**: gates all `/api/admin/*` routes; attaches `req.superAdmin` for downstream use.
- **New favicon and PWA icons**: replaced the legacy blue bank-building icon with a modern orange Chama360 "C" mark on a gradient rounded square, consistent with the brand palette across `favicon.svg`, `icon-192x192.svg`, and `icon-512x512.svg`.

### Fixed
- **Member invite emails not sending**: `onboarding@resend.dev` is Resend's shared test sender and only delivers to the Resend account owner. Switched all email senders to `noreply@mynexusgroup.com` (the verified Resend domain). `RESEND_FROM_EMAIL` env var overrides the default in all controllers. Email failure now returns a 201 with `warning` + `signUpUrl` instead of a 500, so the admin receives the sign-up link to share manually.
- **`resolveGroup` middleware**: now checks `revokedAt: null` on the `SuperAdmin` lookup so revoked super admins cannot pass through as regular members. Also rejects requests from members of deleted or suspended groups before hitting any controller.
- **`GroupMember` queries**: added `deletedAt: null` filter to `userController.getUsers` and `thresholdController` member lookups so soft-deleted members are excluded from group-facing endpoints.

### Added (backend scripts)
- `scripts/testResend.js`: runs a live Resend send from the Coolify terminal; prints the exact error with actionable fix hints.
- `POST /api/admin/test-email?to=email`: super-admin HTTP endpoint for the same diagnostic without needing terminal access.

---

## [3.2.0] - 2026-04-18

### Added
- **Operations page** (`/operations`): dedicated page accessible from the desktop sidebar for admin, treasurer, and loan_officer roles. Cards are grouped into three sections — Payments, Fines, and Administration — and only cards the current user has permission to use are shown.
  - Payments: Record Loan Repayment, Record Payout
  - Fines: Issue Fine / Penalty, Record Fine Payment, View & Manage Fines
  - Administration: Manage Bank Balance (admin/treasurer), Begin New Cycle (admin only), Edit Savings Entry
- **Operations in desktop sidebar**: "Operations" nav item (Zap icon) added between Reports and Settings, hidden from member role.
- **Mobile action sheet expanded**: added Record Payout and Begin New Cycle to the `+` action sheet; each item is now filtered by its own role list rather than a blanket `canAccessOperations` check, so treasurer no longer sees admin-only items.

### Fixed
- **Modal UI restyle**: `ManagePaymentModal`, `AddFineModal`, `ManageBankBalanceModal`, and `BeginNewCycleModal` were using old hardcoded Tailwind colours (blue-600, red-600, green-600, amber-50, etc.) that did not match the v3.1.0 design system. All four modals now use brand-primary buttons, spec-compliant inputs (border-border-default, rounded-md, focus:ring-brand-primary), uppercase tracking labels, and status-correct alert colours from UI_SPEC.md.
- **ManagePaymentModal tab style**: payment type tabs (Loan Payment / Payout / Fine Payment) replaced with pill-style toggle using brand-primary active state instead of coloured background per tab.
- **BeginNewCycleModal alert colours**: warning box now uses status-overdue palette, info box uses brand-light/brand-primary, caution box uses amber spec colours. Spinner and success state updated to match.
- **ManagePaymentModal `initialType` prop**: modal now accepts an `initialType` prop so opening it from the Operations page pre-selects the correct tab (repayment, payout, or fine) without requiring the user to switch manually.

---

## [3.1.5] - 2026-04-14

### Fixed
- **Frontend env var**: `VITE_API_URL` in the Coolify frontend service was set to `https://api.chama360.nxhub.online` (missing the `/api` suffix). All API calls were hitting `https://api.chama360.nxhub.online/savings/dashboard` etc. — 404s because Express mounts all routes under `/api/`. The `auth/me` call failed silently (non-NO_GROUP error), so `trialActive` stayed at its React initial value of `true` and the dashboard showed "Failed to load dashboard stats". Fix: set `VITE_API_URL=https://api.chama360.nxhub.online/api` in Coolify frontend env vars and redeploy the frontend to rebuild the bundle with the corrected value.

---

## [3.1.4] - 2026-04-14

### Fixed
- `controllers/billingController.js`: same lazy-init Resend fix as inviteController. `new Resend()` was at module level (line 6); moved inside `requestUpgrade` function body inside the `if (RESEND_API_KEY && ADMIN_EMAIL)` guard. An empty or absent `RESEND_API_KEY` previously crashed the server on startup since `billingRoutes` is required synchronously in `server.js`.

### Added
- `scripts/diagnoseProd.js` (new): production DB health-check script. Verifies SuperAdmin record, GroupMember record, and Group document for a given Clerk user ID. Shows exact fix commands if any record is missing or misconfigured. Run with `CLERK_USER_ID=user_xxx node scripts/diagnoseProd.js` via Coolify terminal.

---

## [3.1.3] - 2026-04-14

### Fixed
- `controllers/inviteController.js`: moved `new Resend()` from module-level initialisation into the `inviteByEmail` function body. Previously, a missing `RESEND_API_KEY` env var caused the constructor to throw at require-time, crashing the server on every startup before it could bind to a port.

---

## [3.1.2] - 2026-04-14 — Production Deployment

### Deployed
- Backend deployed to Coolify at `https://api.chama360.nxhub.online` (Node.js / Express, nixpacks build)
- Frontend deployed to Coolify at `https://chama360.nxhub.online` (Vite static build served via Caddy)
- Database: MongoDB Atlas (production cluster)
- Auth: Clerk (production keys — dev keys retired)
- Deployment platform: Coolify (self-hosted, `main` branch, commit `079bbacc`)

---

## [3.1.2] - 2026-04-12

### Fixed
- `components/TrialBanner.jsx`: added `isSuperAdmin` check to the early-return guard. Previously setting `trialActive(false)` for super admins (v3.1.1 fix) caused the top trial banner to render for them — since the banner shows when `trialActive === false`. Super admins now bypass both the sidebar trial card and the top banner.

---

## [3.1.1] - 2026-04-12

### Fixed

**Trial banner showing for super admin**
- `store/auth.jsx`: super admin branch in both `useEffect` and `refreshMembership` now calls `setTrialActive(false)`. Previously `trialActive` was never set in the super admin path, so it stayed at its initial value of `true`, causing the trial card to appear in the sidebar.
- `components/layout/DesktopSidebar.jsx`: added `!isSuperAdmin` guard to the trial card render condition as belt-and-suspenders.

**Member invite email not sending**
- Root cause: the app runs on Clerk development keys. Clerk's invitation API (`POST /v1/invitations`) creates the invite record (explaining why it appeared in Pending Invites) but does not dispatch real emails in dev mode — they only appear in the Clerk dashboard.
- `controllers/inviteController.js`: removed the Clerk invitation API call entirely. Invite emails are now sent directly via Resend (already installed and confirmed working). Email includes the invitee's name, group name, role, a "Create Your Account" button linking to `/sign-up`, and a reminder to use the same email address so the webhook auto-adds them to the group. The `PendingInvite` record is now created before the email send (not after), so the DB record exists even if Resend fails. Added `require('resend')` and `require('../models/Group')` to the controller.

---

## [3.1.0] - 2026-04-10

### Added
- `mern_vb_backend/scripts/activateGroup.js` (new): Configurable script to activate any group from trial to paid. Edit the three constants at the top (`GROUP_SLUG`, `PLAN_NAME`, `DURATION_MONTHS`), then run `node scripts/activateGroup.js`. Calculates `paidUntil` as today + duration, sets `isPaid: true` and `trialExpiresAt: 2099-12-31`. Outputs a clear success block with group name, plan, duration, and active-until date — or `❌ Error` with the reason if the slug is not found.

### Fixed

**Reports page — 401 Unauthorized on all non-PDF actions**
- Root cause: `downloadExcelReport()` in `Reports.jsx` and `fetchAvailableCycles()` in `ReportSelectionModal.jsx` used raw `fetch()` with `localStorage.getItem('token')`. Under Clerk auth that token is always `null`, so every request was rejected. Axios calls worked because the global interceptor in `auth.jsx` auto-attaches fresh Clerk tokens; `fetch()` bypasses the interceptor entirely.
- `Reports.jsx`: replaced `fetch()` in `downloadExcelReport()` with `axios.get(endpoint, { responseType: 'blob' })`. Replaced `fetch()` in `handleCycleSelected()` with `axios.get(url)`. Removed all stale `localStorage.getItem('token')` lines from the three PDF generator functions.
- `ReportSelectionModal.jsx`: replaced `fetch()` in `fetchAvailableCycles()` with `axios.get()`. Added `import axios from 'axios'`. Removed `localStorage.getItem('token')` line. Excel exports, in-app report views, and cycle loading now work correctly.

**ReportSelectionModal — UI spec alignment**
- Restyled from blue/gray palette to full UI spec: `bg-surface-card rounded-xl` container, `text-text-primary`/`text-text-secondary` text, `border-border-default` inputs with `focus:ring-brand-primary`, rounded-full Cancel and Generate buttons using spec colours, `text-status-overdue-text` error state. Close button replaced `×` text with lucide `X` icon using spec ghost button style.

**FinesModal — UI spec alignment**
- Status badges: replaced `rounded` with `rounded-full`, standardised padding to `px-3 py-1`, added `font-semibold uppercase tracking-[0.06em]`. Colour mapping: `Unpaid` → PENDING colours (`#FFF0E0`/`#B85A00`), `Paid` → PAID colours (`#E8F5E8`/`#2D7A2D`), `Cancelled` → INACTIVE colours (`bg-surface-page text-text-secondary`).
- Table header: removed `bg-gray-100 text-gray-700` background. Headers now use `text-xs font-medium uppercase tracking-wider text-text-secondary` with only a bottom border.
- Table rows: removed `hover:bg-gray-50`. Row dividers use `border-border-default`.
- "Reason" column: removed `truncate` — text now wraps within `max-w-xs`. `title` tooltip retained for long values.
- Action buttons: Edit and Void now use ghost style (`w-8 h-8 rounded-md text-text-secondary hover:bg-surface-page`). Delete uses destructive style (`text-status-overdue-text hover:bg-status-overdue-bg`).
- Edit Fine sub-dialog: labels use spec uppercase style, inputs use `border-border-default rounded-xl` style, Save uses `bg-brand-primary rounded-full`, Cancel uses ghost rounded-full.
- Void Fine sub-dialog: warning text uses `#B85A00`, Void button uses `bg-status-overdue-bg text-status-overdue-text` destructive style.
- Delete Fine sub-dialog: same destructive button style, spec text colours throughout.

### Scripts
- Ran `node scripts/markWilliamPaid.js` — William's group `paidUntil` set to 2099, trial banner removed.

---

## [3.0.0] - 2026-04-10

### Added — Night 2 Sprint: Member Invites, Upgrade/Billing Flow, Webhook

**Backend — Member Invites via Clerk Email**
- `models/PendingInvite.js` (new): Tracks email-based Clerk invitations. Schema includes `email`, `groupId`, `role`, `invitedBy` (clerkUserId), `name`, `clerkInvitationId`, and `expiresAt` (7-day TTL). MongoDB TTL index auto-deletes expired records. Unique compound index on `email + groupId` prevents duplicate pending invites.
- `controllers/inviteController.js`: Added `inviteByEmail` — validates role permissions, checks for duplicate pending invite and existing membership, calls Clerk Invitation API to send sign-up email with `groupId/role/name` in `public_metadata`, then stores a `PendingInvite` record. Added `getPendingInvites` — returns non-expired pending invites for the current group.
- `routes/invites.js`: Added `POST /api/invites/email` and `GET /api/invites/pending` (both require `verifyToken` + `resolveGroup`).

**Backend — Clerk Webhook Handler**
- `routes/webhookRoutes.js` (new): Handles `POST /api/webhooks/clerk`. Verifies the svix signature using `CLERK_WEBHOOK_SECRET`. On `user.created` event: looks up a `PendingInvite` by the new user's email, creates a `GroupMember` with the role/name from the invite, then deletes the invite. Webhook errors are logged but do not fail the response (Clerk will retry).
- `server.js`: Webhook route registered **before** `express.json()` middleware — required for svix raw-body signature verification. `POST /api/billing` also added.
- Dependencies added: `svix` (webhook signature verification), `resend` (transactional email).

**Backend — Billing / Upgrade Request**
- `controllers/billingController.js` (new): `requestUpgrade` looks up the requesting user's group membership and group name, then fires a Telegram message (always) and a Resend email (if `RESEND_API_KEY` + `ADMIN_EMAIL` are set) with the plan name, price, admin contact, and a reminder to set `isPaid + paidUntil` in Atlas. Gracefully skips email if env vars are absent.
- `routes/billingRoutes.js` (new): `POST /api/billing/request` (requires `verifyToken`).
- `config/paymentDetails.js` (new): Airtel Money, MTN MoMo, Access Bank, and WhatsApp contact details config. Fill before deploy.

**Backend — Group model + trial expiry**
- `models/Group.js`: Added `paidUntil: Date` (default `null`). Supports subscription expiry tracking alongside the existing boolean `isPaid`.
- `middleware/checkTrial.js`: Updated paid-group bypass logic. Three cases: `isPaid + paidUntil: null` → full access (backwards-compatible with existing paid groups); `isPaid + paidUntil: future` → full access; `isPaid + paidUntil: past` → subscription lapsed, falls through to trial/read-only logic.
- `scripts/markWilliamPaid.js`: Now also sets `paidUntil: 2099-01-01` when marking William's group as paid.

**Frontend — Members page**
- `pages/MembersPage.jsx` (new): Replaces legacy `Users.jsx` on the `/members` route. Displays active group members as a list with initials avatars (colour-keyed by first letter per UI Spec §2.3), member name, email, and role badge. Staff roles (admin/treasurer/loan_officer) see a "+ Invite Member" pill button top-right. Clicking opens `SlideoverDrawer` with an invite form (Full Name, Email, Role select). Submit calls `POST /api/invites/email`; success closes drawer + shows toast; errors display inline without closing. Below the member list: "Pending Invites" section (fetched from `GET /api/invites/pending`) shows email, role badge, and amber "Pending" badge.
- `App.jsx`: `/members` route now renders `MembersPage` instead of `Users`. Role guard widened from `['admin']` to `['admin', 'treasurer', 'loan_officer']`.

**Frontend — Upgrade / Pricing page**
- `pages/UpgradePage.jsx` (new): Three-state page — plan selection → subscription form → confirmation screen.
  - Plan selection: two cards (Starter ZMW 150, Standard ZMW 250 recommended) with feature lists and Subscribe buttons. Standard card has `border-2 border-brand-primary` highlight and "Recommended" badge.
  - Subscription form: pre-fills name (from group membership) and email (from Clerk, read-only); phone number field required. Submits to `POST /api/billing/request`.
  - Confirmation screen: checkmark icon, thank-you message, full payment instructions box (Airtel Money, MTN MoMo, Access Bank details), reference line (`groupName — planName`), WhatsApp link opens in new tab (`target="_blank" rel="noopener noreferrer"`).
  - Group name pulled from `user?.groupName` (set in auth context via `/auth/me`).
- `App.jsx`: `/upgrade` route added as a protected route.

**Frontend — Upgrade button wiring**
- `components/TrialBanner.jsx`: "Upgrade Now" button added (was just a text banner). Navigates to `/upgrade` via `useNavigate`.
- `components/layout/DesktopSidebar.jsx`: Sidebar trial card "Upgrade" button wired to `navigate('/upgrade')`.
- `pages/Settings.jsx`: Both "Upgrade" (trial-active state) and "Upgrade Now" (trial-expired state) buttons wired to `navigate('/upgrade')`.

### Fixed
- `pages/UpgradePage.jsx`: Confirmation screen reference line now shows the actual group name (`user?.groupName`) instead of the placeholder "My Group".
- `pages/UpgradePage.jsx`: WhatsApp link opens in a new tab so the user stays logged in to the web app.

---

## [2.9.0] - 2026-04-10

### Added — UI Overhaul Night 3: Onboarding/Welcome Polish + Settings Data Fix

**Backend — data persistence fixes**
- `GroupSettings.js` model: added `meetingDay` (String, nullable) and `lateFineType` (String enum `['fixed', 'percentage']`, default `'fixed'`) fields. Both have safe defaults so existing documents are unaffected.
- `groupController.createGroup`: now persists `meetingDay` and `lateFineType` from the onboarding form into the `GroupSettings` document. Previously both fields were received in `req.body` but silently discarded.
- `groupSettingsController.updateGroupSettings`: added `meetingDay` and `lateFineType` to the allowlist so they can be edited via the Settings page in future.
- `authController.me`: `/auth/me` response now includes `groupName: group?.name`. The `Group` document was already being fetched for trial status; this adds the name at no extra DB cost. Makes `user.groupName` available anywhere `useAuth()` is consumed.

### Changed

**Frontend — Settings page data fetching**
- `Settings.jsx`: replaced all hardcoded `null` / `"6 months"` / `"Reducing Balance"` placeholder values with a live fetch to `GET /api/group-settings` on mount. Displays a "Loading settings..." state while fetching. Field mappings: `groupName`, `meetingDay`, `cycleLengthMonths` (`"{n} months"`), `interestRate` (`"{n}%"`), `interestMethod` (human-readable), `loanLimitMultiplier` (`"{n}× savings"`), `profitSharingMethod` (human-readable), `overdueFineAmount` (`"K{n}"`), `lateFineType` (human-readable). Currency stays hardcoded `"ZMW (Zambian Kwacha)"`. All fields fall back to `"—"` if null/missing.

**Frontend — TopBar group label**
- `TopBar.jsx`: replaced `"{firstName}'s Group"` (derived from Clerk user's full name) with `user?.groupName` from the auth context. Shows the actual group name created during onboarding. Falls back to `"My Group"` if not yet loaded.

**Frontend — Welcome page reskin**
- `Welcome.jsx`: full colour system migration from the old blue palette to Night 1/2 design tokens. `bg-gradient-to-b from-blue-50 to-white` → `bg-surface-page`. All CTA buttons: `bg-blue-600` → `bg-brand-primary`, `rounded-xl` → `rounded-full` (spec pill). Feature cards: `bg-white border-gray-100` → `bg-surface-card border-border-default`. Pricing — Starter card: `bg-white border-gray-200` → `bg-surface-card border-border-default`, badge `text-blue-600` → `text-brand-primary`. Pricing — Standard card: `bg-blue-600 text-white` → `bg-surface-dark text-white` (dark hero). All `text-gray-*` classes replaced with spec tokens (`text-text-primary`, `text-text-secondary`, `text-text-muted`).

**Frontend — Onboarding wizard reskin**
- `Onboarding.jsx`: full spec reskin across all 4 steps and the success screen. No logic changes — only styling.
  - Outer wrapper: `bg-background` → `bg-surface-page`.
  - Card: `bg-white rounded-xl shadow` → `bg-surface-card rounded-xl`.
  - Logo circle added at card top (spec §9.2): 48px circle `bg-brand-primary` with white "C".
  - Static heading restructured: "Setup Your Chama" (h1) + "Step {n} of 4: {label}" (subtitle) replace the old per-step `<h2>` headings. Step labels updated to spec (Group Details / Lending Rules / Fine Rules / Confirm & Launch).
  - Step indicator pills (spec §6.12): active pill `w-8 bg-brand-primary`, inactive `w-6 bg-border-default`, `gap-1.5`. Previously all pills were equal `flex-1 bg-blue-600 / bg-gray-200`.
  - Input and select fields: `border rounded-lg px-3 py-2 text-sm focus:ring-blue-500` → `h-12 border border-border-default rounded-md px-3.5 text-sm text-text-primary focus:border-brand-primary focus:outline-none`.
  - Labels: `text-sm font-medium text-gray-700` → `text-xs font-medium uppercase tracking-widest text-text-secondary`.
  - Help text: `text-xs text-gray-500` → `text-xs text-text-muted`.
  - Primary buttons (Next / Create Group / Go to Dashboard): `bg-blue-600 hover:bg-blue-700 rounded-lg` → `bg-brand-primary hover:bg-brand-hover rounded-md font-semibold py-3`.
  - Back buttons: `border rounded-lg text-gray-600 hover:bg-gray-50` → `border border-border-default rounded-md text-text-secondary hover:bg-surface-page`.
  - Step 4 summary box: `bg-gray-50` → `bg-surface-page`, `text-gray-700` → `text-text-primary`.
  - Error text: `text-red-600` → `text-status-overdue-text`.

---

## [2.8.0] - 2026-04-10

### Added — UI Overhaul Night 2: Forms, Drawers & Colour Polish

**New components**
- `SlideoverDrawer.jsx` (`src/components/ui/`): Reusable drawer component. Slides in from the right on desktop (fixed 420px width, full height, left border). Slides up from the bottom on mobile (90vh, rounded top corners). Backdrop click and ESC key close it. Body scroll is locked while open. Accepts `title`, `footer` (submit button slot), and `children` props. Footer includes a "Cancel" text link below the primary action.
- `MemberSelect.jsx` (`src/components/ui/`): Searchable member picker. Fetches `GET /api/users` once on mount. Filters by name or username (case-insensitive). Dropdown shows avatar (initials, AVATAR_COLORS), full name, and role badge per member. On select: avatar appears inside the input, X button clears. Calls `onChange(member.username)` to stay compatible with existing form fields. Role badge colours match spec (admin → brand orange, treasurer → blue, loan_officer → green, member → grey).

**New routes/access**
- "View Fines & Penalties" added as 6th item in the AppShell Action Sheet, opening `FinesModal`.

### Changed

**Forms**
- `AddLoanForm.jsx`: Replaced raw username text input with `MemberSelect`. Applied spec field styles (uppercase label + 48px bordered input, `focus:border-brand-primary`). Form is now headless — no wrapper card, no title, no inline submit button. Submit is triggered via `form="add-loan-form"` on the SlideoverDrawer footer button. Error/loading shown as inline text.
- `AddSavingsForm.jsx`: Same changes as `AddLoanForm`. Form ID `"add-savings-form"`.

**Pages**
- `Loans.jsx`: Removed inline `AddLoanForm` side column and the `flex-col lg:flex-row` split layout. List is now full-width. Page header has title left + "+ Add Loan" primary pill button right (role-gated). `SlideoverDrawer` mounts at bottom of the component, opens on button click, closes and refreshes list on success. Loan status badges converted to spec pill style (`bg-status-paid-bg/text` and `bg-status-pending-bg/text`). Action buttons (Edit, Delete, Details) restyled to ghost rounded-full pills. Reverse/Delete confirmation dialogs use spec button colours.
- `Savings.jsx`: Same restructure as `Loans.jsx`. Inline `AddSavingsForm` side column removed. "+ Record Savings" button in page header. `SlideoverDrawer` wraps the form. Savings amounts display in `text-amount-positive`. Entry rows use `border-border-default` instead of `bg-gray-50 shadow`.
- `Dashboard.jsx`: Removed `AdminActions` quick-link grid (Add Loan / Add Savings / View Reports buttons) — redundant with the new nav and action sheet. Removed unused imports (`Card`, `Button`, `Link`, `FaPlus`, `FaPiggyBank`, `FaFileAlt`, `FaGavel`). Layout simplified to: NewCycleBanner → DashboardStatsCard.

**Stat cards & balance**
- `DashboardStatsCard.jsx`: Replaced 6-card rainbow colour system with spec unified layout. Bank Balance is now a full-width dark hero card (`bg-surface-dark`, white text, `text-4xl font-bold`). Five remaining stats (Total Saved, Total Loaned, Interest (Loans), Interest (Savings), Total Fines) are white cards in a 2-col (mobile) / 3-col (desktop) grid — no coloured borders, neutral `text-text-secondary` icons, `text-text-primary` values. Switched from react-icons to lucide-react.
- `BankBalanceCard.jsx`: Restyled to match the dark hero card pattern (`bg-surface-dark`, white balance text, `text-text-on-dark-muted` label). Removed `text-[#2979FF]` brand blue.

**Action Sheet**
- `AppShell.jsx`: "Add Loan" and "Add Savings" now navigate to `/loans` and `/savings` respectively (drawers live on those pages). Added `useNavigate` import. Added "View Fines & Penalties" as 6th action item.

### Fixed
- `InstallPWAButton.jsx`: Renamed `aria-label` on the dismiss button from `"Dismiss install banner"` to `"Dismiss"` — the word "install" in the old label caused `findByRole('button', { name: /Install/i })` to match two elements, breaking the test.

### Tests
- `DashboardStatsCard.test.js`: Updated label assertion from `/Bank Balance/i` to `/Total Group Balance/i` to match the new hero card label. Removed the stale `screen.debug()` call and commented-out interest assertions.
- All 4 tests now passing (previously 3 passing, 1 pre-existing failure).

---

## [2.7.0] - 2026-04-10

### Added — UI Overhaul Night 1: Nav System + Settings Scaffold

**New components**
- `DesktopSidebar.jsx`: Fixed 240px left sidebar (≥768px only). Logo mark, 6 nav items (Dashboard, Members, Savings, Loans, Reports, Settings), active state (`bg-brand-light` + `text-brand-primary`), hover state, trial status card at bottom.
- `MobileBottomNav.jsx`: Pill-shaped floating bottom nav (`bottom-3 left-3 right-3`, `rounded-xl`, `bg-surface-dark`). 5 items — Dashboard, Members, + (Action Sheet trigger), Reports, Settings. Active item uses `bg-brand-primary` rounded square. + button elevated 8px above bar.
- `TopBar.jsx`: Fixed header (`h-16`), `md:left-60` offset on desktop. Group name left, user avatar right with initials colour-coded via `AVATAR_COLORS` table from spec. Dropdown: Account Settings (→ `/settings`), Sign Out (via Clerk).
- `AppShell.jsx`: New shell wrapper replacing `Layout` in App.jsx. Composes DesktopSidebar + TopBar + MobileBottomNav + TrialBanner + children. Holds all modal state previously in Navbar (BankBalance, Payment, Fine, Fines, ChangePassword, NewCycle). Includes Action Sheet bottom sheet for the + button.
- `NewCycleBanner.jsx`: Dashboard-only banner component. Renders when `isVisible` prop is true. Calendar icon + cycle-due message + "Begin New Cycle" primary pill button. Wired to `BeginNewCycleModal` in Dashboard.
- `pages/Settings.jsx`: `/settings` route — 6 section cards (Group Profile, Financial Rules, Fine Rules, Member Roles, Billing, Danger Zone). Display mode only; each card has a no-op Edit button (editing is a future sprint). Danger Zone card uses destructive colour treatment.

**New routes**
- `/settings` — Settings page (all authenticated users)
- `/members` — Points to Users page (admin only, stub until Members page is built)

**Design system**
- `index.css`: 25 new Tailwind v4 color tokens added to `@theme inline` (`brand-*`, `surface-*`, `text-*`, `status-*`, `border-*`, `trial-*`, `amount-positive`). Font tokens `--font-sans` (DM Sans) and `--font-mono` (DM Mono). Radius values updated to spec (8/12/16/20px).
- `index.html`: DM Sans + DM Mono loaded from Google Fonts. Title updated to "Chama360".

### Changed
- `Layout` in `App.jsx` replaced by `AppShell` — old `Navbar` + `TrialBanner` + `<main>` wrapper consolidated into single shell component.
- `Dashboard.jsx`: `NewCycleBanner` rendered at top of page content, `BeginNewCycleModal` trigger moved here from the old Operations dropdown.
- `body` now applies `bg-surface-page text-text-primary font-sans` — warm off-white (#F0EDE8) page background across all authenticated pages.

### Removed
- Old horizontal sticky `Navbar.jsx` (Operations dropdown, Settings dropdown, inline logout button). All operational actions migrated to AppShell's Action Sheet. Sign Out migrated to TopBar dropdown.

---

## [2.6.0] - 2026-04-09

### Added
- Promotional holding page (`/welcome`): new users see app name, value prop, feature cards, pricing (ZMW 150 Starter / ZMW 250 Standard), and "Start my 15-day free trial" CTA before reaching the onboarding wizard
- `OnboardingRoute` guard: `/onboarding` only accessible after clicking the CTA (checks `sessionStorage.trialAccepted`); direct URL access redirects to `/welcome`
- User indicator in Navbar: initials avatar (blue circle) + first name displayed to the left of Logout on all authenticated pages

### Fixed
- `resolveGroup` middleware was using `req.auth?.userId` (always `undefined` on Clerk's callable auth object) instead of `getAuth(req)` — root cause of all 401 errors on group-scoped API routes after authentication
- Super admin who is also a group member (William) now gets both `isSuperAdmin: true` AND full group scoping resolved, so they see their own group data instead of 500 errors
- Zombie Jest test process from a previous test run was holding port 5000 with stale 2-day-old code, causing 401s and 404 on diagnostic endpoint — killed and replaced with correct nodemon process
- `OnboardingRoute` converted from inline JSX expression to a proper component function so `sessionStorage` is read at render time (not element-creation time), fixing the CTA button doing nothing

### Changed
- `ProtectedRoute` redirects `needsOnboarding` users to `/welcome` instead of directly to `/onboarding`

---

## [2.5.0] - 2026-04-09

### Added
- Free trial system: `Group` model gains `trialExpiresAt` (15 days) and `isPaid` fields
- `checkTrial` middleware: blocks write operations (POST/PUT/DELETE) for expired unpaid groups, allows GETs (read-only)
- Wired `checkTrial` into all 9 group-scoped route files after `resolveGroup`
- `SuperAdmin` model for platform-level admin bypass
- `resolveGroup` now checks SuperAdmin first; super admins skip group membership requirement
- `GET /api/admin/groups` and `GET /api/admin/groups/:groupId` routes for super admin group listing
- `GET /api/auth/test` diagnostic endpoint (to be removed after auth confirmed)
- 4-step onboarding wizard: Step 1 (group info + cycle), Step 2 (loan settings), Step 3 (fines), Step 4 (confirm)
- `TrialBanner` component shown when trial is expired
- Super admin bypass in `ProtectedRoute` (no onboarding redirect)
- `trialActive` and `isSuperAdmin` state in auth store; 403 `trial_expired` global response interceptor
- `scripts/seedSuperAdmin.js` — idempotent super admin seed script
- `scripts/markWilliamPaid.js` — one-time script to set William's group as paid/permanent

### Changed
- `/auth/me` response now includes `trialActive`, `trialExpiresAt`, `isPaid`, `isSuperAdmin`
- `POST /api/groups` accepts full wizard fields: `meetingDay`, `cycleStartDate`, `cycleLengthMonths`, `interestRate`, `interestMethod`, `loanLimitMultiplier`, `lateFineAmount`, `lateFineType`; sets `trialExpiresAt` on group creation
- Onboarding success shows welcome screen before redirecting to dashboard
- `auth.jsx` `/auth/me` call now passes token explicitly to avoid race condition on first load
- Removed debug aids: `GET /api/debug-auth`, `console.error` logging in `verifyToken`

---

## [2.4.0] - 2026-04-07

### Added — Clerk Auth + Multi-Group Foundation (Day 4 Sprint)

**Backend**
- **`models/GroupMember.js`**: New model replacing the old `User` model for auth purposes. Stores `clerkUserId`, `name`, `email`, `phone`, `role`, `groupId`, `active` flag. Links Clerk identity to group membership.
- **`models/Group.js`**: New model for group records (`name`, `description`, `createdBy`, `createdAt`).
- **`controllers/authController.js`**: `GET /auth/me` — resolves Clerk userId to a GroupMember record; returns `{ _id, name, role, groupId, phone, email }` or `{ code: 'NO_GROUP' }` 403 if no membership exists.
- **`routes/auth.js`**, **`routes/groups.js`**, **`routes/invites.js`**: New route files for auth, group management, and invite-based onboarding flows.
- **`middleware/auth.js`** — `verifyToken`: replaced custom JWT verify with Clerk's `getAuth(req)` check. `requireRole`: unchanged, reads from `req.role` set by group-resolution middleware.
- **`middleware/resolveGroup.js`**: Reads Clerk userId from `getAuth(req)`, looks up GroupMember, attaches `req.groupMember`, `req.groupId`, `req.role` to every protected request.

**Frontend**
- **`@clerk/clerk-react`** installed and wired into `main.jsx` via `<ClerkProvider>`.
- **`src/store/auth.jsx`** rewritten: replaced localStorage JWT pattern with Clerk hooks (`useClerkAuth`, `useUser`). Axios interceptor now calls `getToken()` (auto-refreshes the 2-min JWT) before every request. `authLoading` state prevents race conditions between interceptor setup and first API call.
- **`src/pages/SignIn.jsx`**, **`src/pages/SignUp.jsx`**: Clerk-hosted sign-in/sign-up pages using `<SignIn>` and `<SignUp>` components.
- **`src/pages/Onboarding.jsx`**: 4-step wizard — group name, member details, review, confirm. Creates a new Group + GroupMember in MongoDB after Clerk sign-up.
- **`src/pages/InviteAccept.jsx`**: Accepts invite tokens, links a signed-in Clerk user to an existing group as a new GroupMember.
- **`src/App.jsx`** — `ProtectedRoute` updated to gate on `isLoaded && !authLoading` rather than `user` being set, so the spinner resolves even if the `/auth/me` call fails.

### Changed
- `server.js`: replaced `express-jwt` / custom JWT middleware with `clerkMiddleware({ secretKey })` from `@clerk/express`. Added `allowedHeaders: ['Authorization']` to CORS config.
- `mern-vb-frontend/.env`: `VITE_CLERK_PUBLISHABLE_KEY` added alongside `VITE_API_URL`.

### Removed
- Old `authController.js` login endpoint (username + bcrypt password flow) — replaced by Clerk-managed sign-in.
- `JWT_SECRET` from backend `.env` — no longer needed.

---

## [2.3.0] - 2026-04-03

### Added
- **`interestMethod` wiring**: `createLoan` now reads `interestMethod` from GroupSettings and passes it to `calculateLoanSchedule`. Flat-rate and reducing-balance schedules are now fully driven by per-group configuration.
- **`loanLimitMultiplier` enforcement**: `createLoan` reads `loanLimitMultiplier` from GroupSettings and rejects loan requests that exceed the member's savings × multiplier cap, returning a descriptive 400 error.

### Changed
- `utils/loanCalculator.js` — added `interestMethod` parameter to `calculateLoanSchedule`; flat-rate branch computes `originalAmount × (rate/100) / durationMonths` per installment; reducing-balance branch unchanged.

---

## [2.2.0] - 2026-04-02

### Added
- **GroupSettings model** (`models/GroupSettings.js`): Single-document-per-group store for all configurable financial parameters — interest rate, interest method, default loan duration, loan limit multiplier, late penalty rate, overdue fine, early payment charge, savings interest rate, savings minimums/maximums, savings shortfall fine, cycle length, and profit sharing method.
- **GroupSettings controller** (`controllers/groupSettingsController.js`): `getSettings()` internal helper used by all financial controllers; `GET /api/group-settings` (any authenticated user); `PUT /api/group-settings` (admin only).
- **GroupSettings route** (`routes/groupSettings.js`): Mounted at `/api/group-settings` in `server.js`.
- **Seed script** (`scripts/seedGroupSettings.js`): Idempotent — seeds William's group values on first run, prints existing settings if already seeded.
- **Tests** (`tests/loanCalculator.test.js`, `tests/groupSettings.test.js`): 18 new unit tests covering calculator regression (10%/15%/5% rates), duration parameterisation, reducing balance proof, installment structure, schema validation (invalid enum values, out-of-range interest), and penalty/savings calculation parity.

### Changed
- **`utils/loanCalculator.js`** — Complete rewrite. New signature: `calculateLoanSchedule(amount, duration, interestRate)`. All three parameters required. Removed amount-based duration threshold logic (group-specific policy moved to controller layer). Replaced hardcoded `0.10` with `interestRate / 100`. Calculator is now a pure math function with no hidden state.
- **`controllers/loanController.js`** — `createLoan`: reads `defaultLoanDuration` and `interestRate` from GroupSettings instead of hardcoded `DEFAULT_DURATION = 4` / `DEFAULT_INTEREST_RATE = 10`; removed post-hoc schedule recalculation block. `repayInstallment`: reads `latePenaltyRate`, `overdueFineAmount`, and `earlyPaymentCharge` from GroupSettings instead of hardcoded `0.15`, `1000`, `200`. `updateLoan`: passes `loan.interestRate` as third argument to `calculateLoanSchedule`.
- **`controllers/savingsController.js`** — `createSaving` and `updateSaving`: reads `savingsInterestRate`, `minimumSavingsMonth1`, `minimumSavingsMonthly`, `maximumSavingsFirst3Months`, and `savingsShortfallFine` from GroupSettings instead of hardcoded `0.10`, `3000`, `1000`, `5000`, `500`.
- **`models/Loans.js`** — `interestRate` field: removed `default: 10`, changed to `required: true`. Rate now always comes from the controller via GroupSettings at loan creation time.

### Technical Notes
- 17 hardcoded financial values removed across 3 files; all replaced by GroupSettings lookups.
- `getSettings()` throws a clear error if no GroupSettings document exists — no silent fallbacks that could mask misconfiguration for a new group.
- Changing GroupSettings does NOT retroactively affect existing loans; each loan document stores its own `interestRate` at creation time.
- Fields stored in GroupSettings but not yet wired (interestMethod flat rate, loanLimitMultiplier enforcement, profitSharingMethod payout logic, cycleLengthMonths wiring) are ready for future features.

## [2.1.1] - 2026-04-01

### Fixed
- **Bank balance correction (Sprint Day 1 audit)**: Resolved a K158,989.00 discrepancy between the recorded balance (K179,622.67) and the true balance (K20,633.67). Three root causes identified and corrected:
  - **Duplicate payment transactions**: 4 phantom transactions were deleted — idah had 2 duplicate `loan_payment` entries (2× K17,500) and sampa had 2 duplicates (2× K14,000), totalling K63,000 of excess bank balance credits created during troubleshooting sessions.
  - **Patriciam data entry error**: Loan transaction `69637bb667c6d49b9d295b10` was logged as K11 instead of K11,000. The loan record had been corrected directly in the DB but the transaction record and corresponding bank balance debit were never updated. Fixed transaction amount and note.
  - **Manual `setBankBalance` override**: A prior admin override set the balance to match an external bank figure without a corresponding transaction record, causing the transaction trail to diverge from the stored balance.
  - All three corrections were applied atomically via a MongoDB session in `scripts/fixBalanceCorrection.js`. Pre-correction backups written to `mern_vb_backend/backups/`.
  - Post-fix audit confirms: recorded K20,633.67 = calculated K20,633.67, savings match (K235,300), loan payments match (K115,833.67). Difference: K0.00.

### Added
- `mern_vb_backend/scripts/fixBalanceCorrection.js` — one-time atomic correction script (backup → delete duplicates → fix patriciam tx → recalculate balance → log audit transaction → verify)

### Security / Data Integrity
- Balance correction logged as an audit `cycle_reset` transaction with full explanation, preserving the audit trail

## [2.1.0] - 2026-03-14

### Added
- **Loan Deletion**: Admins and loan officers can now delete loans that have no payments recorded
  - Deletion is blocked with a clear error message if any installment has been paid
  - Atomically restores the disbursed amount to the bank balance on deletion
  - Logs a reversal transaction for full audit trail
  - Confirmation dialog in UI shows reversal impact before proceeding

- **Operations Menu**: New dedicated "Operations" dropdown in the navbar (admin, loan_officer, treasurer)
  - Consolidates: Manage Bank Balance, Manage Payment, Add Fine/Penalty, Begin New Cycle, View Fines & Penalties, Delete All Fines (admin only)
  - "Settings" dropdown now contains only Change Password and Manage Users (admin)
  - Operations menu is hidden from members with no role permissions

- **Fine & Penalty Management**: Complete fine lifecycle management for officers/admin
  - Edit unpaid, non-cancelled fines (amount and reason/notes)
  - Void fines with a mandatory cancel reason — cancelled fines keep an audit trail; bank balance is reversed if the fine had already been paid
  - Permanently delete fines — bank balance reversed automatically if the fine was paid
  - Status badges on each fine: Paid (green), Unpaid (yellow), Cancelled (grey)

- **Fines & Penalties Viewer**: All users can now view fines relevant to them
  - Officers/admin see all fines across all members with full management actions
  - Members see only their own fines read-only, accessible from the Reports page
  - Empty state message shown when a member has no fines
  - Accessible from both the Operations menu (navbar) and the Reports page

- **Reports Page — Fines Section**: New "Fines & Penalties" card added to the top of the Reports page
  - Visible to all roles with a role-appropriate subtitle
  - Opens the Fines & Penalties modal on click

### Fixed
- **Loan Creation — Custom Duration Ignored**: `createLoan` was auto-calculating duration based only on amount thresholds, ignoring the duration entered in the form
  - K50,000 loans always created 4-month schedules regardless of what was entered
  - Now correctly reads `duration` from the request body; auto-calculates only when not provided
  - Also reads custom `interestRate` from the body and recalculates the schedule accordingly

- **Loan Edit — Duration Field Incorrectly Locked**: `EditLoanForm` was disabling all three fields (amount, interestRate, durationMonths) once any payment existed
  - Backend only restricts `amount` and `interestRate` after payments begin; duration was always editable
  - Fixed: only amount and interest rate disable after payments; duration remains editable
  - Added informational warning banner when editing a loan with existing payments

### Fixed - 13-02-2026
- **Loan Payment Allocation (Multiple Active Loans)**: Ensured repayments apply to the most recent active loan in the current cycle
  - Updated repayment logic to select latest active, non-archived loan by default
  - Added optional `loanId` targeting for explicit payment routing
  - Added audit and repair scripts to diagnose and correct misapplied loan payments

### Fixed - 06-02-2026
- **PDF Report Generation - Production Fix**: Fixed Loans and Savings PDF downloads failing in production
  - Aligned generateLoansPDF and generateSavingsPDF functions to match exact pattern of working generateTransactionPDF
  - Ensured identical API call structure, token handling, and error management across all PDF generators
  - Production deployment now supports PDF exports for all report types (Transactions, Loans, Savings)
  - Maintained backward compatibility with development environment functionality

- **PDF Report Generation**: Fixed non-functional PDF downloads for Loans and Savings reports
  - Implemented missing `generateLoansPDF` and `generateSavingsPDF` functions in Reports.jsx
  - Added proper loan installment flattening for comprehensive PDF table display
  - Updated `handleExport` function to route PDF requests to appropriate generators
  - PDF reports now work for all report types (Transactions, Loans, Savings) with consistent formatting
  - Maintained Excel export functionality while adding missing PDF capabilities

- **Legacy Payment Data Corruption**: Fixed corrupted loan installment data for patriciam user
  - Repaired loan payment records where database showed K0 payments despite transaction logs showing K9,533.67 in payments
  - Applied payment corrections: Month 1 fully paid (K4,766.67) and Month 2 partially paid (K4,400.00)
  - This addresses legacy corruption from pre-atomic transaction period (before Feb 5, 2026)
  - Created repair script for systematic correction of historical payment data discrepancies

- **Documentation Path References**: Fixed broken file path references in copilot instructions
  - Updated relative paths in `.github/copilot-instructions.md` to correctly reference project files
  - Fixed 15 file path resolution errors in VS Code problems panel
  - Ensured proper navigation from GitHub documentation to actual source files

## [2.0.4] - 2026-02-05

### Fixed - Critical Payment System Issues
- **Payment Processing Atomicity**: Implemented MongoDB sessions for atomic transaction processing
  - All payment operations now use atomic transactions to prevent partial updates
  - Enhanced error handling with automatic rollback protection
  - Fixed bank balance inconsistencies caused by failed payment operations
  - Added transaction validation before database commits

- **Frontend Data Synchronization**: Fixed loan data not updating after payments
  - Implemented global event system for real-time UI updates
  - Payment modal now dispatches `loanDataChanged` events after successful operations
  - Loans page automatically refreshes when payments are made from navigation
  - Dashboard statistics update immediately after financial transactions

- **Payment Reversal System**: Enhanced reversal logic with atomicity and corruption detection
  - Added MongoDB sessions for atomic reversal operations
  - Implemented validation to detect and prevent corrupted payment data processing
  - Enhanced error messages with specific reversal amounts and details
  - Fixed bank balance updates during payment reversals

- **Data Integrity Restoration**: Fixed corrupted loan installment data
  - Created repair script to clean up impossible `paidAmount` values in loan records
  - Reset corrupted installments where `paid=false` but `paidAmount > total`
  - Implemented validation in reversal logic to prevent future corruption

- **Bank Balance Audit and Correction**: Comprehensive financial audit system
  - Created current cycle transaction audit script for balance verification
  - Identified and corrected K42,149.95 bank balance discrepancy
  - Implemented transaction-based balance calculation for accuracy verification
  - Fixed bank balance to reflect accurate current cycle financial activity (K174,989.00)

### Enhanced - Payment and Transaction Systems
- **Transaction Type Validation**: Clarified and standardized payment type handling
  - Updated Transaction model enum to include all valid types: `['loan', 'saving', 'fine', 'payment', 'loan_payment', 'payout', 'cycle_reset']`
  - Fixed transaction type mismatches that caused payment processing errors
  - Improved error messages for invalid transaction types

- **Payment Modal User Experience**: Enhanced payment confirmation and error handling
  - Updated frontend to parse and display actual backend error responses
  - Improved success messages to show detailed payment breakdowns
  - Fixed double message display (success + error) issue
  - Enhanced payment type labeling for clarity

- **Loan Management Robustness**: Strengthened loan processing with better validation
  - Added corruption detection in payment processing workflows
  - Enhanced installment payment tracking with detailed payment dates
  - Improved loan status calculation and fully-paid determination
  - Added comprehensive transaction logging for audit trails

### Technical Improvements
- **Database Session Management**: Implemented proper MongoDB session handling
  - Updated `updateBankBalance` and `logTransaction` utilities to support sessions
  - Enhanced error handling in session-based operations
  - Improved transaction consistency across all financial operations

- **Audit and Monitoring Tools**: Created comprehensive financial audit capabilities
  - Current cycle transaction analysis scripts
  - Bank balance verification and correction tools
  - Cross-verification between transaction logs and data collections
  - Detailed financial activity reporting
## [2.0.3] - 2026-01-11

### Fixed - 11-01-2026
- **Loan Duration Edit Functionality**: Fixed restriction preventing loan duration updates after loan creation
  - Removed overly restrictive blocking of `durationMonths` field edits for existing loans
  - Updated loan calculator to accept custom duration parameter instead of auto-calculation only
  - Enhanced loan recalculation logic to handle duration changes while preserving paid installments
  - Added smart installment recalculation that adjusts only unpaid installments when duration changes
  - Fixed issue where loan officers and treasurers couldn't modify loan terms as intended
  - Improved loan schedule calculation for both new loans and loans with partial payments

### Enhanced - 11-01-2026
- **Intelligent Loan Recalculation**: Improved loan schedule updates for duration changes
  - For loans with no payments: Complete schedule recalculation with new parameters
  - For loans with payments: Preserves paid installments while recalculating remaining schedule
  - Automatic handling of duration extension (adds installments) and reduction (removes excess unpaid installments)
  - Maintains loan integrity and payment history while allowing necessary adjustments
- **Flexible Loan Duration Management**: Enhanced duration handling in loan calculator utility
  - Loan calculator now accepts optional custom duration parameter
  - Maintains backward compatibility with automatic duration calculation based on loan amount
  - Enables precise control over loan terms for different member situations

## [2.0.2] - 2026-01-11

### Fixed - 11-01-2026
- **Loan Edit Functionality**: Fixed critical bug where loan edits were not being saved properly
  - Corrected backend `updateLoan` function field update logic that prevented loan parameter changes
  - Fixed improper handling of restricted vs allowed fields during loan updates
  - Added automatic loan schedule recalculation when amount is modified (only when no repayments have started)
  - Resolved issue where loan amount, interest rate, and duration changes were being blocked incorrectly

### Added - 11-01-2026
- **Enhanced Loan Edit UI**: Improved user experience for loan editing interface
  - Added clear field labels to EditLoanForm component (Amount, Interest Rate, Duration, Notes)
  - Implemented proper label-input association for better accessibility
  - Enhanced form layout with better spacing and visual hierarchy
  - Added descriptive placeholders and improved textarea sizing for notes field
- **Bank Balance Auto-Adjustment**: Automatic bank balance updates when loan amounts are edited
  - Added logic to adjust bank balance when loan amounts are modified
  - Calculates difference between old and new loan amounts and updates bank accordingly
  - Creates audit trail transactions for all bank balance adjustments from loan edits
  - Only applies adjustments when no repayments have been made (preserving loan integrity)
- **Extended Bank Balance Management Permissions**: Expanded access to bank balance management
  - Updated role permissions to allow loan_officer, treasurer, and admin to manage bank balance
  - Previously only admin users could update bank balance, now aligned with other financial operations
  - Maintains security while improving operational flexibility for authorized financial roles

### Changed - 11-01-2026
- **Improved Role-Based Access Control**: Enhanced consistency across financial management features
  - Bank balance management now follows same role pattern as loan and savings management
  - Better alignment of permissions across all financial operations

## [2.0.1] - 2026-01-04

### Added - 04-01-2026
- **Savings Edit Functionality**: Added ability for authorized users (admin, treasurer, loan_officer) to edit existing savings entries
  - New `updateSaving` API endpoint (`PUT /api/savings/:id`) with role-based access control
  - Created `EditSavingsForm` component following established design patterns from loan edit functionality
  - Added edit buttons to savings entries on the Savings page with modal-based editing interface
  - Comprehensive validation and error handling for savings updates
  - Automatic bank balance adjustment when savings amounts are modified
  - Transaction logging for audit trail of savings adjustments
  - Form pre-population with existing savings data for seamless editing experience

### Fixed - 04-01-2026
- **Transaction Logging**: Fixed transaction type enum validation error
  - Corrected `saving_adjustment` transaction type to use valid `saving` enum value
  - Resolved console errors during savings edit operations
  - Improved transaction logging consistency across the application

## [2.0.0] - 2026-01-04

### Added - 04-01-2026
- **Enhanced Reporting System**: Comprehensive cycle-based data reporting with historical access
  - Added "Select Report Period" modal for choosing between current cycle and historical cycle data
  - New enhanced report endpoints (`/api/reports/enhanced`, `/api/reports/cycles`) supporting cycle-based filtering
  - Intelligent cycle detection: automatically identifies archived data even without explicit cycle management
  - Historical cycle dropdown with formatted cycle names and dates (e.g., "Cycle 1 (Sep 5, 2025)")
  - Support for both current active data and historical archived data in all report types
  - Enhanced data transformation with robust null/undefined value handling for reliable report generation
  - Improved column mapping between backend data structure and frontend display tables
  - Reports now show comprehensive loan details: installments, principal, interest, payment status, dates
  - Enhanced savings reports with interest earned, fines, and payment dates
  - Detailed transaction reports with user information, transaction types, amounts, and notes
  - Automatic fallback for legacy data without cycle numbers (creates "Historical Data" cycle option)

### Added - 03-01-2026
- **New Cycle Management System**: Comprehensive feature for resetting the banking cycle while preserving historical data
  - Added "Begin New Cycle" functionality accessible via settings dropdown for admin, treasurer, and loan_officer roles
  - Automatic generation and download of CSV backup reports (loans, savings, transactions, fines) before cycle reset
  - Complete reset of current cycle data: loans, savings balances, fines, and bank balance return to zero
  - Historical data preservation: all previous cycle data archived with cycle metadata for future reporting
  - Added cycle tracking fields to all data models (cycleNumber, cycleEndDate, archived)
  - New API endpoints: `/api/cycle/begin-new-cycle`, `/api/cycle/historical-reports`, `/api/cycle/available-cycles`
  - Updated all controllers to filter archived data, ensuring current dashboard shows only active cycle data
  - Enhanced settings dropdown with click-outside-to-close behavior and proper UX patterns
  - Added BeginNewCycleModal with 3-step process: confirmation, processing, and completion feedback
- Updated favicon and app title for better branding
- Added admin password reset script for development convenience

### Changed - 04-01-2026
- **Reports System Overhaul**: Completely redesigned reporting system for better usability and data access
  - Replaced single-cycle reports with flexible current/historical cycle selection
  - Updated frontend column mappings to match enhanced backend data structure
  - Improved data transformation logic to handle edge cases and missing data gracefully
  - Enhanced report modal with better pagination and data display formatting
  - Reports now leverage the cycle management system for seamless historical data access

### Changed - 03-01-2026
- Moved "Begin New Cycle" from main dashboard to settings dropdown for better UX (infrequent but critical action)
- Improved settings dropdown behavior to close when clicking outside, following modern app patterns
- Enhanced data isolation between cycles while maintaining complete audit trail
- Updated all data retrieval methods to exclude archived records from current cycle operations

### Fixed - 04-01-2026
- **Data Display Issues**: Resolved critical reporting problems
  - Fixed column key mismatches preventing data from appearing in report tables
  - Improved handling of undefined/null createdAt dates and other missing fields
  - Enhanced data transformation to gracefully handle loans without installments
  - Fixed date formatting inconsistencies across all report types
  - Resolved frontend-backend data structure alignment issues
- Removed debugging code and temporary files for clean production deployment

### Fixed - 03-01-2026
- Fixed syntax errors in React components with proper JSX quote handling
- Resolved AuthContext export issues in Dashboard component
- Improved dropdown component patterns for better accessibility and usability

### Added - 02-09-2025
- Added ability for admin, loan officer, and treasurer to edit existing loans via new backend endpoint and frontend modal.
- Added ability to reverse/remove a loan repayment (installment) made in error, with backend API and frontend UI for authorized roles.
- Added support for partial loan repayments: backend now tracks paidAmount for each installment, allows partial payments, and carries over overpayments to subsequent installments.
- Frontend now displays paid and remaining amounts for each loan installment, improving clarity for borrowers and staff.
- Added EditLoanForm component and integrated edit/reverse dialogs in Loans page.
- Updated backend loan model to include paidAmount field for installments.
- Updated payment controller logic to support partial payments and overpayment carryover.
- Added route and controller for reversing installment payments.
- Added concurrently to root package.json and setup for running both backend and frontend dev servers with pnpm start.

### Changed - 02-09-2025
- Improved loan repayment workflow to support partial payments and display payment progress in the UI.
- Updated Loans page UI to show paid/remaining amounts for each installment.
- Updated backend and frontend logic to ensure only authorized roles can edit loans or reverse payments.

### Fixed - 02-09-2025
- Fixed error when posting partial repayments by updating backend logic to accept and track partial payments.
- Fixed UI to provide clear feedback on payment status and errors.

### Added - 20-07-2025
- Full savings history table for all users, visible to everyone, with responsive design.
- Backend endpoint `GET /api/savings` to return all savings with user info populated.
- Add Savings and Add Loan forms and backend now use username instead of userId for posting and repayments, improving usability for admins and users.

### Fixed - 20-07-2025
- Fixed bank balance calculation bug (string concatenation) by ensuring numeric addition in `updateBankBalance`.
- Improved responsive/mobile-first layout for Savings page and table, ensuring usability on all screen sizes.
- General UI/UX polish for mobile and desktop.

### Added
- Transactions management feature:
  - `models/Transaction.js`: Mongoose model for transaction records (loan, saving, fine).
  - `controllers/transactionController.js`: Controller for logging and retrieving transactions.
  - `routes/transactions.js`: API endpoints for admin and user transaction retrieval.
- New savings and threshold endpoints in `routes/savings.js`:
  - Endpoints for exporting savings reports and dashboard stats are defined, but not yet implemented in the controller.

### Technical Details
- The `json2csv` package is required for CSV export endpoints but is not yet listed in `package.json`.
- The `exportSavingsReport` and `getDashboardStats` endpoints are referenced in routes but not implemented in the controller.

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- Fixed missing `mongoose` imports in model files (e.g., `Savings.js`, `Transaction.js`), which caused backend crashes on startup.
- Corrected model import paths in controllers to match actual filenames (e.g., `require('../models/Savings')` instead of `require('../models/Saving')`, and `Loans` instead of `Loan`).
- Installed the `json2csv` package in the backend to resolve module not found errors for CSV export features.
- Added the missing `exportSavingsReport` handler to `controllers/savingsController.js` to resolve route handler errors and enable savings CSV export.
- Fixed route handler errors by ensuring all route handlers are defined functions and match their exports.
- Documented troubleshooting steps for backend startup errors, 404s, and 500s, improving project stability and maintainability.

### Security
- N/A

### Frontend (mern-vb-frontend)

#### Added
- Authentication context store (`src/store/auth.js`) with login, logout, token management, and Axios interceptor for secure API requests.
- Login page (`src/pages/Login.jsx`) with form, error handling, and integration with auth context.
- Role-based routing in `src/App.jsx` using React Router, with automatic redirection to dashboards based on user role (admin, treasurer, loan officer, member).
- Dashboard stubs for each user role.

### Backend
- Updated backend server to use direct require for auth routes: `app.use('/api/auth', require('./routes/auth'))` in server.js for improved clarity and hot-reload compatibility.

### Frontend
- Added Vite dev server proxy configuration to vite.config.js to forward /api requests to backend (fixes 404 on API calls during development).
- Renamed auth context file to auth.jsx for JSX compatibility.
- Fixed missing dependencies for export features: ensure jspdf-autotable, xlsx, and jspdf are installed.

## [Unreleased]
### Added
- PWA install banner/snackbar for easy add-to-homescreen experience.
- Custom splash screen and theming via manifest: branded background and theme color (#2979FF).
- Maskable icons for better appearance on all devices.
- App shortcuts for quick access to 'Add Loan' and 'View Reports' from the homescreen/app icon.
- Manifest description for improved install experience.

### Changed
- Updated vite.config.js to enhance PWA manifest and runtime caching.
- Updated all frontend API calls to use API_BASE_URL from environment variables for correct backend communication in both local and production environments.
- Added src/lib/utils.js to centralize API base URL usage.

## [Unreleased]
### Added - 21-07-2025
- Refactored Loans and Savings pages to use a mobile-first accordion view for each user, replacing the previous table layouts.
- Each loan and savings entry is now displayed as a card-like accordion item with modern UI touches: icons, color coding, rounded corners, and shadows.
- Collapsed view shows user name and total (loan amount or total savings); expanded view shows detailed breakdowns (repayment schedule for loans, monthly savings for savings) with dates and notes.
- Grouped savings and loans by user for easier navigation and improved mobile usability.

### Changed - 21-07-2025
- Improved consistency and modern feel across the app by unifying the UI patterns for displaying financial data.
- Enhanced mobile experience and accessibility for both Loans and Savings pages.
- Switched PDF report generation for Loans, Savings, and Transactions to pdfmake for full Node.js compatibility and reliable tabular output.
- Centered and constrained the Reports page layout for a modern, consistent look on all screen sizes.
- Improved navbar icon sizing and dashboard/reports UI consistency.
- Fixed mobile and desktop alignment issues for all major pages.

## [0.1.0] - 2025-07-03

### Added
- Project initialization and basic folder structure
- MongoDB Atlas cloud database connection configuration
- Server.js with Express.js setup and MongoDB connection
- Environment variable configuration for secure database credentials
- Database connectivity test script for validation
- Essential npm packages for backend development

### Technical Details
- **Database**: MongoDB Atlas cloud instance configured
- **Server**: Express.js server running on port 5000 (configurable via PORT env var)
- **Package Manager**: pnpm for efficient dependency management
- **Environment**: Development setup with nodemon for auto-restart
- **Connectivity**: Successfully tested MongoDB Atlas connection via testdbconn.js

### Next Steps
- Implement user authentication system
- Create data models for banking operations
- Set up API routes for core banking functionality
- Implement middleware for request validation and authentication
- Add error handling and logging mechanisms

## [0.2.0] - 2025-07-05

### Added
- User authentication system:
  - `authController.js` for login and JWT issuance
  - `auth.js` middleware for JWT verification and role-based access control
  - `roles.js` middleware placeholder
- User management:
  - `userController.js` for creating, listing, and deleting users
  - `User.js` Mongoose model for user schema with roles and password hashing
- API routes:
  - `routes/auth.js` for login endpoint
  - `routes/users.js` for user CRUD endpoints, protected by authentication and admin role
- .gitignore file to exclude node_modules, environment files, logs, build artifacts, and IDE files

### Changed
- Updated `package.json` to add `dev` and `start` scripts for backend server management

### Technical Details
- All user management endpoints are protected by JWT authentication and admin role checks
- Passwords are securely hashed using bcryptjs
- JWT secret is loaded from environment variables

### Next Steps
- Implement additional banking features (accounts, transactions, loans)
- Expand user roles and permissions
- Add more comprehensive error handling and validation

## [0.3.0] - 2025-07-10

### Added
- Loan management feature:
  - `models/Loans.js`: Mongoose model for loan schema, including installments, penalties, and payment tracking.
  - `controllers/loanController.js`: Controller for creating loans, fetching user loans, and handling installment repayments with penalty logic.
  - `routes/loans.js`: API routes for loan creation, repayment, and fetching user loans, protected by authentication and role-based access.
  - `utils/loanCalculator.js`: Utility for calculating loan schedules, interest, and installment breakdowns.
- Scripts:
  - `scripts/seedAdmin.js`: Script to seed an initial admin user into the database.
  - `scripts/testdbconn.js`: Script to test MongoDB Atlas connection and ping the database.
- User model and roles:
  - Expanded user roles to include `treasurer`, `loan_officer`, and `member` in `models/User.js`.
  - User schema now includes name, email, and phone fields.
- Middleware:
  - Enhanced JWT authentication and role-based access control in `middleware/auth.js`.

### Changed
- `server.js`: Now loads environment variables with `dotenv`, registers new routes, and uses updated MongoDB client options.

### Technical Details
- Loan creation, repayment, and penalty logic are now available via protected API endpoints.
- Admin seeding and database connection testing scripts facilitate setup and deployment.
- User and loan management endpoints are protected by JWT authentication and role checks.

### Next Steps
- Implement account and transaction features.
- Expand error handling and validation for all endpoints.
- Add frontend integration for new loan features.

## [0.4.0] - 2025-07-11

### Added
- Savings management feature:
  - `models/Savings.js`: Mongoose model for user savings, fines, and interest.
  - `controllers/savingsController.js`: Controller for creating and fetching user savings, including fine and interest logic.
  - `routes/savings.js`: API routes for savings creation and retrieval, protected by authentication and role-based access.
- Threshold management feature:
  - `models/Threshold.js`: Mongoose model for cycle-based savings/loan thresholds.
  - `controllers/thresholdController.js`: Controller for creating and fetching threshold data.
- Loan report export:
  - `controllers/loanController.js`: Added `exportLoansReport` endpoint to export loan data as CSV (uses `json2csv`).

### Changed
- No major changes to existing features since last release.

### Fixed
- N/A

### Security
- N/A

### Technical Details
- Savings and threshold features are now available via protected API endpoints.
- Loan report export requires the `json2csv` package, which is used in the backend but not yet listed in `package.json` (should be added for production use).

### Next Steps
- Add `json2csv` to backend dependencies.
- Implement frontend integration for savings and threshold features.
- Expand reporting and analytics capabilities.

## [0.5.0] - 2025-07-12

### Added
- Modern, mobile-first admin dashboard with card-based layout for main admin actions (Loans, Savings, Thresholds, Reports), each with icons, descriptions, and navigation buttons.
- Sticky, centered navbar at the top of the UI, visible across all authenticated screens, with four main navigation items (Dashboard, Loans, Savings, Reports) and a logout button on the far right.

### Changed
- All main content and navigation are now horizontally centered using responsive containers for a consistent, mobile-first user experience.
- Updated layout to wrap all authenticated routes in a layout component that includes the navbar.

### Technical Details
- Utilized `react-icons` for modern iconography in dashboard cards and navbar.
- Used existing Card and Button UI components for consistent styling.
- Navbar and dashboard are fully responsive and visually aligned with modern UX best practices.

### Added (continued)
- Implemented detailed Add Loan form (member, amount, interest, start date, duration, notes) and Add Savings form (member, amount, date, notes) as reusable components in `src/features/loans/AddLoanForm.jsx` and `src/features/savings/AddSavingsForm.jsx`.
- Integrated these forms into the Loans and Savings pages, enabling users to add new loans and savings directly from the UI.
- Forms include success/error feedback, mobile-first styling, and clear form reset on success.
- Admin settings menu in the navbar for admins, providing access to:
  - Manage Users (navigation stub)
  - Manage Bank Balance (modal to view/update balance)
  - Change Password (modal to change current user's password)
  - Manage Payment (modal to record repayments and payouts)
- Modal components for bank balance, password, and payment management in `src/components/ui/`.
- Backend endpoints for changing password (`PUT /api/users/:id/password`) and managing payments (`POST /api/payments/repayment`, `POST /api/payments/payout`).
- Automatic bank balance updates on loan, saving, repayment, and payout actions.
- Admins can now edit user details and change user passwords directly from the Manage Users page in the frontend.
- Added Edit button to user table; form is reused for both adding and editing users, with cancel option for edit mode.
- Backend now supports updating user details via `PUT /api/users/:id` (admin only), in addition to password changes.
- Improved admin workflow for user management (create, edit, delete, password reset).

### Added - 21-07-2025
- Fines system refactored: fines are now only credited to the bank balance when paid, not when issued. Fines are tracked in a dedicated Fine model with paid/unpaid status.
- Added backend endpoints to issue fines, pay fines, fetch unpaid fines, and delete all fines (admin only).
- Fine payment workflow updated: frontend now uses a dropdown to select unpaid fines for payment.
- Added admin-only 'Delete All Fines' button to settings menu for quick reset/testing.
- Dashboard 'Total Fines' card now shows only outstanding (unpaid) fines.
- All dashboard stats endpoints are now accessible to all authenticated users, not just admins, so members can see dashboard stats.
- General UI/UX improvements for payment and fines management.

### Added - 22-07-2025
- Set up Jest and React Testing Library for both backend and frontend.
- Added Babel configuration for frontend test compatibility.
- Scaffolded unit and integration tests for backend (auth/role middleware, loans/savings controllers, report generation).
- Scaffolded component and page tests for frontend (DashboardStatsCard, Users management, PWA install banner).
- Fixed test reliability issues (async act, text matchers, placeholder ambiguity, import.meta.env mocks).
- Updated test assertions to match actual UI/component output.

### Added - 30-07-2025
- Enabled Loan Officer role to record loan repayments via the `POST /api/payments/repayment` route.
- Updated backend repayment controller logic to:
  - Accept `username` instead of `userId`
  - Lookup user document before logging transactions or applying payments
  - Automatically mark loan installments as paid and update loan status accordingly
- Enhanced loan repayment validation with:
  - Graceful handling of overpayments, completed loans, and invalid usernames
  - Accurate tracking of repayment per installment with interest
- Frontend: Updated `ManagePaymentModal.jsx` to:
  - Use `username` input instead of `userId`
  - Send correctly structured repayment and payout requests to backend
- Added full error and success state handling to loan repayment workflow

### Fixed - 30-07-2025
- Fixed CastError and ObjectId validation errors caused by mismatch between username and userId in repayment payloads
- Corrected loan transaction logging bug that prevented repayments from affecting bank balance or loan status
- Improved loan controller logic to prevent duplicate installment payments and unexpected loan overpayment

### Changed - 30-07-2025
- Reworked repayment backend to align with frontend UX expectations and simplify member lookup via username
- Updated transaction logging system to gracefully handle non-loan payments like repayments and payouts
- Improved user experience and error clarity in payment modal

### Technical Details
- `controllers/paymentController.js` now resolves user ID from username before recording repayment
- `transactionController.logTransaction()` supports new `repayment` type for audit trail
- `Loan.findOne()` queries adjusted to use correct user reference and loan filters
- Frontend `ManagePaymentModal.jsx` renamed local state from `userId` to `username` and updated payload structure

## Fixed - 31-07-2025
- Fixed Generate/View Transactions report on Reports page to allow all users to view reports. Previously only the admin could veiw
- Fixed transactions report export to Excel. Reordered the route/transactions.js to match what the controller was expecting.


## Added – 01-08-2025
- Replaced backend PDF report generation with frontend PDF exports using jspdf and jspdf-autotable for a simpler, dependency-free approach.
- Integrated frontend PDF generation for Transactions, Loans, and Savings reports.
- Refactored Reports.jsx to use exportToPDF() for generating and downloading PDFs client-side.
- Created reusable column definitions and transformation logic to ensure clean, structured PDF output.
- Added support for downloading reports in both Excel (CSV/XLSX) and PDF formats directly from the frontend.

## Changed – 01-08-2025
- Refactored src/lib/export.js to support frontend PDF generation using jspdf:
- Supports auto-detection of columns when none are provided.
- Converts nested fields like userId.username into flattened columns for easier export.
- Removed backend /api/transactions/export/pdf route and its corresponding controller function (exportTransactionsReportPDF) to eliminate unused or conflicting routes.
- Updated Reports.jsx to decouple all export functionality from the backend for PDF generation.
- Replaced pdfmake implementation in controllers (transactions and savings) with frontend-generated PDF exports using jspdf.

## Fixed – 01-08-2025
- Fixed route collision in routes/transactions.js caused by incorrect ordering of dynamic routes (:userId) before static routes like /export.
- Resolved backend crash during server startup by ensuring all route handlers reference valid exported controller functions.
- Fixed PDF export functionality for Savings and Loans reports, which previously failed due to font issues and complex backend dependencies.

Removed – 01-08-2025
- Deprecated pdfmake usage in the backend in favor of frontend PDF rendering using jspdf, which is more portable and better integrated with the React UI.
- Removed exportTransactionsReportPDF() and exportSavingsReportPDF() from backend controllers to reduce maintenance complexity.