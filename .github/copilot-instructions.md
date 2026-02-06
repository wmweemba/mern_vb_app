# Village Banking App - AI Coding Guide

## Architecture Overview

This is a **monorepo MERN stack application** (v2.0.3) with clear separation between backend and frontend:
- `mern_vb_backend/` - Express.js API server with MongoDB/Mongoose 
- `mern-vb-frontend/` - React/Vite PWA with Tailwind v4, shadcn/ui components
- Root `package.json` orchestrates both with `pnpm` workspaces and `concurrently`

## Development Workflow

**Start full stack locally:** `pnpm start` (runs both backend and frontend concurrently)
**Backend only:** `pnpm --filter mern_vb_backend dev` (nodemon on port 5000)
**Frontend only:** `pnpm --filter mern-vb-frontend dev` (Vite dev server on port 5173)
**Testing:** `pnpm test` and `pnpm test:coverage` in respective directories (Jest for both)
**Build:** `pnpm --filter mern-vb-frontend build` (Vite production build with PWA assets)- **Test patterns**: Component tests using React Testing Library, async act() for state updates
- **Environment handling**: `import.meta.env` mocks for Vite environment variables in tests
## Key Architectural Patterns

### Backend Structure
- **Controllers** follow role-based access pattern: use `allowRoles(...roles)` inline middleware or check `allowedRoles` array
- **Authentication middleware** in `/middleware/auth.js` provides `verifyToken` and `requireRole` functions
- **Models** use consistent Mongoose schemas with timestamps: `{ timestamps: true }`
- **Route protection**: Most routes use `verifyToken` + `allowRoles('admin', 'loan_officer', 'treasurer')` pattern
- **Utility pattern**: Business logic isolated in `/utils/` (see `loanCalculator.js` with dynamic duration support)
- **Loan calculation logic**: Supports both automatic duration calculation (based on amount thresholds) and custom duration
- **Partial payment handling**: Installments track `paidAmount`, support overpayment carryover to next installments
- **Smart recalculation**: Only recalculates unpaid installments when loan parameters change after creation

### Frontend Structure  
- **Global state**: React Context in `/store/auth.jsx` handles authentication with localStorage persistence
- **API integration**: Axios interceptors auto-inject JWT tokens from auth context
- **Route protection**: Built into `App.jsx` with role-based redirects, not separate `RoleRoute` component
- **Component library**: shadcn/ui v2 components in `/components/ui/` with Tailwind v4 + CVA styling
- **Import alias**: Components use `@/lib/utils` import path for the `cn()` utility function

### Role-Based Access Control (Critical)
The app has 4 user roles with strict permissions:
- **admin**: Full access to all operations
- **treasurer**: Financial operations (bank balance, payments, reports)  
- **loan_officer**: Loan management and member operations
- **member**: Read-only access to personal data

**Always check role permissions** in controllers using the `allowRoles` inline middleware pattern:
```javascript
const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};
// Usage: router.post('/', verifyToken, allowRoles('admin', 'loan_officer'), controller.method)
```

### Transaction Types & Payment System (Critical)
The system uses standardized transaction types for complete audit trails:

| Type | Description | Balance Effect | Usage Context |
|------|-------------|----------------|---------------|
| `saving` | Member savings deposits | +Bank | Savings collection operations |
| `loan` | Loan disbursements | -Bank | Loan creation/disbursement |
| `loan_payment` | Loan installment payments | +Bank | Member loan payments |
| `payment` | General payments (legacy) | +Bank | Generic transactions |
| `payout` | Money withdrawn/paid out | -Bank | Bank withdrawals |
| `fine` | Fine/penalty payments | +Bank | Fine payment operations |
| `cycle_reset` | Cycle initialization | +Bank | New cycle starting balance |

**Transaction Model Enum**: `{ type: { enum: ['loan', 'saving', 'fine', 'payment', 'loan_payment', 'payout', 'cycle_reset'] } }`

**Payment Processing Flow**:
1. Validation (user, amount, loan existence)
2. MongoDB session start for atomicity
3. Bank balance update with session
4. Transaction logging with session  
5. Loan installment updates with session
6. Session commit (atomic) or rollback (on error)

## Critical Integration Points

### Environment Variables
- Backend: `MONGODB_URI`, `PORT`, `JWT_SECRET`
- Frontend: `VITE_API_URL` (points to deployed backend or localhost:5000)
- API base URL accessed via `import { API_BASE_URL } from '../lib/utils'`

### Database Patterns
- **Mongoose models** consistently use `{ timestamps: true }` and enum validations for roles/status
- **Transaction logging**: Financial operations call `logTransaction()` and `updateBankBalance()`
- **Loan calculations**: Use `calculateLoanSchedule()` utility for consistent installment math
- **Data integrity**: Bank balance auto-adjustments when editing loans (only when no payments made)
- **Audit trail**: All financial changes logged with user, amount, type, and detailed notes
- **Username-based operations**: Controllers use `username` lookups rather than `userId` for better UX

### PWA Configuration
- **Vite PWA plugin** in `vite.config.js` generates service worker and manifest
- **Install component**: `InstallPWAButton.jsx` provides native app installation
- Icons and branding configured for standalone mobile experience

### Report Generation
- **Dual format exports**: Controllers support both CSV (json2csv) and PDF (pdfmake) generation
- **Role-restricted access**: Financial reports require treasurer+ permissions
- **Client-side exports**: Frontend generates reports using jsPDF for offline capability (moved from backend)
- **Export architecture**: Frontend PDF generation preferred over backend pdfmake for portability
- **Route ordering**: Dynamic routes (`:userId`) must come after static routes (`/export`) to prevent conflicts

### Cycle Management
- **Historical data preservation**: New cycles archive previous data while maintaining complete audit trail
- **Enhanced reporting**: Supports both current and historical cycle report generation
- **Cycle detection**: Intelligent cycle number detection from transaction logs for report selection
- **Data archiving**: Models include `cycleNumber`, `cycleEndDate`, `archived` fields for historical tracking
- **Automatic backups**: CSV reports generated before cycle transitions for data preservation

### Financial Operations Patterns
- **Fines workflow**: Fines only affect bank balance when paid, not when issued (separate Fine model)
- **Payment validation**: Graceful handling of overpayments, completed loans, invalid usernames
- **Installment tracking**: Each installment tracks paid/unpaid status with penalty calculations
- **Bank balance consistency**: All financial operations update bank balance with transaction logging

## Testing Conventions
- **Jest configuration** in both backend/frontend with `verbose: true` for detailed output
- **Test files** follow `*.test.js` pattern in `/tests/` directories
- **Coverage reports** available via `pnpm test:coverage`

## Code Style Guidelines
- **shadcn/ui patterns**: Use `cn()` utility from `/lib/utils.js` for conditional Tailwind classes
- **React components**: Functional components with hooks, destructured props
- **Mobile-first design**: Accordion-style cards for data display, responsive breakpoints
- **Form patterns**: Reusable forms for add/edit operations with success/error states
- **Modal patterns**: Settings actions in dropdown menus, click-outside-to-close behavior
- **Progressive disclosure**: Collapsed/expanded views for complex data (loan schedules, savings history)
- **Error handling**: Consistent format `{ error: 'message', details: err.message }`
- **API responses**: Include descriptive success messages and detailed error objects

## Key Files to Reference
- [mern_vb_backend/server.js](../mern_vb_backend/server.js) - Main Express server setup
- [mern-vb-frontend/src/store/auth.jsx](../mern-vb-frontend/src/store/auth.jsx) - Authentication patterns
- [mern_vb_backend/middleware/auth.js](../mern_vb_backend/middleware/auth.js) - JWT verification patterns
- [mern_vb_backend/utils/loanCalculator.js](../mern_vb_backend/utils/loanCalculator.js) - Business logic example
- [mern-vb-frontend/src/components/ui/DashboardStatsCard.jsx](../mern-vb-frontend/src/components/ui/DashboardStatsCard.jsx) - Component patterns