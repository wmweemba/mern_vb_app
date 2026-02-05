import React, { useEffect, useState } from 'react';
import BankBalanceCard from '../components/ui/BankBalanceCard';
import DashboardStatsCard from '../components/ui/DashboardStatsCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Link } from 'react-router-dom';
import { FaPlus, FaPiggyBank, FaFileAlt, FaGavel } from 'react-icons/fa';
import axios from 'axios';
import { API_BASE_URL } from '../lib/utils';

const statActions = [
  {
    label: 'Add Loan',
    to: '/loans',
    icon: <FaPlus className="text-white size-6" />, color: 'bg-blue-600',
  },
  {
    label: 'Add Savings',
    to: '/savings',
    icon: <FaPiggyBank className="text-white size-6" />, color: 'bg-green-600',
  },
  {
    label: 'View Reports',
    to: '/reports',
    icon: <FaFileAlt className="text-white size-6" />, color: 'bg-purple-600',
  },
];

const AdminActions = () => (
  <div className="w-full flex justify-center mt-6">
    <div className="grid grid-cols-2 gap-4 w-full max-w-md">
      {statActions.map((action) => (
        <Link to={action.to} key={action.label} className={`flex flex-col items-center justify-center rounded-xl p-4 ${action.color} shadow-md hover:scale-105 transition-transform min-h-[90px]`} style={{ minWidth: 0 }}>
          {action.icon}
          <span className="mt-2 text-white font-semibold text-sm text-center">{action.label}</span>
        </Link>
      ))}
    </div>
  </div>
);

const Dashboard = ({ title }) => {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const [dashboardRes, balRes, fineRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/savings/dashboard`),
        axios.get(`${API_BASE_URL}/bank-balance`),
        axios.get(`${API_BASE_URL}/bank-balance/fines`),
      ]);
      setStats({
        ...dashboardRes.data,
        bankBalance: balRes.data.balance,
        totalFines: fineRes.data.totalFines,
      });
    } catch (err) {
      setError('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Listen for loan data changes from payment modal
    const handleLoanDataChange = () => {
      fetchStats(); // Refresh dashboard stats when payments are made
    };
    
    window.addEventListener('loanDataChanged', handleLoanDataChange);
    
    return () => {
      window.removeEventListener('loanDataChanged', handleLoanDataChange);
    };
  }, []);

  return (
    <div className="p-4 flex flex-col items-center min-h-screen bg-background">
      <h1 className="text-2xl font-bold mb-4 text-center">{title || 'Dashboard'}</h1>
      <div className="w-full max-w-2xl">
        {loading ? (
          <div className="mb-4 text-gray-500">Loading stats...</div>
        ) : error ? (
          <div className="mb-4 text-red-500">{error}</div>
        ) : (
          <DashboardStatsCard stats={stats} />
        )}
        <AdminActions />
        {/* Placeholder for future: charts, recent transactions, etc. */}
      </div>
    </div>
  );
};

export default Dashboard; 