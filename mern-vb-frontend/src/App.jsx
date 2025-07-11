import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Loans from './pages/Loans';
import Savings from './pages/Savings';
import Thresholds from './pages/Thresholds';
import Reports from './pages/Reports';

// Role-based dashboard stubs
const AdminDashboard = () => <Dashboard title="Admin Dashboard" />;
const TreasurerDashboard = () => <Dashboard title="Treasurer Dashboard" />;
const LoanOfficerDashboard = () => <Dashboard title="Loan Officer Dashboard" />;
const MemberDashboard = () => <Dashboard title="Member Dashboard" />;

// Role-based route component
function RoleRoute({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/unauthorized" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  // Redirect to role dashboard after login
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  let dashboard;
  switch (user.role) {
    case 'admin':
      dashboard = <AdminDashboard />;
      break;
    case 'treasurer':
      dashboard = <TreasurerDashboard />;
      break;
    case 'loan_officer':
      dashboard = <LoanOfficerDashboard />;
      break;
    case 'member':
      dashboard = <MemberDashboard />;
      break;
    default:
      dashboard = <div>Unknown role</div>;
  }
  return (
    <Routes>
      <Route path="/dashboard" element={dashboard} />
      <Route path="/loans" element={<Loans />} />
      <Route path="/savings" element={<Savings />} />
      <Route path="/thresholds" element={<Thresholds />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
