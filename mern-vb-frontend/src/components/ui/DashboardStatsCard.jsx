import React from 'react';
import { FaPiggyBank, FaMoneyCheckAlt, FaPercentage, FaChartLine } from 'react-icons/fa';

const statConfig = [
  { label: 'Total Saved', icon: <FaPiggyBank className="text-green-600 size-6" />, key: 'totalSaved', color: 'text-green-700' },
  { label: 'Total Loaned', icon: <FaMoneyCheckAlt className="text-blue-600 size-6" />, key: 'totalLoaned', color: 'text-blue-700' },
  { label: 'Interest (Savings)', icon: <FaPercentage className="text-purple-600 size-6" />, key: 'totalInterestSavings', color: 'text-purple-700' },
  { label: 'Interest (Loans)', icon: <FaChartLine className="text-yellow-600 size-6" />, key: 'totalInterestLoans', color: 'text-yellow-700' },
];

const DashboardStatsCard = ({ stats }) => (
  <div className="w-full flex justify-center mb-6">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-5xl">
      {statConfig.map(({ label, icon, key, color }) => (
        <div key={key} className="bg-white rounded-xl border shadow-sm p-4 flex flex-col items-center text-center">
          <div className="mb-2">{icon}</div>
          <div className={`text-lg font-semibold ${color}`}>{label}</div>
          <div className="text-2xl font-bold mt-1">{stats[key] !== undefined ? `K${Number(stats[key]).toLocaleString()}` : '--'}</div>
        </div>
      ))}
    </div>
  </div>
);

export default DashboardStatsCard; 