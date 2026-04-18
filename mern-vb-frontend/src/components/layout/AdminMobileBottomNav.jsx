import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, Users, Shield, FileText } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Overview', to: '/admin', icon: LayoutGrid },
  { label: 'Groups', to: '/admin/groups', icon: Users },
  { label: 'Super Admins', to: '/admin/super-admins', icon: Shield },
  { label: 'Audit', to: '/admin/audit', icon: FileText },
];

export default function AdminMobileBottomNav() {
  const location = useLocation();

  return (
    <nav
      className="md:hidden fixed bottom-3 left-3 right-3 bg-surface-dark rounded-xl z-50 flex items-center justify-around px-2"
      style={{ height: 72, paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
    >
      {NAV_ITEMS.map(({ label, to, icon: Icon }) => {
        const active = to === '/admin'
          ? location.pathname === to
          : location.pathname === to || location.pathname.startsWith(to + '/');

        return (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full"
            aria-label={label}
          >
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
                active ? 'bg-brand-primary' : ''
              }`}
            >
              <Icon size={22} className={active ? 'text-white' : 'text-text-on-dark-muted'} />
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
