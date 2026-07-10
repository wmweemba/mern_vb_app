import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../../store/auth';
import { useDrawerLifecycle } from '../../hooks/useDrawerLifecycle';
import { NAV_ITEMS } from './navItems';
import PlanStatusCard from './PlanStatusCard';

export default function MobileNavDrawer({ open, onClose }) {
  const location = useLocation();
  const { user } = useAuth();

  useDrawerLifecycle(open, onClose);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />

      <div className="relative flex flex-col w-72 h-full bg-surface-card rounded-r-xl animate-in slide-in-from-left duration-200">
        <div className="flex items-center justify-between px-4 py-5 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">C</span>
            </div>
            <span className="text-brand-primary font-bold text-lg tracking-tight">Chama360</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-page transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

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
                    onClick={onClose}
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

        <div className="flex-shrink-0">
          <PlanStatusCard afterNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
