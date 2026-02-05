# Village Banking App

A modern, full-stack MERN (MongoDB, Express, React, Node.js) application for managing village banking operations. The app supports member management, loans, savings, fines, reports, and more, with a beautiful, mobile-first UI and robust backend.

## Features
- **Role-based dashboard** for admins, treasurers, loan officers, and members
- **Loans & savings management** with forms, history, edit functionality, and role restrictions
- **Bank balance tracking** and real-time updates
- **Fines/penalties system** with payment and admin controls
- **Advanced Cycle Management** - Reset banking cycles while preserving complete historical data with automatic backup reports
- **Enhanced Reports System** - Generate current or historical cycle reports with intelligent data detection and comprehensive export options
- **Historical Data Access** - Complete audit trail with cycle-based reporting and automatic legacy data detection
- **Responsive, mobile-first UI** with modern card layouts and intuitive navigation
- **Authentication** with JWT and secure password management
- **PWA support**: installable, offline-ready, with custom splash, shortcuts, and install banner

## System Configuration & Key Definitions

### User Roles & Permissions
The application uses a strict role-based access control system:

| Role | Permissions |
|------|------------|
| **admin** | Full access to all operations, user management, cycle resets |
| **treasurer** | Financial operations (bank balance, payments, reports, fines) |
| **loan_officer** | Loan management, member operations, savings management |
| **member** | Read-only access to personal data and loan details |

### Transaction Types & Payment Processing

#### Supported Transaction Types
The system recognizes these transaction types for complete audit trail:

| Type | Description | Balance Effect | Usage |
|------|-------------|----------------|--------|
| `saving` | Member savings deposits | +Bank | When members deposit money |
| `loan` | Loan disbursements to members | -Bank | When loans are given out |
| `loan_payment` | Loan installment payments | +Bank | When members pay loan installments |
| `payment` | General payments (legacy) | +Bank | Generic payment transactions |
| `payout` | Money withdrawn/paid out | -Bank | When money leaves the system |
| `fine` | Fine/penalty payments | +Bank | When members pay fines |
| `cycle_reset` | Cycle initialization balance | +Bank | Starting balance for new cycle |

#### Payment Processing Flow
1. **Validation**: User, amount, and loan verification
2. **Calculation**: Determine which installments to pay
3. **Atomic Transaction**: All updates use MongoDB sessions
4. **Bank Balance Update**: Automatic balance adjustment
5. **Transaction Logging**: Complete audit trail
6. **Frontend Refresh**: Real-time UI updates via global events

#### Payment Modal Types
The payment modal supports three distinct operations:

| Payment Type | Description | API Endpoint |
|--------------|-------------|--------------|
| **Loan Payment** | Pay loan installments | `/api/payments/repayment` |
| **Payout** | Withdraw money from bank | `/api/payments/payout` |
| **Fine Payment** | Pay outstanding fines | `/api/payments/pay-fine` |

### Financial Data Flow

#### Loan Management
- **Creation**: Loan amount debited from bank balance
- **Payments**: Sequential installment payment (Month 1 → 2 → 3 → 4)
- **Overpayment Handling**: Excess amounts applied to next installments
- **Reversals**: Atomic reversal with bank balance restoration

#### Bank Balance Calculation
```
Bank Balance = Starting Balance 
             + All Savings Deposits
             + All Loan Payments  
             + All Fine Payments
             - All Loan Disbursements
             - All Payouts
```

#### Data Integrity Features
- **Atomic Transactions**: MongoDB sessions prevent partial updates
- **Corruption Detection**: Validates payment amounts vs installment totals
- **Automatic Rollback**: Failed operations automatically undo changes
- **Audit Trail**: Complete transaction logging with timestamps and notes

### Frontend State Management

#### Global Event System
The application uses a custom event system for real-time updates:

| Event | Trigger | Listeners |
|-------|---------|-----------|
| `loanDataChanged` | Payment/reversal success | Loans page, Dashboard |

#### Authentication Flow
1. **JWT Storage**: Tokens stored in localStorage with auto-refresh
2. **Route Protection**: Role-based redirects built into main App component
3. **API Integration**: Axios interceptors auto-inject JWT tokens
4. **Session Management**: Automatic logout on token expiration

## New in v2.0+
- **Enhanced Reporting**: Choose between current cycle and historical cycle data with intelligent cycle detection
- **Comprehensive Data Display**: Detailed loan installment tracking, savings with interest calculations, and transaction history
- **Improved Data Management**: Robust handling of legacy data and missing fields with automatic fallbacks
- **Better User Experience**: Streamlined cycle management and intuitive report selection interface
- **Editable Savings**: Authorized users can now edit existing savings entries with full audit trail (v2.0.1)

## Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, React Router, Axios
- **Backend**: Node.js, Express, MongoDB (Mongoose)
- **PWA**: Vite PWA plugin, service worker, manifest

## Deployment
- **Frontend**: [Netlify](https://www.netlify.com/) (static hosting, HTTPS, CI/CD)
- **Backend**: [Render](https://render.com/) (Node.js server, HTTPS, environment variables)
- **Full Deployment**: [Netlify] (https://villagebanking.netlify.app/) (Deployed App)
- **Pitch Deck**: [Gamma] (https://gamma.app/docs/Village-Banking-App-n6plewc9jc5eixw) (Pitch Deck Presentaion)
- Test login account: Username: test, Password: vbtest

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- pnpm or npm
- MongoDB Atlas or local MongoDB instance

### Environment Variables
#### Backend (`mern_vb_backend/.env`):
```
MONGODB_URI=your_mongodb_connection_string
PORT=5000
JWT_SECRET=your_jwt_secret
```
#### Frontend (`mern-vb-frontend/.env`):
```
VITE_API_URL=https://your-backend-on-render.com/api
```

### Local Development
1. **Clone the repo:**
   ```sh
   git clone https://github.com/yourusername/mern_village_banking_app.git
   cd mern_village_banking_app
   ```
2. **Install dependencies:**
   ```sh
   cd mern_vb_backend && pnpm install
   cd ../mern-vb-frontend && pnpm install
   ```
3. **Start backend:**
   ```sh
   cd ../mern_vb_backend
   pnpm run dev
   ```
4. **Start frontend:**
   ```sh
   cd ../mern-vb-frontend
   pnpm run dev
   ```
5. **Access the app:**
   - Frontend: [http://localhost:5173](http://localhost:5173)
   - Backend: [http://localhost:5000](http://localhost:5000)

### Production Build
- **Frontend:**
  ```sh
  pnpm run build
  pnpm run preview
  ```
- **Backend:**
  ```sh
  NODE_ENV=production pnpm start
  ```

## PWA Features
- Installable on mobile and desktop (Add to Homescreen)
- Offline support for static assets and cached data
- Custom splash screen and theme color
- App shortcuts for quick actions
- Install banner/snackbar for easy installation

## Deployment Notes
- **Frontend:** Deploy the `mern-vb-frontend/dist` folder to Netlify. Set `VITE_API_URL` to your Render backend URL in Netlify environment variables.
- **Backend:** Deploy the `mern_vb_backend` folder to Render. Set all secrets (MongoDB URI, JWT secret) in Render’s environment settings.
- **CORS:** Ensure backend CORS allows your Netlify domain.
- **Routing:** Add a `_redirects` file to the frontend `public/` folder for React Router support:
  ```
  /*    /index.html   200
  ```

## License
MIT

---

*This project is built for modern, secure, and scalable village banking management. Contributions and feedback are welcome!*
