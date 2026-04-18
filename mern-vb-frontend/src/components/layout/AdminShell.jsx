import AdminSidebar from './AdminSidebar';
import TopBar from './TopBar';
import AdminMobileBottomNav from './AdminMobileBottomNav';

export default function AdminShell({ children }) {
  return (
    <div className="min-h-screen bg-surface-page">
      <AdminSidebar />
      <TopBar />
      <AdminMobileBottomNav />
      <main className="md:ml-60 pt-16 pb-28 md:pb-8 px-4 md:px-8">
        {children}
      </main>
    </div>
  );
}
