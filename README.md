# Chama360 — Village Banking App

Group savings, loans, fines, and cycle management for village banking groups in Zambia.

**Live app:** https://chama360.nxhub.online
**API:** https://api.chama360.nxhub.online
**Current version:** 3.1.2 — Production

---

## What It Does

Chama360 helps village banking group treasurers and members manage:

- **Savings** — member deposits tracked per cycle
- **Loans** — disbursement, repayment schedules, reducing-balance or flat-rate interest
- **Fines** — issue, track, and mark fines paid
- **Bank balance** — live balance updated atomically with every transaction
- **Reports** — PDF and Excel export of group financials per cycle
- **Cycle management** — open and close savings cycles, profit sharing
- **Member management** — invite members by email, role-based access control
- **Group onboarding** — self-serve setup with configurable settings per group
- **Trial & billing** — trial period enforcement, upgrade flow via mobile money / bank

---

## Repository Structure

```
mern_vb_app/                    ← monorepo root
├── package.json                ← root scripts (pnpm workspaces + concurrently)
├── mern_vb_backend/            ← Express / Node.js API
│   ├── server.js               ← entry point
│   ├── controllers/            ← business logic
│   ├── models/                 ← Mongoose schemas
│   ├── routes/                 ← Express route definitions
│   ├── middleware/             ← auth.js (Clerk JWT), roles.js (RBAC), checkTrial.js
│   ├── utils/loanCalculator.js ← interest calculation (reducing balance + flat rate)
│   ├── config/paymentDetails.js← mobile money / bank payment config
│   └── scripts/                ← one-off audit / repair / seed scripts
└── mern-vb-frontend/           ← React + Vite PWA
    └── src/
        ├── App.jsx             ← route definitions + Clerk auth guards
        ├── features/           ← domain-grouped components (loans, savings, etc.)
        ├── components/         ← shared UI (modals, layout, trial banner, etc.)
        ├── pages/              ← page-level route components
        ├── store/              ← Zustand global state
        └── lib/export.js       ← PDF / CSV / Excel generation (frontend-side)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19, Vite 7 |
| Styling | Tailwind CSS 4, shadcn/ui (@radix-ui) |
| State management | Zustand 5 |
| Forms & validation | react-hook-form + Zod 4 |
| Routing | React Router DOM 7 |
| Auth (frontend) | @clerk/clerk-react |
| Icons | lucide-react, react-icons |
| Dates | dayjs |
| Notifications | sonner |
| Reports | jspdf + jspdf-autotable, xlsx |
| PWA | vite-plugin-pwa + Workbox |
| Backend runtime | Node.js, Express 5 |
| Database | MongoDB via Mongoose 8 |
| Auth (backend) | @clerk/express (JWT verification) |
| Webhooks | Svix (Clerk webhook signature verification) |
| Email | Resend |
| Package manager | pnpm |
| Deployment | Coolify (self-hosted, both services) |

---

## Roles & Permissions

| Role | Capabilities |
|---|---|
| `super_admin` | Platform-wide access, all groups, no trial restrictions |
| `admin` | Full group access, user management, cycle resets, delete fines |
| `treasurer` | Bank balance, payments, reports, fines |
| `loan_officer` | Loans, savings, member ops, repayments |
| `member` | Read-only personal data |

---

## Local Development

### Prerequisites
- Node.js 22+
- pnpm

### Setup

```bash
git clone https://github.com/wmweemba/mern_vb_app.git
cd mern_vb_app
pnpm install

# Run both frontend + backend concurrently
pnpm start
```

### Run individually

```bash
# Backend only (nodemon)
cd mern_vb_backend && pnpm dev

# Frontend only (Vite HMR)
cd mern-vb-frontend && pnpm dev
```

**Frontend:** http://localhost:5173
**Backend:** http://localhost:5000

---

## Environment Variables

**Backend** — `mern_vb_backend/.env`:
```
MONGODB_URI=
PORT=5000
JWT_SECRET=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
RESEND_API_KEY=
ADMIN_EMAIL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

**Frontend** — `mern-vb-frontend/.env`:
```
VITE_API_URL=https://api.chama360.nxhub.online/api
VITE_CLERK_PUBLISHABLE_KEY=
```

> Note: `VITE_*` variables are baked into the bundle at build time by Vite. They must be set as build-time environment variables in your deployment platform.

---

## Financial Logic

### Bank Balance Formula
```
Bank Balance = Starting Balance (cycle_reset)
             + Savings Deposits       (+)
             + Loan Payments          (+)
             + Fine Payments          (+)
             - Loan Disbursements     (-)
             - Payouts                (-)
```

### Interest Methods (configurable per group via GroupSettings)
- **Reducing balance** — interest on remaining outstanding principal each installment (default)
- **Flat rate** — interest on original loan amount every installment

### Data Integrity Rules
- All payment operations use MongoDB sessions (atomic transactions)
- Bank balance is never updated without a simultaneous Transaction record
- Failed operations auto-rollback

---

## Testing

```bash
# Backend
cd mern_vb_backend && pnpm test
cd mern_vb_backend && pnpm test:coverage

# Frontend
cd mern-vb-frontend && pnpm test
```

---

## Key Maintenance Scripts (`mern_vb_backend/scripts/`)

| Script | Purpose |
|---|---|
| `auditBankBalance.js` | Verify bank balance matches transaction history |
| `auditCurrentCycle.js` | Audit active cycle data integrity |
| `seedGroupSettings.js` | Seed GroupSettings for a group |
| `seedSuperAdmin.js` | Create a super admin account |
| `activateGroup.js` | Activate a group from trial to paid subscription |

---

## Deployment

Both services run on **Coolify** (self-hosted), deployed automatically from the `main` branch.

| Service | URL |
|---|---|
| Frontend | https://chama360.nxhub.online |
| Backend | https://api.chama360.nxhub.online |

**Backend Coolify settings:**
- Base directory: `mern_vb_backend`
- Build command: *(empty — nixpacks detects pnpm and installs automatically)*
- Start command: `node server.js`

**Frontend Coolify settings:**
- Base directory: `mern-vb-frontend`
- Build command: `pnpm run build`
- Start command: *(static files served by Caddy)*
- Required build env vars: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_URL`

---

## PWA

Chama360 is a fully installable Progressive Web App:
- Installable on Android, iOS, and desktop (Add to Homescreen)
- Offline support for static assets via Workbox service worker
- Custom manifest with icons (192×192 and 512×512)

---

## License
MIT
