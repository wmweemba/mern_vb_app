# Village Banking App - AI Coding Guide

## Architecture Overview

This is a **monorepo MERN stack application** with clear separation between backend and frontend:
- `mern_vb_backend/` - Express.js API server with MongoDB/Mongoose
- `mern-vb-frontend/` - React/Vite PWA with Tailwind CSS and shadcn/ui components
- Root `package.json` orchestrates both with `pnpm` workspaces and `concurrently`

## Development Workflow

**Start full stack locally:** `pnpm start` (runs both backend and frontend concurrently)
**Backend only:** `pnpm --filter mern_vb_backend dev` (nodemon on port 5000)
**Frontend only:** `pnpm --filter mern-vb-frontend dev` (Vite dev server on port 5173)
**Testing:** `pnpm test` in respective directories (Jest for both backend/frontend)

## Key Architectural Patterns

### Backend Structure
- **Controllers** follow role-based access pattern: check `allowedRoles` array before operations
- **Authentication middleware** in `/middleware/auth.js` provides `verifyToken` and `requireRole` functions
- **Models** use consistent Mongoose schemas with timestamps: `{ timestamps: true }`
- **Utility pattern**: Business logic like loan calculations isolated in `/utils/` (see `loanCalculator.js`)

### Frontend Structure  
- **Global state**: React Context in `/store/auth.jsx` handles authentication with localStorage persistence
- **API integration**: Axios interceptors auto-inject JWT tokens from auth context
- **Route protection**: `RoleRoute` component enforces role-based access (`admin`, `treasurer`, `loan_officer`, `member`)
- **Component library**: shadcn/ui components in `/components/ui/` with Tailwind + CVA styling

### Role-Based Access Control (Critical)
The app has 4 user roles with strict permissions:
- **admin**: Full access to all operations
- **treasurer**: Financial operations (bank balance, payments, reports)  
- **loan_officer**: Loan management and member operations
- **member**: Read-only access to personal data

**Always check role permissions** in controllers using the `allowedRoles` pattern:
```javascript
const allowedRoles = ['admin', 'loan_officer', 'treasurer'];
if (!allowedRoles.includes(req.user.role)) {
  return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
}
```

## Critical Integration Points

### Environment Variables
- Backend: `MONGODB_URI`, `PORT`, `JWT_SECRET`
- Frontend: `VITE_API_URL` (points to deployed backend or localhost:5000)
- API base URL accessed via `import { API_BASE_URL } from '../lib/utils'`

### Database Patterns
- **Mongoose models** consistently use `{ timestamps: true }` and enum validations for roles/status
- **Transaction logging**: Financial operations call `logTransaction()` and `updateBankBalance()`
- **Loan calculations**: Use `calculateLoanSchedule()` utility for consistent installment math

### PWA Configuration
- **Vite PWA plugin** in `vite.config.js` generates service worker and manifest
- **Install component**: `InstallPWAButton.jsx` provides native app installation
- Icons and branding configured for standalone mobile experience

### Report Generation
- **Dual format exports**: Controllers support both CSV (json2csv) and PDF (pdfmake) generation
- **Role-restricted access**: Financial reports require treasurer+ permissions
- **Client-side exports**: Frontend also generates reports using jsPDF for offline capability

## Testing Conventions
- **Jest configuration** in both backend/frontend with `verbose: true` for detailed output
- **Test files** follow `*.test.js` pattern in `/tests/` directories
- **Coverage reports** available via `pnpm test:coverage`

## Code Style Guidelines
- **shadcn/ui patterns**: Use `cn()` utility from `/lib/utils.js` for conditional Tailwind classes
- **React components**: Functional components with hooks, destructured props
- **Error handling**: Consistent format `{ error: 'message', details: err.message }`
- **API responses**: Include descriptive success messages and detailed error objects

## Key Files to Reference
- [mern_vb_backend/server.js](mern_vb_backend/server.js) - Main Express server setup
- [mern-vb-frontend/src/store/auth.jsx](mern-vb-frontend/src/store/auth.jsx) - Authentication patterns
- [mern_vb_backend/middleware/auth.js](mern_vb_backend/middleware/auth.js) - JWT verification patterns
- [mern_vb_backend/utils/loanCalculator.js](mern_vb_backend/utils/loanCalculator.js) - Business logic example
- [mern-vb-frontend/src/components/ui/DashboardStatsCard.jsx](mern-vb-frontend/src/components/ui/DashboardStatsCard.jsx) - Component patterns