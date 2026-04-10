# Chama360 UI Specification
**Version:** 1.1  
**Last Updated:** April 2026  
**Author:** William Mweemba  
**Purpose:** Design system and component guide for all Chama360 UI — current screens and future development.

> Claude Code must read this file before making any UI changes. Every decision about colour, spacing, typography, layout, or component structure is answered here. Do not deviate without explicit instruction.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Colour System](#2-colour-system)
3. [Typography](#3-typography)
4. [Spacing & Layout](#4-spacing--layout)
5. [Elevation & Surfaces](#5-elevation--surfaces)
6. [Component Library](#6-component-library)
7. [Navigation Patterns](#7-navigation-patterns)
8. [Responsive Behaviour](#8-responsive-behaviour)
9. [Screen-by-Screen Reference](#9-screen-by-screen-reference)
10. [Future Screens — Super Admin & Settings](#10-future-screens--super-admin--settings)
11. [Tailwind Implementation Guide](#11-tailwind-implementation-guide)
12. [Do Not Do List](#12-do-not-do-list)

---

## 1. Design Philosophy

**Warm. Trustworthy. Financial-grade.**

Chama360 handles real money for real communities. The UI must project:
- **Trust** — clean layout, legible numbers, nothing cluttered
- **Warmth** — the colour palette is earthy and inviting, not clinical
- **Clarity** — every number, status, and action must be scannable in seconds
- **Mobile-first** — the majority of users are on Android phones; desktop is secondary

**The single design rule:** If a treasurer can't read a number clearly in a meeting room on a mid-range Android, the design is wrong.

---

## 2. Colour System

### 2.1 Core Palette

All colours are extracted from the Uizard mockups. Use these exact values everywhere. Use CSS custom properties for consistency.

```css
:root {
  /* Brand */
  --color-brand-primary: #C8501A;       /* Burnt orange — CTAs, active nav, badges */
  --color-brand-primary-hover: #A83F12; /* Darker burnt orange for hover states */
  --color-brand-primary-light: #F5E6DC; /* Light orange tint — avatar backgrounds, highlights */

  /* Surfaces */
  --color-bg-page: #F0EDE8;             /* Off-white warm page background */
  --color-bg-card: #FFFFFF;             /* Pure white — card surfaces */
  --color-bg-dark: #1C1510;             /* Near-black brown — top navbar, hero card, bottom nav */
  --color-bg-dark-secondary: #2A1F18;   /* Slightly lighter dark — hover states in dark nav */

  /* Text */
  --color-text-primary: #1C1510;        /* Near-black brown — all body text, headings */
  --color-text-secondary: #6B6560;      /* Mid brown-grey — labels, subtitles, meta text */
  --color-text-muted: #A09990;          /* Light brown-grey — placeholder, disabled */
  --color-text-on-dark: #FFFFFF;        /* White — text on dark surfaces */
  --color-text-on-dark-muted: #A09070;  /* Muted warm white — secondary text on dark surfaces */
  --color-text-brand: #C8501A;          /* Orange — "View All" links, inline accent text */

  /* Status */
  --color-status-paid-bg: #E8F5E8;      /* Pale green */
  --color-status-paid-text: #2D7A2D;    /* Dark green */
  --color-status-pending-bg: #FFF0E0;   /* Pale amber */
  --color-status-pending-text: #B85A00; /* Dark amber-orange */
  --color-status-overdue-bg: #FDECEA;   /* Pale red */
  --color-status-overdue-text: #C62828; /* Dark red */
  --color-status-inactive-bg: #F0EDE8;  /* Page bg — neutral */
  --color-status-inactive-text: #6B6560;/* Secondary text */

  /* Numerics — positive/negative transactions */
  --color-amount-positive: #1C7A1C;     /* Green — savings in, repayments in */
  --color-amount-negative: #1C1510;     /* Default text — loan disbursements out */

  /* Borders */
  --color-border-default: #E8E4DF;      /* Subtle card borders, dividers */
  --color-border-dashed: #C8C4BF;       /* Dashed borders — empty states */

  /* Trial Banner */
  --color-trial-bg: #FFF8F0;            /* Warm cream */
  --color-trial-border: #F5C8A0;        /* Light orange border */
  --color-trial-text: #8B4513;          /* Dark brown-orange */
}
```

### 2.2 Colour Usage Rules

| Element | Colour |
|---|---|
| Page background | `--color-bg-page` |
| Card background | `--color-bg-card` |
| Top navbar | `--color-bg-dark` |
| Bottom nav bar (mobile) | `--color-bg-dark` |
| Left sidebar (desktop) | `--color-bg-card` with right border |
| Active nav item (desktop) | `--color-brand-primary-light` bg, `--color-brand-primary` icon+text |
| Primary buttons | `--color-brand-primary` bg, white text |
| Destructive buttons | `--color-status-overdue-bg` bg, `--color-status-overdue-text` text |
| Ghost/secondary buttons | white bg, `--color-border-default` border, `--color-text-primary` text |
| Amount positive | `--color-amount-positive` (prefixed with `+`) |
| Amount negative | `--color-text-primary` (prefixed with `-`) |
| Hero stat card | `--color-bg-dark` bg, white text |
| Regular stat cards | `--color-bg-card` bg |

### 2.3 Avatar Colour Assignment

Member avatars use initials. Assign background colour based on first letter of name, cycling through this set:

```js
const AVATAR_COLORS = [
  { bg: '#F5E6DC', text: '#C8501A' }, // Orange (brand)
  { bg: '#E8F0F8', text: '#2C5F8A' }, // Blue
  { bg: '#EAF5E8', text: '#2D7A2D' }, // Green
  { bg: '#F5EAF0', text: '#8A2C5F' }, // Purple
  { bg: '#F8F0E8', text: '#8A5F2C' }, // Brown
  { bg: '#E8F5F0', text: '#2C8A6B' }, // Teal
];
// Usage: AVATAR_COLORS[charCodeAt(0) % AVATAR_COLORS.length]
```

---

## 3. Typography

### 3.1 Font Stack

```css
:root {
  --font-primary: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'DM Mono', 'Courier New', monospace;
}
```

**Google Fonts import:**
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

> **Why DM Sans:** It is geometric, readable, warm without being informal. It pairs well with large financial numbers and scales cleanly from 12px mobile labels to 48px hero amounts. It matches the rounded, friendly-but-professional tone of the mockups.

### 3.2 Type Scale

| Token | Size | Weight | Line Height | Use |
|---|---|---|---|---|
| `--text-hero` | 36–48px | 700 | 1.1 | Hero balance on dashboard |
| `--text-display` | 28px | 700 | 1.2 | Page titles, group name |
| `--text-heading` | 20px | 600 | 1.3 | Section headings (Recent Contributions, Loan Applications) |
| `--text-subheading` | 16px | 600 | 1.4 | Card titles, member names |
| `--text-body` | 15px | 400 | 1.5 | Body text, descriptions |
| `--text-label` | 13px | 500 | 1.4 | Form labels, table headers (ALL CAPS, letter-spacing: 0.05em) |
| `--text-caption` | 12px | 400 | 1.4 | Meta info (Savings · Cycle 12), timestamps |
| `--text-amount` | 18–22px | 700 | 1.2 | Transaction amounts, stat card values |

### 3.3 Specific Typography Rules

- **Stat card labels** (ACTIVE LOANS, NEXT MEETING): `--text-label` size, uppercase, letter-spacing 0.08em, `--color-text-secondary`
- **Stat card values**: `--text-display` or `--text-heading` weight 700, `--color-text-primary`
- **Transaction amounts**: right-aligned, `--text-amount`, bold. Positive = green. Negative/neutral = primary text colour.
- **Member names in lists**: `--text-subheading`, weight 600
- **Transaction meta** (Savings · Cycle 12): `--text-caption`, `--color-text-secondary`
- **Section "View All" links**: `--text-body`, `--color-text-brand`, no underline, underline on hover

---

## 4. Spacing & Layout

### 4.1 Spacing Scale

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
}
```

### 4.2 Page Layout

**Mobile (< 768px):**
- Top navbar: fixed, full width, height 60px
- Page content: padding 16px, top padding 76px (clears navbar), bottom padding 96px (clears bottom nav)
- Bottom nav: fixed, full width, height 72px

**Desktop (≥ 768px):**
- Left sidebar: fixed, width 240px
- Top bar: fixed, left offset 240px, height 64px
- Main content: margin-left 240px, padding 24px 32px, top 64px
- No bottom nav on desktop

### 4.3 Content Width

- Mobile: full width within 16px horizontal padding
- Tablet (768–1024px): full width within 24px padding
- Desktop: max-content-width 1200px, centred within the main area
- Stat card grids: always 2-column on mobile, up to 3-column on desktop

### 4.4 Border Radius

```css
:root {
  --radius-sm: 8px;    /* Badges, pills, small elements */
  --radius-md: 12px;   /* Buttons, input fields, small cards */
  --radius-lg: 16px;   /* Main cards, list containers */
  --radius-xl: 20px;   /* Hero card, bottom nav bar, top navbar */
  --radius-full: 9999px; /* Circular avatars, fully rounded buttons */
}
```

---

## 5. Elevation & Surfaces

Chama360 uses a flat elevation system — no drop shadows. Depth is created through background colour contrast only.

| Layer | Background | Border | Use |
|---|---|---|---|
| Page | `--color-bg-page` | none | Base layer |
| Card | `--color-bg-card` | none | All cards float on the page bg — no explicit border needed because the colour contrast is sufficient |
| Dark surface | `--color-bg-dark` | none | Navbar, bottom nav, hero balance card |
| Input | `--color-bg-card` | 1px `--color-border-default` | Form inputs |
| Dashed container | `--color-bg-card` | 1px dashed `--color-border-dashed` | Empty states |

> **No box shadows anywhere.** The warm off-white page background provides enough contrast that white cards read clearly without shadows. This is intentional — it keeps the UI feeling lightweight and fast on low-end Android devices.

---

## 6. Component Library

### 6.1 Navbar (Mobile)

```
Height: 60px
Background: --color-bg-dark
Border radius on container: --radius-xl (pill shape — the entire bar is rounded)
Padding: 0 16px
Contents:
  Left: Logo mark (white stacked layers icon in --color-brand-primary circle) + "Chama360" in --color-brand-primary, font-weight 700, 18px
  Right: Search icon (white, 22px) + Hamburger menu icon (white, 22px), gap 16px
```

### 6.2 Bottom Navigation (Mobile)

```
Height: 72px
Background: --color-bg-dark
Border radius: --radius-xl (pill shape, floats above page with 12px margin on sides)
Position: fixed bottom, 12px from bottom edge, 12px horizontal margin
5 items:
  1. Dashboard (grid icon) — active state: --color-brand-primary filled square bg, white icon
  2. Members (people icon)
  3. + Add (white square pill button, centred, prominent — this is the primary action)
  4. Reports (pie chart icon)
  5. Settings (gear icon)
Inactive icons: --color-text-on-dark-muted, 22px
Active icon background: --color-brand-primary, border-radius --radius-md, 40x40px
The + button: white background, --color-bg-dark icon, border-radius --radius-md, 48x48px, slightly elevated above the bar
```

### 6.3 Desktop Sidebar

```
Width: 240px
Background: --color-bg-card
Right border: 1px --color-border-default
Logo at top: same as mobile navbar logo, padding 20px 16px
Section label "MENU": --text-label, uppercase, --color-text-secondary, padding 16px 16px 8px
Nav items:
  Height: 44px
  Padding: 0 12px
  Icon: 20px, left-aligned
  Label: --text-body, weight 500
  Inactive: --color-text-secondary icon, --color-text-primary label
  Active: --color-brand-primary-light background, --color-brand-primary icon + label, border-radius --radius-md
  Hover: --color-bg-page background

Bottom of sidebar:
  Trial status card (when trial active):
    Background: --color-trial-bg
    Border: 1px --color-trial-border
    Border radius: --radius-md
    "Trial Active" label: weight 600, 14px, --color-trial-text
    "X days remaining": --text-caption, --color-text-secondary
    "Upgrade" button: ghost style, full width, --radius-md
```

### 6.4 Stat Cards

**Hero Balance Card (dark):**
```
Background: --color-bg-dark
Border radius: --radius-xl
Padding: 20px
Label: "TOTAL GROUP BALANCE" — --text-label, uppercase, --color-text-on-dark-muted
Value: --text-hero (40–48px), weight 700, white, line-height 1.1
  Currency code (KSh/ZMW) on its own line above the number OR inline
Growth indicator: "↑ X% from last cycle" — --text-caption, --color-amount-positive (green)
```

**Standard Stat Cards (light):**
```
Background: --color-bg-card
Border radius: --radius-lg
Padding: 16px
Label: --text-label, uppercase, letter-spacing 0.08em, --color-text-secondary
Value: 28–32px, weight 700, --color-text-primary
Layout: 2-column grid on mobile, gap 12px
```

### 6.5 Transaction / Contribution List Row

```
Container: white card, --radius-lg, padding 16px
Each row:
  Height: auto, min 64px
  Padding: 12px 0
  Divider between rows: 1px --color-border-default (no divider on last row)
  
Layout (left to right):
  [Avatar 44px] [Name + Meta] [Amount + Status badge]

Avatar:
  Size: 44px circle
  Initials: 2 chars, --text-label, weight 600
  Colours: from avatar colour assignment table

Name + Meta:
  Name: --text-subheading, weight 600, --color-text-primary
  Meta line: "Savings · Cycle 12" — --text-caption, --color-text-secondary
  
Amount:
  Right-aligned
  Size: 18px, weight 700
  Positive: --color-amount-positive, prefixed "+"
  Neutral: --color-text-primary

Status Badge:
  Below amount, right-aligned
  PAID: --color-status-paid-bg, --color-status-paid-text, --radius-full, padding 3px 10px, --text-caption weight 600 uppercase
  PENDING: --color-status-pending-bg, --color-status-pending-text, same sizing
  OVERDUE: --color-status-overdue-bg, --color-status-overdue-text, same sizing
```

### 6.6 Desktop Activity Table

For desktop dashboard Recent Activity section:

```
Container: white card, --radius-lg, padding 20px
Table: full width, no outer border
Columns: MEMBER | TYPE | DATE | STATUS | AMOUNT
  All headers: --text-label, uppercase, letter-spacing 0.08em, --color-text-secondary
  
Row height: 52px
Row border: 1px --color-border-default (bottom only)
No hover row highlight needed (this is read-only)

MEMBER cell: avatar (32px) + name side by side, gap 10px
TYPE cell: --text-body, --color-text-primary
DATE cell: --text-body, --color-text-secondary
STATUS cell: status badge (same as list badge)
AMOUNT cell: right-aligned, --text-amount, weight 700, colour per positive/negative rule
```

### 6.7 Buttons

**Primary (CTA):**
```
Background: --color-brand-primary
Text: white, --text-body, weight 600
Border radius: --radius-full (fully rounded pill)
Padding: 14px 28px
Hover: --color-brand-primary-hover
Active: scale(0.98)
Width: full-width on mobile modals and forms; auto-width on desktop
```

**Secondary / Ghost:**
```
Background: transparent
Border: 1.5px --color-border-default
Text: --color-text-primary, --text-body, weight 500
Border radius: --radius-full
Padding: 12px 24px
Hover: --color-bg-page background
```

**Destructive:**
```
Background: --color-status-overdue-bg
Border: 1px --color-status-overdue-text
Text: --color-status-overdue-text, weight 600
Same sizing as secondary
```

**Icon Button (navbar actions):**
```
Width/Height: 40px
Border radius: --radius-sm
Background: transparent on dark surfaces, --color-bg-page on light
Icon: 22px
```

### 6.8 Form Inputs

```
Height: 48px
Background: --color-bg-card
Border: 1px --color-border-default
Border radius: --radius-md
Padding: 0 14px
Font: --text-body, --color-text-primary
Placeholder: --color-text-muted

Focus state:
  Border: 1.5px --color-brand-primary
  No box shadow

Label above input:
  --text-label, uppercase, letter-spacing 0.05em, --color-text-secondary
  Margin bottom: 6px

Select / Dropdown:
  Same as input
  Arrow indicator: custom chevron in --color-text-secondary
```

### 6.9 Empty State

```
Container: --color-bg-card, border 1px dashed --color-border-dashed, --radius-lg
Padding: 32px 24px
Layout: centred
Text: "--text-body", --color-text-secondary (e.g. "No pending applications")
CTA button below text: Primary button style
```

### 6.10 Trial Banner

```
Position: top of main content area (below navbar), or sticky within content
Background: --color-trial-bg
Border: 1px --color-trial-border
Border radius: --radius-md
Padding: 12px 16px
Layout: "Trial Active · X days remaining" left | "Upgrade" button right
Text: --text-caption, --color-trial-text, weight 500
Button: small primary pill button
```

### 6.11 Section Header with "View All"

```
Layout: flex, space-between, align-items center
Margin bottom: 12px
Title: --text-heading, weight 700, --color-text-primary
"View All": --text-body, --color-text-brand, weight 500, no underline
```

### 6.12 Onboarding Step Indicator

```
4 pills in a row, centred
Active: --color-brand-primary, width 32px, height 6px, --radius-full
Inactive: --color-border-default, width 24px, height 6px, --radius-full
Gap: 6px
```

### 6.13 Page Header (Desktop)

```
Layout: flex, space-between, align-items flex-start
Group name: --text-display, weight 700, --color-text-primary
Subtitle: "Cycle 12 · October 2026" — --text-body, --color-text-secondary, margin-top 4px
Right side: "+ New Transaction" primary button
```

### 6.14 Status Badges (standalone)

```
Padding: 4px 12px
Border radius: --radius-full
Font: --text-caption, weight 600, uppercase, letter-spacing 0.06em
PAID: --color-status-paid-bg / --color-status-paid-text
PENDING: --color-status-pending-bg / --color-status-pending-text
OVERDUE: --color-status-overdue-bg / --color-status-overdue-text
TRIAL ACTIVE: --color-trial-bg / --color-trial-text
PAID (account subscription): --color-status-paid-bg / --color-status-paid-text
```

### 6.15 SlideoverDrawer

Used for all data-entry forms: Add Loan, Add Savings, Manage Payment, Manage Bank Balance, Add Fine/Penalty.

```
Desktop:
  Slides in from the RIGHT edge of the screen
  Width: 420px fixed
  Height: full viewport height
  Background: --color-bg-card
  Left edge: 1px --color-border-default
  Backdrop: rgba(0,0,0,0.3) covering the rest of the page
  Clicking backdrop closes the drawer

Mobile:
  Slides UP from the bottom of the screen
  Height: 90vh (leaves a peek of the page behind)
  Border radius: --radius-xl on top-left and top-right only
  Background: --color-bg-card
  Backdrop: rgba(0,0,0,0.3)

Internal layout (both):
  Header: title (--text-heading, weight 700) left + X close button right
    Padding: 20px 20px 16px
    Border bottom: 1px --color-border-default
  Body: scrollable, padding 20px
    Fields stacked vertically, 16px gap
    Labels above each input (--text-label uppercase style)
  Footer: sticky to bottom of drawer
    Padding: 16px 20px
    Border top: 1px --color-border-default
    Background: --color-bg-card
    Primary action button: full-width, --radius-md (not pill — pill looks odd in footers)
    Cancel link: centred below button, --text-caption, --color-text-secondary
```

**Batch entry behaviour:** After a successful submission, the drawer does NOT close automatically. It clears the form fields and shows a brief success toast ("Saved ✓") so the user can immediately enter the next record. A "Done" button in the footer closes the drawer when finished.

### 6.16 MemberSelect Component

Replaces all raw username text inputs and Clerk username pickers in forms.

```
Appearance: looks like a standard input (same height, border, radius as 6.8)
Placeholder: "Search member name..."
On focus / on type:
  Dropdown appears below, --color-bg-card, --radius-md, border 1px --color-border-default
  Each result row: avatar (32px) + member name + role badge
  Max 5 results visible, scrollable
  Highlight matching characters in --color-brand-primary
On select:
  Input shows selected member name
  Avatar appears inside the input on the left
  X button appears on right to clear selection
No result state: "No members found" in --color-text-muted, --text-caption
```

### 6.17 NewCycleBanner Component

Replaces "Begin New Cycle" from the Operations dropdown. Lives at the TOP of the Dashboard, above all other content.

```
Only rendered when: the current cycle end date is within 7 days OR has passed
Background: --color-trial-bg (#FFF8F0)
Border: 1px --color-trial-border (#F5C8A0)
Border radius: --radius-md
Padding: 14px 16px
Layout: icon + text left | "Begin New Cycle" button right

Icon: calendar/cycle icon, 20px, --color-brand-primary
Text: "Cycle [N] ends [date]. Ready to begin Cycle [N+1]?" — --text-body, --color-trial-text
Button: small primary pill button ("Begin New Cycle")

On button click: opens a CONFIRMATION MODAL (see 6.18) before any action fires.
Never trigger Begin New Cycle with a single tap.
```

### 6.18 Confirmation Modal

Used for: Begin New Cycle, any destructive action, Mark Paid in admin panel.

```
Overlay: rgba(0,0,0,0.4), full viewport
Card: --color-bg-card, --radius-xl, max-width 400px, centred vertically and horizontally
Padding: 24px
Title: --text-heading, weight 700, --color-text-primary
Body: --text-body, --color-text-secondary, margin-top 8px
Button row: margin-top 24px, flex, gap 12px, justify-end
  Cancel: ghost button
  Confirm: primary button (destructive style if dangerous)

For "Begin New Cycle" specifically:
  Title: "Begin Cycle [N+1]?"
  Body: "This will close Cycle [N] and start a new cycle. This cannot be undone."
  Confirm button: --color-brand-primary (not destructive red — this is intentional, not dangerous)
```

---

## 7. Navigation Patterns

### 7.1 Mobile Navigation Items

| Icon | Label | Route / Action |
|---|---|---|
| Grid | Dashboard | `/dashboard` |
| People | Members | `/members` |
| + (prominent) | Add / Actions | Opens Action Sheet (see 7.4) |
| Pie chart | Reports | `/reports` |
| Gear | Settings | `/settings` |

### 7.2 Desktop Sidebar Items

| Icon | Label | Route |
|---|---|---|
| Grid | Dashboard | `/dashboard` |
| People | Members | `/members` |
| Wallet | Savings | `/savings` |
| Dollar sign | Loans | `/loans` |
| Document | Reports | `/reports` |
| Gear | Settings | `/settings` |

> There is NO Operations nav item. All operational actions live in the Action Sheet (see 7.4).
> Account-level actions (Account Settings, Sign Out) live in the top-right user avatar dropdown only.

### 7.3 Desktop Top Bar

```
Left: Group name (breadcrumb if in sub-page)
Right: User avatar (initials circle, 40px) — clicking opens dropdown:
  - Account Settings (links to Clerk account page)
  - Sign Out
No bell/notifications icon in v1.
```

### 7.4 Action Sheet — The Central Command (IMPORTANT)

The + button (mobile bottom nav) and a "+ New" button (desktop, top-right of main content area) both open the same Action Sheet. This replaces the Operations dropdown entirely.

**Action Sheet items:**

| Icon | Label | Behaviour |
|---|---|---|
| Dollar sign | Add Loan | Opens Loan SlideoverDrawer |
| Piggy bank | Add Savings | Opens Savings SlideoverDrawer |
| Credit card | Manage Payment | Opens Payment SlideoverDrawer |
| Bank | Manage Bank Balance | Opens Bank Balance SlideoverDrawer |
| Alert | Add Fine / Penalty | Opens Fine SlideoverDrawer |

**"Begin New Cycle" is NOT in the Action Sheet.** It lives as a `NewCycleBanner` component on the dashboard only (see 9.3).

**Action Sheet UI spec:**
```
Mobile: bottom sheet, slides up from bottom, rounded top corners --radius-xl
Desktop: small dropdown panel below the "+ New" button, --radius-lg, min-width 220px
Background: --color-bg-card
Each item: icon (20px, --color-brand-primary) + label (--text-body, weight 500) + right arrow
Item height: 52px, padding 0 16px
Divider between items: 1px --color-border-default
Backdrop (mobile): rgba(0,0,0,0.3), tapping backdrop closes the sheet
```

---

## 8. Responsive Behaviour

### 8.1 Breakpoints

```css
/* Mobile first */
/* sm  */ @media (min-width: 640px)  { }
/* md  */ @media (min-width: 768px)  { } /* Sidebar appears, bottom nav hides */
/* lg  */ @media (min-width: 1024px) { }
/* xl  */ @media (min-width: 1280px) { }
```

### 8.2 Component Behaviour by Breakpoint

| Component | Mobile (< 768px) | Desktop (≥ 768px) |
|---|---|---|
| Navigation | Top navbar + bottom pill nav | Left sidebar (240px) + top bar |
| Stat cards | 2-column grid | 3-column grid |
| Hero balance | Full-width dark card | Full-width dark card (capped at readable width) |
| Transaction list | Card with stacked rows | Card with table layout (columns visible) |
| Onboarding wizard | Full screen, centred card | Centred card with max-width 520px |
| Welcome/pricing page | Single column | Two-column feature cards |
| Group name in header | Truncated in top navbar | Full name in page header |

### 8.3 PWA-Specific Rules

- All tap targets minimum 44x44px
- No hover-only affordances (all interactive elements must work on touch)
- Inputs must not cause zoom on focus (font-size ≥ 16px in inputs)
- Bottom nav must not be obscured by iOS home indicator (add env(safe-area-inset-bottom) padding)

```css
.bottom-nav {
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}
```

---

## 9. Screen-by-Screen Reference

### 9.1 Welcome / Pricing Page (`/welcome`)

**Purpose:** Public-facing, first impression. Converts visitors to trial signups.

**Structure (top to bottom):**
1. Navbar: `--color-bg-dark` pill, logo left, "Log in" ghost button + "Start 15-Day Trial" primary button right
2. Hero section: eyebrow label ("Digital Village Banking") in `--color-text-brand` uppercase · H1 heading (2–3 lines, bold, `--color-text-primary`) · subtitle body text · Single CTA button ("Create Your Group")
3. Feature preview: 2 cards with category label + title + description (matching the Uizard mockup — image placeholder top, label + title + description below)
4. Core Features section: "CORE FEATURES" eyebrow + H2 + subtitle · 3-column card grid (Transparent Savings / Smart Loan Origination / Financial Reporting)
5. Pricing section (to be added): 2 cards (Starter / Standard)
6. Footer

**Key detail:** The CTA button on the hero is left-aligned on desktop, centred on mobile.

### 9.2 Onboarding Wizard (`/onboarding`)

**Purpose:** Guide a new admin through 4-step group setup.

**Structure:**
- Centred layout, white card, max-width 480px, `--radius-xl`
- Top: Chama360 "C" logo mark circle in `--color-brand-primary`
- "Setup Your Chama" heading + "Step X of 4: [Step Name]" subtitle
- Step indicator pills (4 pills, active = orange, inactive = border)
- Form card (white, padded 24px)
- "Continue to [Next Step]" primary full-width button at bottom of card

**Step labels:**
- Step 1: Group Details
- Step 2: Lending Rules  
- Step 3: Fine Rules
- Step 4: Confirm & Launch

**Input styling:** Matches 6.8 spec. Dropdowns for currency and cycle type. No floating labels — labels always above.

### 9.3 Dashboard (`/dashboard`)

**Mobile layout (top to bottom):**
1. Navbar (fixed top)
2. Hero balance card (dark, full width, `--radius-xl`)
3. 2-column stat cards (Active Loans / Next Meeting)
4. Section header "Recent Contributions" + "View All"
5. Contributions list card
6. Section header "Loan Applications"
7. Empty state or loan list
8. Bottom nav (fixed)

**Desktop layout:**
1. Top bar with group name + "+ New Transaction" button
2. 3-column stat cards (Total Balance / Active Loans Out / Upcoming Meeting — the meeting card uses `--color-bg-dark`)
3. "Recent Activity" section header
4. Full-width table card (MEMBER / TYPE / DATE / STATUS / AMOUNT columns)

**Key detail on desktop:** The Upcoming Meeting card is the dark card (`--color-bg-dark`) in the 3-column stat grid. It contains the date and a "Record Cycle" CTA button in `--color-brand-primary`.

### 9.4 Members (`/members`)

Not fully mocked up — follow these rules:
- List view (not grid) on mobile
- Each row: avatar + name + role badge + phone number + action menu (···)
- Role badges: Admin (brand orange), Treasurer (blue), Loan Officer (green), Member (grey)
- "Add Member" FAB on mobile (or "+ Add Member" button top-right on desktop)
- Search bar at top of list

### 9.5 Savings (`/savings`)

- Cycle selector at top (dropdown or segmented control)
- Summary card: total contributions this cycle, % of members paid
- Member contribution list: same row format as dashboard but with explicit PAID/PENDING status per member
- "Record Contribution" primary button

### 9.6 Loans (`/loans`)

- Tab bar: Active Loans / Applications / History
- Active loans list: member name + amount disbursed + amount remaining + next due date + status
- Applications: pending application cards with Approve/Reject actions
- "New Loan Application" primary button

### 9.7 Reports (`/reports`)

- Period selector (This Cycle / Last Cycle / Custom)
- Summary stat cards (Total Saved / Total Lent / Interest Collected)
- Simple bar chart or list breakdown
- Export buttons (PDF / Excel) — ghost pill buttons with icons

### 9.8 Settings (`/settings`)

Group-level settings, accessible to Admin role only.

**Sections:**
1. Group Profile (name, meeting day, cycle length)
2. Financial Rules (interest rate, interest method, loan limit multiplier)
3. Fine Rules (fine amount, fine type)
4. Members & Roles (link to members management)
5. Billing (trial status, upgrade CTA)
6. Danger Zone (close group — destructive, red section)

Each section is a white card with a section title and editable fields. Edit mode: fields become inputs. Save/Cancel buttons appear at the bottom of the card being edited.

---

## 10. Future Screens — Super Admin & Settings

### 10.1 Super Admin Dashboard (`/admin`)

**Access:** SuperAdmin role only (seeded account). Bypasses all group scoping.

**Purpose:** William's operational view across all groups on the platform.

**Layout:** Same desktop sidebar pattern, but with different nav items:

| Icon | Label | Route |
|---|---|---|
| Grid | Overview | `/admin` |
| People | All Groups | `/admin/groups` |
| Chart | Platform Analytics | `/admin/analytics` |
| Bell | Notifications | `/admin/notifications` |
| Gear | Platform Settings | `/admin/settings` |

**Overview page stat cards:**
- Total Groups (all time)
- Active Trials (count + days range)
- Paid Groups (MRR — ZMW)
- Groups Expiring This Week (urgent attention)

**Colour treatment for admin:** Same colour system — do NOT create a separate dark/different palette for admin. The admin panel must feel like the same product, not a separate tool.

**Groups table (`/admin/groups`):**

Columns: Group Name | Admin Email | Created | Trial Expires | Status | Members | Action

Status badges:
- TRIAL ACTIVE: `--color-trial-bg` / `--color-trial-text`
- PAID: `--color-status-paid-bg` / `--color-status-paid-text`
- EXPIRED: `--color-status-overdue-bg` / `--color-status-overdue-text`

Action column: "Mark Paid" button (ghost, small) | "View" button (ghost, small)

The "Mark Paid" button should open a confirmation modal before any action — do not use inline triggers.

**Confirmation modal pattern:**
```
Overlay: rgba(0,0,0,0.4)
Card: white, --radius-xl, max-width 400px, centred
Title: --text-heading, weight 700
Body: --text-body, --color-text-secondary
Buttons: row, gap 12px, right-aligned
  Cancel: ghost button
  Confirm: primary button (or destructive if dangerous action)
```

### 10.2 Platform Settings (`/admin/settings`)

Sections:
1. Pricing Configuration (Starter price / Standard price — editable ZMW values)
2. Trial Duration (number of days — currently 15)
3. Platform Notifications (email for new signups, payment alerts)
4. Super Admin Account (display only — name, email, Clerk user ID)
5. Maintenance Mode (toggle — shows a banner to all users when on)

Follow the same card-per-section pattern as group-level Settings.

### 10.3 Group Settings (Expanded from `/settings`)

Build this as a tabbed or sectioned settings page with distinct visual separation between sections. Use the section card pattern:

```
Section card:
  Background: --color-bg-card
  Border radius: --radius-lg
  Padding: 20px 24px
  Section title: --text-heading, weight 700, border-bottom 1px --color-border-default, padding-bottom 12px, margin-bottom 16px
  Fields: label above, input below, 16px vertical gap between fields
  Edit button: top-right of card, ghost small button with pencil icon
  When in edit mode: Save + Cancel buttons at card bottom
```

---

## 11. Tailwind Implementation Guide

### 11.1 Tailwind Config Extensions

Add to `tailwind.config.js`:

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#C8501A',
          hover: '#A83F12',
          light: '#F5E6DC',
        },
        surface: {
          page: '#F0EDE8',
          card: '#FFFFFF',
          dark: '#1C1510',
          'dark-secondary': '#2A1F18',
        },
        text: {
          primary: '#1C1510',
          secondary: '#6B6560',
          muted: '#A09990',
          brand: '#C8501A',
        },
        status: {
          'paid-bg': '#E8F5E8',
          'paid-text': '#2D7A2D',
          'pending-bg': '#FFF0E0',
          'pending-text': '#B85A00',
          'overdue-bg': '#FDECEA',
          'overdue-text': '#C62828',
        },
        border: {
          default: '#E8E4DF',
          dashed: '#C8C4BF',
        },
        trial: {
          bg: '#FFF8F0',
          border: '#F5C8A0',
          text: '#8B4513',
        },
        amount: {
          positive: '#1C7A1C',
        },
      },
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['DM Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '20px',
      },
    },
  },
};
```

### 11.2 Common Class Patterns

```
Page background:       bg-surface-page min-h-screen
Card:                  bg-surface-card rounded-lg p-4
Dark card:             bg-surface-dark rounded-xl p-5 text-white
Section heading:       text-xl font-bold text-text-primary
Label (uppercase):     text-xs font-medium uppercase tracking-widest text-text-secondary
Primary button:        bg-brand-primary hover:bg-brand-hover text-white font-semibold rounded-full px-7 py-3.5 transition-colors
Ghost button:          border border-border-default text-text-primary rounded-full px-6 py-3 hover:bg-surface-page transition-colors
Avatar:                w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold
Status badge PAID:     bg-status-paid-bg text-status-paid-text text-xs font-semibold uppercase rounded-full px-2.5 py-0.5 tracking-wide
Status badge PENDING:  bg-status-pending-bg text-status-pending-text ... (same pattern)
Amount positive:       text-amount-positive font-bold
Mobile bottom nav:     fixed bottom-3 left-3 right-3 bg-surface-dark rounded-xl h-[72px] flex items-center
Desktop sidebar:       fixed left-0 top-0 bottom-0 w-60 bg-surface-card border-r border-border-default
```

### 11.3 Responsive Utility Pattern

```jsx
// Bottom nav — mobile only
<nav className="md:hidden fixed bottom-3 left-3 right-3 ...">

// Sidebar — desktop only  
<aside className="hidden md:flex fixed left-0 ...">

// Stat card grid
<div className="grid grid-cols-2 md:grid-cols-3 gap-3">

// Content offset for desktop sidebar
<main className="md:ml-60 pt-16">
```

---

## 12. Do Not Do List

These are explicit anti-patterns. Claude Code must not introduce these.

| ❌ Do NOT | ✅ Do instead |
|---|---|
| Use Inter, Roboto, or system fonts | Use DM Sans via Google Fonts |
| Add box-shadows to cards | Use background contrast only |
| Use pure black (#000000) or pure white background | Use --color-bg-dark and --color-bg-page |
| Create separate colour palette for admin screens | Reuse the same design system |
| Use gradient backgrounds | Use flat solid colours only |
| Use a horizontal top nav bar | Use sidebar (desktop) + bottom nav (mobile) |
| Create an Operations nav item or dropdown | Put all operational actions in the Action Sheet |
| Put "Begin New Cycle" in any menu or dropdown | Use NewCycleBanner on dashboard only |
| Trigger "Begin New Cycle" with a single tap | Always require the Confirmation Modal |
| Put Settings in a dropdown | Settings is a full page at /settings |
| Put Sign Out in the sidebar | Sign Out lives in the user avatar dropdown only |
| Use the Clerk username picker widget in forms | Use the MemberSelect component |
| Use side-panel forms (form left, list right) | Use SlideoverDrawer for all data entry |
| Auto-close the drawer after saving | Keep drawer open for batch entry, show toast |
| Place the settings gear in the sidebar on desktop | Settings gear in sidebar links to /settings page |
| Use bottom navigation on desktop | Use sidebar navigation on desktop |
| Round input font-size below 16px | Keep inputs at 16px to prevent iOS zoom |
| Use hover-only interactions | Always include touch-compatible interactions |
| Use red for general "negative" amounts | Only use red for overdue/error statuses |
| Hardcode ZMW or KSh currency strings | Pull currency from GroupSettings |
| Use table layout for mobile transaction lists | Use card rows on mobile, table on desktop |
| Create confirmation-less destructive actions | Always show Confirmation Modal |
| Add new nav items without updating this spec | Update UI_SPEC.md first |
| Use rainbow/multi-colour stat cards | Use white cards with dark text (one dark hero card) |

---

*End of Chama360 UI Specification v1.0*  
*Update this document whenever a new screen is designed or a design decision is made.*  
*This is the single source of truth for all UI decisions.*
