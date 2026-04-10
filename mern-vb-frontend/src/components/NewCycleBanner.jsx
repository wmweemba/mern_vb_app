import { CalendarDays } from 'lucide-react';

export default function NewCycleBanner({ isVisible, onBeginCycle }) {
  if (!isVisible) return null;

  return (
    <div className="flex items-center justify-between gap-4 bg-trial-bg border border-trial-border rounded-md px-4 py-3.5 mb-4">
      <div className="flex items-center gap-3">
        <CalendarDays size={20} className="text-brand-primary flex-shrink-0" />
        <p className="text-sm text-trial-text">
          Cycle 12 ends soon. Ready to begin Cycle 13?
        </p>
      </div>
      <button
        onClick={onBeginCycle}
        className="flex-shrink-0 bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full px-4 py-1.5 transition-colors"
      >
        Begin New Cycle
      </button>
    </div>
  );
}
