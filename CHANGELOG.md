# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- N/A

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
