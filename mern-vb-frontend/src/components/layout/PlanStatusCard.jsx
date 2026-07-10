import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';

// Shared by DesktopSidebar and MobileNavDrawer — narrow stacked card variant.
export default function PlanStatusCard({ afterNavigate }) {
  const { trialActive, isSuperAdmin, user } = useAuth();
  const navigate = useNavigate();

  if (!trialActive || isSuperAdmin) return null;

  if (user?.isPaid) {
    return (
      <div className="mx-3 mb-4 p-3 rounded-md bg-status-paid-bg border border-status-paid-text/20">
        <p className="text-sm font-semibold text-status-paid-text">
          {user?.plan ? `${user.plan} Plan` : 'Paid Plan'} — Active
        </p>
        {user?.memberLimit != null && (
          <p className="text-xs text-text-secondary mt-0.5">
            {user.memberCount} / {user.memberLimit} members
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-3 mb-4 p-3 rounded-md bg-trial-bg border border-trial-border">
      <p className="text-sm font-semibold text-trial-text">Trial Active</p>
      <p className="text-xs text-text-secondary mt-0.5">15 days remaining</p>
      <button
        onClick={() => { afterNavigate?.(); navigate('/upgrade'); }}
        className="mt-2 w-full text-sm font-medium text-text-primary border border-border-default rounded-full py-1.5 hover:bg-surface-page transition-colors"
      >
        Upgrade
      </button>
    </div>
  );
}
