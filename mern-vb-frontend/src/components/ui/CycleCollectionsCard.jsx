import React, { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';

// "Collected This Cycle" (docs/plan_cycle_collections_card.md) — sum of loan interest
// + loan repayments (revolving loans only) plus interest-quota top-ups and membership
// fee contributions, for the current cycle. Renders nothing for groups with none of
// these (e.g. village_bank groups, which have no revolving loans and no liability/quota
// contribution types) — same self-hiding pattern as InterestObligationCard.
const CycleCollectionsCard = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/reports/cycle-collections`)
      .then(res => setData(res.data))
      .catch(() => setData(null));
  }, []);

  if (!data || !data.total) return null;

  return (
    <div className="bg-surface-card rounded-lg p-4 flex flex-col gap-1 mb-3 border border-border-default">
      <div className="flex items-center gap-1.5 mb-1">
        <Landmark size={15} className="text-text-secondary flex-shrink-0" />
        <span className="text-xs font-medium uppercase tracking-widest text-text-secondary leading-tight">
          Collected This Cycle
        </span>
      </div>
      <p className="text-xl font-bold text-text-primary">
        K{Number(data.total).toLocaleString()}
      </p>
    </div>
  );
};

export default CycleCollectionsCard;
