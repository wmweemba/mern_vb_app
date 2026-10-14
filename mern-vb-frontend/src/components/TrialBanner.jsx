import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuth } from '../store/auth';

// Named UI constant (not a group financial value) — how close to a paid
// subscription's expiry this banner starts warning admins/treasurers.
const RENEWAL_WARNING_DAYS = 7;

// Years at/after this are treated as "no real expiry" (e.g. manually
// activated groups with a far-future placeholder paidUntil) — never warn.
const NO_EXPIRY_YEAR = 2099;

export default function TrialBanner() {
  const { trialActive, user, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  if (!user || isSuperAdmin) return null;

  const canManageBilling = user.role === 'admin' || user.role === 'treasurer';
  const paidUntil = user.paidUntil ? dayjs(user.paidUntil) : null;
  const hasRealExpiry = paidUntil && paidUntil.isValid() && paidUntil.year() < NO_EXPIRY_YEAR;

  // Paid group with an upcoming or already-lapsed renewal date.
  if (user.isPaid && hasRealExpiry) {
    const now = dayjs();
    const daysUntilExpiry = paidUntil.diff(now, 'day');
    const lapsed = paidUntil.isBefore(now);
    const upcoming = !lapsed && daysUntilExpiry <= RENEWAL_WARNING_DAYS;

    if (!lapsed && !upcoming) return null;

    const formattedDate = paidUntil.format('D MMM YYYY');

    // Upcoming-renewal warning is scoped to admin/treasurer only — a group
    // whose subscription is still active has nothing for a member to act on.
    if (upcoming) {
      if (!canManageBilling) return null;

      return (
        <div className="bg-status-pending-bg border-b border-status-pending-text/30 px-4 py-3 text-sm text-status-pending-text">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <p>Your subscription ends on {formattedDate}.</p>
            <button
              onClick={() => navigate('/upgrade')}
              className="flex-shrink-0 bg-brand-primary hover:bg-brand-hover text-white text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
            >
              Renew now
            </button>
          </div>
        </div>
      );
    }

    // Lapsed paid group.
    return (
      <div className="bg-trial-bg border-b border-trial-border px-4 py-3 text-sm text-trial-text">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <p>
            Your subscription ended on {formattedDate}. Your data is safe and
            readable, but saving new records is disabled.
          </p>
          {canManageBilling ? (
            <button
              onClick={() => navigate('/upgrade')}
              className="flex-shrink-0 bg-brand-primary hover:bg-brand-hover text-white text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
            >
              Renew now
            </button>
          ) : (
            <p className="flex-shrink-0 text-xs">Ask your admin or treasurer to renew.</p>
          )}
        </div>
      </div>
    );
  }

  // Never paid, trial expired.
  if (!trialActive) {
    return (
      <div className="bg-trial-bg border-b border-trial-border px-4 py-3 text-sm text-trial-text">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <p>
            Your 15-day free trial has ended. Your data is safe and readable,
            but saving new records is disabled.
          </p>
          <button
            onClick={() => navigate('/upgrade')}
            className="flex-shrink-0 bg-brand-primary hover:bg-brand-hover text-white text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    );
  }

  return null;
}
