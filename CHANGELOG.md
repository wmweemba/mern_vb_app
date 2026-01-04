# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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