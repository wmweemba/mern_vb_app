import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function TrialBanner() {
  const { trialActive, user } = useAuth();
  const navigate = useNavigate();

  if (!user || trialActive) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-800">
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
