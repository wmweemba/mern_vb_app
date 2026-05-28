import React from 'react';
import { PiggyBank, DollarSign, TrendingUp, BarChart2, AlertCircle, Wallet } from 'lucide-react';

const statConfig = [
  { label: 'Total Saved',         key: 'totalSaved',          icon: PiggyBank },
  { label: 'Total Loaned',        key: 'totalLoaned',          icon: DollarSign },
  { label: 'Interest (Loans)',    key: 'totalInterestLoans',   icon: TrendingUp },
  { label: 'Interest (Savings)',  key: 'totalInterestSavings', icon: BarChart2 },
  { label: 'Total Fines',         key: 'totalFines',           icon: AlertCircle },
];

const fmt = (val) => val !== undefined && val !== null ? `K${Number(val).toLocaleString()}` : '—';

const DashboardStatsCard = ({ stats }) => (
  <div className="w-full space-y-3 mb-6">
    {/* Hero cards — two side-by-side balance cards */}
    <div className="grid grid-cols-2 gap-3">
      {/* Lending pool (main balance) */}
      <div className="bg-surface-dark rounded-xl p-4 md:p-5 col-span-2 sm:col-span-1">
        <p className="text-xs font-medium uppercase tracking-widest text-text-on-dark-muted mb-1">
          Bank Balance
        </p>
        <p className="text-3xl md:text-4xl font-bold text-white leading-tight">
          {fmt(stats.bankBalance)}
        </p>
        <p className="text-xs text-text-on-dark-muted mt-1 opacity-70">Lending pool</p>
      </div>

      {/* Social fund */}
      <div className="bg-surface-card rounded-xl p-4 md:p-5 border border-blue-100 col-span-2 sm:col-span-1">
        <div className="flex items-center gap-1.5 mb-1">
          <Wallet size={13} className="text-blue-600 flex-shrink-0" />
          <p className="text-xs font-medium uppercase tracking-widest text-blue-600">
            Social Fund
          </p>
        </div>
        <p className="text-3xl md:text-4xl font-bold text-text-primary leading-tight">
          {fmt(stats.socialFundBalance)}
        </p>
        <p className="text-xs text-text-secondary mt-1 opacity-70">Tracked separately</p>
      </div>
    </div>

    {/* Secondary stat cards — 2 cols mobile, 3 cols desktop */}
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {statConfig.map(({ label, key, icon: Icon }) => (
        <div key={key} className="bg-surface-card rounded-lg p-4 flex flex-col gap-1 min-h-[90px]">
          <div className="flex items-center gap-1.5 mb-1">
            <Icon size={15} className="text-text-secondary flex-shrink-0" />
            <span className="text-xs font-medium uppercase tracking-widest text-text-secondary leading-tight">{label}</span>
          </div>
          <p className="text-xl font-bold text-text-primary">{fmt(stats[key])}</p>
        </div>
      ))}
    </div>
  </div>
);

export default DashboardStatsCard;
