import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../lib/utils';

// How close to the end date the cycle must be before this banner appears.
const NUDGE_WINDOW_DAYS = 30;

/**
 * Reads the group's real open cycle (Phase 5's `Cycle` model) via
 * GET /api/cycle/current, rather than the hardcoded "Cycle 12 ends soon" stub
 * this component shipped with — which showed the same sentence to every group,
 * including brand-new ones on their first day.
 *
 * Renders nothing when there is no open cycle, or when the cycle's end date is
 * further away than NUDGE_WINDOW_DAYS. "Begin New Cycle" also lives on the
 * Operations page, so hiding the nudge here costs no access.
 */
export default function NewCycleBanner({ isVisible, onBeginCycle }) {
  const [cycle, setCycle] = useState(null);

  useEffect(() => {
    if (!isVisible) return;
    axios.get(`${API_BASE_URL}/cycle/current`)
      .then(res => setCycle(res.data))
      .catch(() => setCycle(null)); // 404 = no open cycle yet
  }, [isVisible]);

  if (!isVisible || !cycle?.endDate) return null;

  const endDate = dayjs(cycle.endDate);
  const daysLeft = endDate.diff(dayjs(), 'day');
  if (daysLeft > NUDGE_WINDOW_DAYS) return null;

  const nextCycle = (cycle.cycleNumber ?? 0) + 1;
  const message = daysLeft < 0
    ? `Cycle ${cycle.cycleNumber} ended ${endDate.format('D MMM YYYY')}. Ready to begin Cycle ${nextCycle}?`
    : `Cycle ${cycle.cycleNumber} ends ${endDate.format('D MMM YYYY')}. Ready to begin Cycle ${nextCycle}?`;

  return (
    <div className="flex items-center justify-between gap-4 bg-trial-bg border border-trial-border rounded-md px-4 py-3.5 mb-4">
      <div className="flex items-center gap-3">
        <CalendarDays size={20} className="text-brand-primary flex-shrink-0" />
        <p className="text-sm text-trial-text">{message}</p>
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
