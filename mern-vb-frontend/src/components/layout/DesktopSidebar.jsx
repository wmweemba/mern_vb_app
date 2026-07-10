import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { NAV_ITEMS } from './navItems';
import PlanStatusCard from './PlanStatusCard';

export default function DesktopSidebar() {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 bg-surface-card border-r border-border-default z-50">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">C</span>
        </div>
        <span className="text-brand-primary font-bold text-lg tracking-tight">Chama360</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pb-4 overflow-y-auto">
        <p className="text-xs font-medium uppercase tracking-widest text-text-secondary px-3 pb-2 pt-2">
          Menu
        </p>
        <ul className="space-y-0.5">
          {NAV_ITEMS.filter(({ roles }) => !roles || roles.includes(user?.role)).map(({ label, to, icon: Icon }) => {
            const active = location.pathname === to || (to !== '/dashboard' && location.pathname.startsWith(to));
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

      <PlanStatusCard />
    </aside>
  );
}
