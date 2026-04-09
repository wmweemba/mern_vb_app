import { useAuth } from '../store/auth';

export default function TrialBanner() {
  const { trialActive, user } = useAuth();

  if (!user || trialActive) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-800">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <p>
          Your 15-day free trial has ended. Your data is safe and readable,
          but saving new records is disabled.
          Contact William on{' '}
          <a href="https://wa.me/260979645911" className="underline font-medium">WhatsApp</a>{' '}
          to continue.
        </p>
      </div>
    </div>
  );
}
