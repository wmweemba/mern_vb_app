import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, Users, Shield, FileText, LifeBuoy } from 'lucide-react';
import { useAuth } from '../../store/auth';

const NAV_ITEMS = [
  { label: 'Overview', to: '/admin', icon: LayoutGrid, exact: true },
  { label: 'All Groups', to: '/admin/groups', icon: Users },
  { label: 'Support', to: '/admin/support', icon: LifeBuoy },
  { label: 'Super Admins', to: '/admin/super-admins', icon: Shield },
  { label: 'Audit Log', to: '/admin/audit', icon: FileText },
];

export default function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleAdminMode } = useAuth();

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-surface-card border-r border-border-default z-50">
      {/* Logo */}
      <div className="flex flex-col px-4 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">C</span>
          </div>
          <span className="text-brand-primary font-bold text-lg tracking-tight">Chama360</span>
        </div>
        <span className="text-xs uppercase tracking-widest text-text-secondary mt-1 ml-10">Platform Admin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pb-4 overflow-y-auto">
        <p className="text-xs font-medium uppercase tracking-widest text-text-secondary px-3 pb-2 pt-2">
          Admin
        </p>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ label, to, icon: Icon, exact }) => {
            const active = exact
              ? location.pathname === to
              : location.pathname === to || location.pathname.startsWith(to + '/');
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={`flex items-center gap-3 px-3 h-11 rounded-md transition-colors text-sm font-medium ${
                    active
                      ? 'bg-brand-light text-brand-primary'
                      : 'text-text-secondary hover:bg-surface-page hover:text-text-primary'
                  }`}
                >
                  <Icon size={20} className={active ? 'text-brand-primary' : 'text-text-secondary'} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Exit admin mode */}
      <div className="mx-3 mb-4">
        <button
          onClick={() => { toggleAdminMode(); navigate('/dashboard'); }}
          className="w-full text-sm font-medium text-text-primary border border-border-default rounded-full py-2 hover:bg-surface-page transition-colors"
        >
          Exit Admin Mode
        </button>
      </div>
    </aside>
  );
}
