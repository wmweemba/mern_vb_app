import React from 'react';
import { FaPiggyBank, FaMoneyCheckAlt, FaPercentage, FaChartLine } from 'react-icons/fa';

const statConfig = [
  {
    label: 'Total Saved',
    icon: <FaPiggyBank className="text-green-600 size-6" />,
    key: 'totalSaved',
    color: 'border-green-600',
    valueColor: 'text-green-700',
    bg: 'bg-green-50',
    trend: '+12.5% from last month',
    trendColor: 'text-green-500',
  },
  {
    label: 'Total Loaned',
    icon: <FaMoneyCheckAlt className="text-blue-600 size-6" />,
    key: 'totalLoaned',
    color: 'border-blue-600',
    valueColor: 'text-blue-700',
    bg: 'bg-blue-50',
    trend: '-5.2% from last month',
    trendColor: 'text-red-500',
  },
  {
    label: 'Interest (Savings)',
    icon: <FaPercentage className="text-purple-600 size-6" />,
    key: 'totalInterestSavings',
    color: 'border-purple-600',
    valueColor: 'text-purple-700',
    bg: 'bg-purple-50',
    trend: '+8.1% from last month',
    trendColor: 'text-green-500',
  },
  {
    label: 'Interest (Loans)',
    icon: <FaChartLine className="text-yellow-600 size-6" />,
    key: 'totalInterestLoans',
    color: 'border-yellow-600',
    valueColor: 'text-yellow-700',
    bg: 'bg-yellow-50',
    trend: '',
    trendColor: '',
  },
];

const DashboardStatsCard = ({ stats }) => (
  <div className="w-full flex justify-center mb-6">
    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
      {statConfig.map(({ label, icon, key, color, valueColor, bg, trend, trendColor }) => (
        <div
          key={key}
          className={`rounded-2xl border-2 ${color} ${bg} shadow-sm p-4 flex flex-col items-start min-h-[110px]`}
        >
          <div className="flex items-center gap-2 mb-2">
            {icon}
            <span className="font-semibold text-gray-700 text-sm">{label}</span>
          </div>
          <div className={`text-2xl font-bold ${valueColor}`}>{stats[key] !== undefined ? `K${Number(stats[key]).toLocaleString()}` : '--'}</div>
          {trend && (
            <div className={`text-xs mt-1 ${trendColor}`}>{trend}</div>
          )}
        </div>
      ))}
    </div>
  </div>
);

export default DashboardStatsCard; 