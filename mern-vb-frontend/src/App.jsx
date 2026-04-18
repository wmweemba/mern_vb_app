import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { useAuth } from './store/auth';
import Dashboard from './pages/Dashboard';
import Loans from './pages/Loans';
import Savings from './pages/Savings';
import Thresholds from './pages/Thresholds';
import Reports from './pages/Reports';
import Users from './pages/Users';
import MembersPage from './pages/MembersPage';
import UpgradePage from './pages/UpgradePage';
import Settings from './pages/Settings';
import AppShell from './components/layout/AppShell';
import SignInPage from './pages/SignIn';
import SignUpPage from './pages/SignUp';
import Onboarding from './pages/Onboarding';
import Welcome from './pages/Welcome';
import InviteAccept from './pages/InviteAccept';
import OperationsPage from './pages/OperationsPage';

// Layout using AppShell
const Layout = ({ children }) => <AppShell>{children}</AppShell>;

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
    </div>
  );
}

// Protects routes — requires Clerk sign-in AND group membership.
// Waits for the auth/me fetch to complete (authLoading) before rendering children,
// so page components never fire API calls before the auth token is set.
function ProtectedRoute({ children }) {
  const { isLoaded, isSignedIn, needsOnboarding, authLoading, isSuperAdmin } = useAuth();
  if (!isLoaded || authLoading) return <LoadingSpinner />;
  return (
    <>
      <SignedIn>
        {needsOnboarding && !isSuperAdmin ? <Navigate to="/welcome" replace /> : children}
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

// Onboarding guard — only renders wizard if user passed through /welcome first.
// Evaluated as a component (not inline JSX) so sessionStorage is read at render time,
// not at element-creation time during parent render.
function OnboardingRoute() {
  if (!sessionStorage.getItem('trialAccepted')) {
    return <Navigate to="/welcome" replace />;
  }
  return <Onboarding />;
}

// Role-based route guard
function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <LoadingSpinner />;
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route path="/invite" element={<InviteAccept />} />

      {/* Welcome — promotional holding page for new users */}
      <Route path="/welcome" element={
        <>
          <SignedIn><Welcome /></SignedIn>
          <SignedOut><RedirectToSignIn /></SignedOut>
        </>
      } />

      {/* Onboarding wizard — only reachable after clicking CTA on /welcome */}
      <Route path="/onboarding" element={
        <>
          <SignedIn><OnboardingRoute /></SignedIn>
          <SignedOut><RedirectToSignIn /></SignedOut>
        </>
      } />

      {/* Protected app routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout><Dashboard /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/loans" element={
        <ProtectedRoute>
          <Layout><Loans /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/savings" element={
        <ProtectedRoute>
          <Layout><Savings /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/thresholds" element={
        <ProtectedRoute>
          <Layout><Thresholds /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute>
          <Layout><Reports /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute>
          <Layout>
            <RoleRoute roles={['admin']}>
              <Users />
            </RoleRoute>
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/members" element={
        <ProtectedRoute>
          <Layout>
            <RoleRoute roles={['admin', 'treasurer', 'loan_officer']}>
              <MembersPage />
            </RoleRoute>
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <Layout><Settings /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/upgrade" element={
        <ProtectedRoute>
          <Layout><UpgradePage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/operations" element={
        <ProtectedRoute>
          <Layout>
            <RoleRoute roles={['admin', 'treasurer', 'loan_officer']}>
              <OperationsPage />
            </RoleRoute>
          </Layout>
        </ProtectedRoute>
      } />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Navigate to="/sign-in" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

// AuthProvider lives in main.jsx — App.jsx just renders routes
function App() {
  return <AppRoutes />;
}

export default App;
