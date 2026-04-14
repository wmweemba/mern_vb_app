import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, Users, PieChart, Settings, Plus } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutGrid },
  { label: 'Members', to: '/members', icon: Users },
  null, // centre + button
  { label: 'Reports', to: '/reports', icon: PieChart },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export default function MobileBottomNav({ onActionSheet }) {
  const location = useLocation();

  return (
    <nav
      className="md:hidden fixed bottom-3 left-3 right-3 bg-surface-dark rounded-xl z-50 flex items-center justify-around px-2"
      style={{ height: 72, paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
    >
      {NAV_ITEMS.map((item, i) => {
        if (item === null) {
          return (
            <button
              key="action"
              onClick={onActionSheet}
              className="-translate-y-2 w-12 h-12 bg-surface-card rounded-md flex items-center justify-center flex-shrink-0 shadow-sm"
              aria-label="Actions"
            >
              <Plus size={24} className="text-surface-dark" />
            </button>
          );
        }

        const { label, to, icon: Icon } = item;
        const active = location.pathname === to || (to !== '/dashboard' && location.pathname.startsWith(to));

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
