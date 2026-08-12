import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';

// Self-serve interest quota figure (docs/plan_configurable_group_rules.md Phase 3).
// Renders nothing for groups with no quota configured (target === 0) — most groups.
const InterestObligationCard = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/reports/interest-obligation/me`)
      .then(res => setData(res.data))
      .catch(() => setData(null));
  }, []);

  if (!data || !data.target) return null;

  const met = data.shortfall <= 0;

  return (
    <div className="bg-surface-card rounded-lg p-4 flex flex-col gap-1 mb-3 border border-border-default">
      <div className="flex items-center gap-1.5 mb-1">
        <TrendingUp size={15} className="text-text-secondary flex-shrink-0" />
        <span className="text-xs font-medium uppercase tracking-widest text-text-secondary leading-tight">
          Your Interest Obligation
        </span>
      </div>
      <p className="text-xl font-bold text-text-primary">
        K{Number(data.credited).toLocaleString()} <span className="text-sm font-medium text-text-secondary">of K{Number(data.target).toLocaleString()}</span>
      </p>
      <p className={`text-xs font-medium ${met ? 'text-status-paid-text' : 'text-status-overdue-text'}`}>
        {met ? 'Quota met' : `K${Number(data.shortfall).toLocaleString()} remaining`}
      </p>
    </div>
  );
};

export default InterestObligationCard;
