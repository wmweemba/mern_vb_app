import React, { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';

// Self-serve per-member liability figures (docs/plan_configurable_group_rules.md
// Phase 4) — e.g. a membership fee payable in instalments. Renders nothing when the
// group has no liability-configured contribution type.
const ContributionLiabilityCard = () => {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/reports/contribution-liability/me`)
      .then(res => setRows(res.data.rows || []))
      .catch(() => setRows([]));
  }, []);

  if (rows.length === 0) return null;

  return (
    <>
      {rows.map(row => {
        const met = row.outstanding <= 0;
        return (
          <div key={row.contributionTypeId} className="bg-surface-card rounded-lg p-4 flex flex-col gap-1 mb-3 border border-border-default">
            <div className="flex items-center gap-1.5 mb-1">
              <Receipt size={15} className="text-text-secondary flex-shrink-0" />
              <span className="text-xs font-medium uppercase tracking-widest text-text-secondary leading-tight">
                Your {row.name}
              </span>
            </div>
            <p className="text-xl font-bold text-text-primary">
              K{Number(row.paid).toLocaleString()} <span className="text-sm font-medium text-text-secondary">of K{Number(row.target).toLocaleString()}</span>
            </p>
            <p className={`text-xs font-medium ${met ? 'text-status-paid-text' : 'text-status-overdue-text'}`}>
              {met ? 'Fully paid' : `K${Number(row.outstanding).toLocaleString()} outstanding`}
            </p>
          </div>
        );
      })}
    </>
  );
};

export default ContributionLiabilityCard;
