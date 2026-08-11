import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MockAuthContext } from './testAuthContext';

// Real lib/utils.js reads import.meta.env (Vite-only syntax babel-jest can't parse).
jest.mock('../lib/utils', () => ({
  API_BASE_URL: 'http://localhost:5000/api',
  cn: (...args) => args.filter(Boolean).join(' '),
}));

jest.mock('axios', () => ({
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  interceptors: { request: { use: jest.fn(), eject: jest.fn() }, response: { use: jest.fn(), eject: jest.fn() } },
}));

jest.mock('@clerk/clerk-react', () => ({
  SignedIn: ({ children }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
  useUser: () => ({ user: { fullName: 'Super Admin User', primaryEmailAddress: { emailAddress: 'sa@example.com' } } }),
  useAuth: () => ({ getToken: () => Promise.resolve('token'), isSignedIn: true, isLoaded: true }),
  useClerk: () => ({ signOut: jest.fn() }),
}));

jest.mock('../store/auth', () => {
  const React = require('react');
  const { MockAuthContext } = require('./testAuthContext');
  return { useAuth: () => React.useContext(MockAuthContext) };
});

// Stub out page components — this test only cares about which layout/sidebar
// wraps them, not their real content (which pulls in Vite-only import.meta usage
// Jest can't transform).
jest.mock('../pages/Dashboard', () => () => null);
jest.mock('../pages/Loans', () => () => null);
jest.mock('../pages/Savings', () => () => null);
jest.mock('../pages/Thresholds', () => () => null);
jest.mock('../pages/Reports', () => () => null);
jest.mock('../pages/Users', () => () => null);
jest.mock('../pages/MembersPage', () => () => null);
jest.mock('../pages/UpgradePage', () => () => null);
jest.mock('../pages/Settings', () => () => null);
jest.mock('../pages/SignIn', () => () => null);
jest.mock('../pages/SignUp', () => () => null);
jest.mock('../pages/Onboarding', () => () => null);
jest.mock('../pages/Welcome', () => () => null);
jest.mock('../pages/InviteAccept', () => () => null);
jest.mock('../pages/OperationsPage', () => () => null);
jest.mock('../pages/Contributions', () => () => null);
jest.mock('../pages/admin/AdminOverview', () => () => null);
jest.mock('../pages/admin/AdminGroupsList', () => () => null);
jest.mock('../pages/admin/AdminGroupDetail', () => () => null);
jest.mock('../pages/admin/AdminSuperAdmins', () => () => null);
jest.mock('../pages/admin/AdminAuditLog', () => () => null);
jest.mock('../pages/admin/AdminAcceptInvite', () => () => null);
jest.mock('../pages/admin/AdminSupportInbox', () => () => null);
jest.mock('../components/support/HelpSupport', () => () => null);
jest.mock('../components/TrialBanner', () => () => null);
jest.mock('../components/ProfileEmailBanner', () => () => null);
jest.mock('../components/ui/ManageBankBalanceModal', () => () => null);
jest.mock('../components/ui/ChangePasswordModal', () => () => null);
jest.mock('../components/ui/ManagePaymentModal', () => () => null);
jest.mock('../components/ui/AddFineModal', () => () => null);
jest.mock('../components/ui/BeginNewCycleModal', () => () => null);
jest.mock('../components/ui/FinesModal', () => () => null);

import App from '../App';

// Minimal reactive stand-in for the real AuthProvider, fixed to a
// signed-in super admin so we can isolate the adminMode toggle + routing.
function MockAuthProvider({ children, initialAdminMode = false }) {
  const [adminMode, setAdminMode] = useState(initialAdminMode);
  const applyAdminMode = next => setAdminMode(next);
  const toggleAdminMode = () => setAdminMode(v => !v);
  const value = {
    isLoaded: true,
    isSignedIn: true,
    clerkUser: { fullName: 'Super Admin User' },
    user: { _id: null, name: 'Super Admin', role: 'admin', groupId: null, groupName: null },
    needsOnboarding: false,
    authLoading: false,
    trialActive: true,
    isSuperAdmin: true,
    adminMode,
    toggleAdminMode,
    applyAdminMode,
    logout: () => {},
  };
  return <MockAuthContext.Provider value={value}>{children}</MockAuthContext.Provider>;
}

test('switching to Platform Admin renders AdminSidebar, not the regular group sidebar', async () => {
  const user = userEvent.setup();
  render(
    <MockAuthProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    </MockAuthProvider>
  );

  // Sanity: regular sidebar visible before switching.
  expect(screen.getByText('Members')).toBeInTheDocument();

  await user.click(screen.getByLabelText('User menu'));
  await user.click(await screen.findByText('Switch to Platform Admin'));

  // TopBar should say Platform Admin (already known-good).
  expect((await screen.findAllByText('Platform Admin')).length).toBeGreaterThan(0);

  // Desktop sidebar should now be AdminSidebar (All Groups link), not DesktopSidebar (Members link).
  expect(await screen.findByText('All Groups')).toBeInTheDocument();
  expect(screen.queryByText('Members')).not.toBeInTheDocument();
});

test('Account Settings from admin mode does not strand the desktop sidebar on AdminSidebar while body switches to the regular Settings page', async () => {
  const user = userEvent.setup();
  render(
    <MockAuthProvider initialAdminMode>
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>
    </MockAuthProvider>
  );

  // Confirm we start in admin mode with AdminSidebar showing.
  expect(await screen.findByText('All Groups')).toBeInTheDocument();

  await user.click(screen.getByLabelText('User menu'));
  await user.click(await screen.findByText('Account Settings'));

  // TopBar and desktop sidebar must agree on mode: either both admin or both regular,
  // never a mix (that mix is the reported bug — DesktopSidebar with an admin-labeled TopBar).
  const stillSaysPlatformAdmin = screen.queryAllByText('Platform Admin').length > 0;
  const regularSidebarShowing = screen.queryByText('Members') !== null;
  expect(stillSaysPlatformAdmin && regularSidebarShowing).toBe(false);
});
