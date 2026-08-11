import { useEffect } from 'react';
import AdminSidebar from './AdminSidebar';
import TopBar from './TopBar';
import AdminMobileBottomNav from './AdminMobileBottomNav';
import HelpSupport from '../support/HelpSupport';
import { useAuth } from '../../store/auth';

export default function AdminShell({ children }) {
  const { adminMode, applyAdminMode } = useAuth();

  // AdminShell only renders on /admin/* routes — if adminMode is still false here
  // (e.g. reached via a bookmarked/typed URL rather than the "Switch to Platform
  // Admin" toggle), correct it so the TopBar and mobile drawer agree with AdminSidebar.
  useEffect(() => {
    if (!adminMode) applyAdminMode(true);
  }, [adminMode]);

  return (
    <div className="min-h-screen bg-surface-page">
      <AdminSidebar />
      <TopBar />
      <AdminMobileBottomNav />
      <main className="md:ml-60 pt-16 pb-28 md:pb-8 px-4 md:px-8">
        {children}
      </main>
      <HelpSupport />
    </div>
  );
}
