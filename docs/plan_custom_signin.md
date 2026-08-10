# Implementation Plan — Custom Sign-In Page

**Owner:** Sonnet (execution)
**Source prompts:** Session 3 Planning Prompt (Opus planning). Cross-referenced against `CLAUDE.md` and `UI_SPEC.md`.
**Scope:** Replace the current minimal `<SignIn />` wrapper with a branded two-column sign-in page. No changes to auth logic, protected routes, onboarding, or backend.

---

## Audit findings (what is already true in the codebase)

Before writing steps, these facts were verified by reading the repo. Implementers should trust them — they were checked at plan time.

1. **Clerk SDK:** `@clerk/clerk-react` at `^5.61.3` (Clerk v5). Props `signInUrl`, `signUpUrl`, `afterSignOutUrl` are supported on `ClerkProvider`.
2. **Router file:** `mern-vb-frontend/src/App.jsx` defines all routes. Uses React Router DOM 7 (`<Routes>` / `<Route>`).
3. **Existing routes already present** in `App.jsx`:
   - `<Route path="/sign-in/*" element={<SignInPage />} />` (line 90) — public, no auth guard. **Reuse this, do not add a new route.**
   - `<Route path="/sign-up/*" element={<SignUpPage />} />` (line 91) — public, no auth guard.
   - `<Route path="/login" element={<Navigate to="/sign-in" replace />} />` — alias already in place.
4. **Existing sign-in file:** `src/pages/SignIn.jsx`. Default-exports a component named `SignInPage`. Current contents are a minimal centred wrapper around Clerk's `<SignIn />`. **Modify this existing file** — do not create a new `SignInPage.jsx` alongside it (that would duplicate the import). Page-file naming convention across `src/pages/` is bare (`Dashboard.jsx`, `Loans.jsx`, `SignIn.jsx`) — stick with `SignIn.jsx`.
5. **`ClerkProvider` location:** `src/main.jsx`, line 53. Currently receives only `publishableKey` and `onLoadError`. **`signInUrl`, `signUpUrl`, `afterSignOutUrl` are NOT set.** They must be added.
6. **Sign-out handler:** `src/components/layout/TopBar.jsx` line 44 — `signOut(() => navigate('/sign-in'))`. Already redirects correctly to `/sign-in`. **No change needed** to TopBar. Adding `afterSignOutUrl="/sign-in"` on `ClerkProvider` covers any Clerk-initiated sign-outs (session expiry, etc.).
7. **Design tokens:** Tailwind 4 with CSS-variable-backed utilities defined in `src/index.css` (`@theme inline` block). Available utilities relevant to this task:
   - `bg-brand-primary` → `#C8501A`
   - `bg-surface-card` / `bg-surface-dark` / `bg-surface-page`
   - `text-brand` / `text-text-primary` / `text-text-secondary` / `text-text-on-dark-muted`
   - `border-border-default`
   - Radius: `rounded-sm|md|lg|xl` = 8/12/16/20px
8. **Breakpoint convention:** Tailwind default `md:` (≥768px) per `UI_SPEC.md` §8.1 and existing components (`TopBar.jsx` uses `md:left-60`, `md:px-8`; layout collapses to mobile below `md`).
9. **Font family:** DM Sans is the project default (`--font-sans`). `font-sans` utility already resolves to DM Sans; no explicit font override needed.
10. **Brand-coloured dark surface for the left panel:** The prompt specifies `#1E1A16`, which is close to but not identical to the existing token `--color-surface-dark` (`#1C1510`). Use the prompt's exact hex (`#1E1A16`) inline, since it was explicitly requested.
11. **Attribution muted colour:** Prompt specifies `#A89080` — does not match any existing token. Use the prompt's exact hex inline.

---

## Deliverables overview

| # | File | Action | Summary |
|---|------|--------|---------|
| 1 | `mern-vb-frontend/src/pages/SignIn.jsx` | Modify (full rewrite) | Replace body with two-column layout + branded copy + Clerk `<SignIn />` with `appearance` prop. |
| 2 | `mern-vb-frontend/src/main.jsx` | Modify (add props) | Add `signInUrl`, `signUpUrl`, `afterSignOutUrl` to `<ClerkProvider>`. |
| 3 | `mern-vb-frontend/src/App.jsx` | No change | Existing `/sign-in/*` public route is correct. |
| 4 | `mern-vb-frontend/src/components/layout/TopBar.jsx` | No change | Existing `signOut(() => navigate('/sign-in'))` already redirects correctly. `afterSignOutUrl` on provider covers Clerk-initiated sign-outs. |

No other files are modified. No new files are created.

---

## Step-by-step implementation

### Step 1 — Update `ClerkProvider` props

**File:** `mern-vb-frontend/src/main.jsx`

**Locate** line 53:
```jsx
<ClerkProvider publishableKey={clerkKey} onLoadError={() => setClerkError(true)}>
```

**Replace** with:
```jsx
<ClerkProvider
  publishableKey={clerkKey}
  onLoadError={() => setClerkError(true)}
  signInUrl="/sign-in"
  signUpUrl="/sign-in"
  afterSignOutUrl="/sign-in"
>
```

**Why `signUpUrl="/sign-in"`:** The prompt requires a single page to handle both sign-in and sign-up flows. `<SignIn />` shows the sign-up form inline when the user clicks "Sign up"; setting `signUpUrl` here ensures any external redirect (e.g. Clerk callbacks) also lands on `/sign-in`.

**Do not** remove the existing `/sign-up/*` route in `App.jsx` — it is out of scope for this task and leaving it in place is harmless (users will never be routed there once `signUpUrl="/sign-in"` is set).

---

### Step 2 — Rewrite `SignIn.jsx` with the two-column layout

**File:** `mern-vb-frontend/src/pages/SignIn.jsx`

**Replace the entire file contents** with the code below. Keep the default export name `SignInPage` to stay compatible with the existing import in `App.jsx` (`import SignInPage from './pages/SignIn';`).

```jsx
import { SignIn } from '@clerk/clerk-react';

const clerkAppearance = {
  variables: {
    colorPrimary: '#C8501A',
    colorBackground: '#ffffff',
    borderRadius: '8px',
    fontFamily: 'inherit',
  },
  elements: {
    rootBox: 'w-full',
    card: 'shadow-none border-0 p-0 bg-transparent',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    footer: 'hidden',
  },
};

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans">
      {/* LEFT PANEL — branding (desktop only) */}
      <aside
        className="hidden md:flex relative overflow-hidden md:w-1/2 lg:w-[45%] px-12 py-10"
        style={{ backgroundColor: '#1E1A16' }}
      >
        {/* Decorative orange circles */}
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            backgroundColor: '#C8501A',
            width: 220,
            height: 220,
            top: -80,
            left: -80,
          }}
        />
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            backgroundColor: '#C8501A',
            width: 180,
            height: 180,
            bottom: -60,
            right: -60,
          }}
        />

        {/* Content stack */}
        <div className="relative z-10 flex flex-col justify-between w-full">
          {/* Wordmark top-left */}
          <div
            className="text-white"
            style={{ fontSize: 15, fontWeight: 500 }}
          >
            Chama360
          </div>

          {/* Centred testimonial block */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <p
              className="uppercase"
              style={{
                color: '#C8501A',
                fontSize: 11,
                letterSpacing: '0.1em',
                marginBottom: 20,
              }}
            >
              Built for treasurers. Loved by members.
            </p>
            <blockquote
              className="text-white"
              style={{
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 1.25,
                marginBottom: 28,
              }}
            >
              “Our meetings used to start with arguments. Now we just open the app.”
            </blockquote>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-full text-white"
                style={{
                  backgroundColor: '#C8501A',
                  width: 36,
                  height: 36,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                WM
              </div>
              <div className="flex flex-col">
                <span
                  className="text-white"
                  style={{ fontSize: 13, fontWeight: 500 }}
                >
                  William M.
                </span>
                <span style={{ color: '#A89080', fontSize: 12 }}>
                  Treasurer, William's Village Bank · Lusaka
                </span>
              </div>
            </div>
          </div>

          {/* Spacer to keep content vertically balanced */}
          <div aria-hidden />
        </div>
      </aside>

      {/* RIGHT PANEL — sign-in form */}
      <main className="flex-1 flex items-center justify-center bg-white px-6 py-10 md:px-12">
        <div className="w-full max-w-md">
          {/* Mobile-only wordmark (left panel is hidden on mobile) */}
          <div
            className="md:hidden mb-8 text-text-primary"
            style={{ fontSize: 18, fontWeight: 700 }}
          >
            Chama360
          </div>

          <p
            className="uppercase"
            style={{
              color: '#C8501A',
              fontSize: 11,
              letterSpacing: '0.1em',
              marginBottom: 14,
            }}
          >
            Free 15-day trial
          </p>
          <h1
            className="text-text-primary"
            style={{
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.3,
              marginBottom: 12,
            }}
          >
            Your Village Bank deserves better than a spreadsheet.
          </h1>
          <p
            className="text-text-secondary"
            style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}
          >
            Track savings, calculate loans, and let every member check their own balance — without calling the treasurer.
          </p>

          <SignIn
            routing="path"
            path="/sign-in"
            afterSignInUrl="/dashboard"
            afterSignUpUrl="/dashboard"
            appearance={clerkAppearance}
          />
        </div>
      </main>
    </div>
  );
}
```

**Implementation notes for Sonnet:**
- Use the inline `style` values given above for the specific pixel sizes, letter-spacing, and exact hex values from the prompt. Using Tailwind arbitrary values (`text-[11px]`) would also work but inline styles keep the values visually grouped and easy to audit against the spec.
- `font-sans` on the outer `<div>` lets the rest of the page inherit DM Sans (already the project default, but added explicitly for clarity).
- The quote uses Unicode curly quotes (`“` `”`) — keep those as typographic quotes for correct rendering.
- `afterSignInUrl="/dashboard"` and `afterSignUpUrl="/dashboard"` match the existing behaviour and preserve the `ProtectedRoute` → onboarding redirect chain in `App.jsx`.

---

### Step 3 — Verify `App.jsx` route is unchanged

**File:** `mern-vb-frontend/src/App.jsx`

No change. The existing route at line 90 (`<Route path="/sign-in/*" element={<SignInPage />} />`) is already public (not wrapped in `ProtectedRoute`) and uses path-based routing (`/*`), which Clerk requires for internal multi-step flows (sign-up, factor verification). Do **not** wrap it in any guard. Do **not** change the import.

**Confirm by reading the file** and matching the existing line verbatim.

---

### Step 4 — Verify sign-out redirect

**File:** `mern-vb-frontend/src/components/layout/TopBar.jsx`

No change. Line 44 already reads:
```js
const handleSignOut = () => signOut(() => navigate('/sign-in'));
```
This is the avatar dropdown → Sign Out path. The callback navigates to `/sign-in` after Clerk completes the sign-out.

The new `afterSignOutUrl="/sign-in"` on `ClerkProvider` (Step 1) is belt-and-braces — it covers any Clerk-initiated sign-out (e.g. session expiry, 401 from backend) that bypasses the manual button.

**Sonnet action:** read the file to confirm the line is present as-is. If it has been changed since this plan was written, stop and report back rather than editing.

---

### Step 5 — Known risks and fallbacks

**Risk A — Clerk appearance class stripping may cause layout issues.**
The `appearance.elements.card: 'shadow-none border-0 p-0 bg-transparent'` removes Clerk's card chrome so the form buttons and fields sit flush inside the right panel. If after deployment the form visually overlaps the headline copy or the OAuth buttons lose their spacing:
- **Fallback 1:** remove only `p-0` so the card keeps internal padding while still hiding the box: `card: 'shadow-none border-0 bg-transparent'`.
- **Fallback 2:** restore the card chrome and wrap it in a light container: drop the `card`, `headerTitle`, `headerSubtitle`, `footer` overrides entirely and let Clerk render its default card inside `max-w-md`.
Do not invest time tuning this before the first deploy — ship, view it in a browser, then adjust.

**Risk B — Clerk's internal sign-up link.**
When the user clicks "Sign up" inside `<SignIn />`, Clerk navigates within `/sign-in/*` (e.g. `/sign-in/continue`) using the path-based router. This is handled by the `/*` wildcard in the existing route. No extra work required. If Clerk instead redirects to a bare `/sign-up`, the `signUpUrl="/sign-in"` prop on the provider will cause it to come back to `/sign-in` anyway.

**Risk C — Mobile viewport.**
The left panel uses `hidden md:flex`. On mobile the main panel becomes full width. Verify on a 375px-wide viewport that:
- The wordmark shows above the headline.
- The Clerk form fits without horizontal scroll.
- Input font-size is ≥16px so iOS Safari doesn't zoom (this is Clerk's default — should be fine).

---

## Smoke test checklist (output this to the operator when done)

After deployment to `https://chama360.nxhub.online`, the operator should verify:

- [ ] Navigating to `chama360.nxhub.online` while logged out redirects to `/sign-in` (not to `accounts.chama360.nxhub.online`).
- [ ] `/sign-in` renders both panels on a desktop viewport (≥768px wide): dark left panel with testimonial + avatar, white right panel with headline + Clerk form.
- [ ] On a mobile viewport (<768px wide), only the right panel is visible, with the Chama360 wordmark appearing above the headline.
- [ ] Google OAuth sign-in completes and lands on `/dashboard` (or `/welcome` if onboarding is required).
- [ ] Email sign-in completes and lands on `/dashboard` (or `/welcome` for new users).
- [ ] Clicking "Sign Out" in the top-right avatar dropdown redirects to `/sign-in` — **not** to `accounts.chama360.nxhub.online`.
- [ ] Clicking an invite email link still lands on `/invite`, and post-sign-up the user ends up in the app.
- [ ] The "Sign up" link inside the Clerk form opens the sign-up flow on the same `/sign-in` page (no full-page redirect to `accounts.chama360.nxhub.online`).
- [ ] Orange brand colour (`#C8501A`) is reflected in Clerk's primary button, not Clerk's default blue/purple.

---

## Verification loop (per `CLAUDE.md`)

This is a UI-only change. Steps from the project verification loop that apply:

1. **Tests:** `cd mern-vb-frontend && pnpm test` — no test files target `SignIn.jsx` currently, but run the suite to confirm nothing else regresses.
2. **Financial audit:** N/A (no financial code touched).
3. **Console.log sweep:** `grep -n "console.log" mern-vb-frontend/src/pages/SignIn.jsx mern-vb-frontend/src/main.jsx` — must return empty.
4. **Hardcoded values:** N/A (no currency, rates, or limits touched).
5. **State the result** explicitly before claiming done.

---

Is this plan self-contained for a fresh Sonnet session?
