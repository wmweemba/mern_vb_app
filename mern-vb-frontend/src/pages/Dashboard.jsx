import React, { useEffect, useState } from 'react';
import BankBalanceCard from '../components/ui/BankBalanceCard';
import DashboardStatsCard from '../components/ui/DashboardStatsCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Link } from 'react-router-dom';
import { FaUsers, FaMoneyCheckAlt, FaPiggyBank, FaChartBar, FaSlidersH } from 'react-icons/fa';
import axios from 'axios';

const adminActions = [
  {
    title: 'Loans',
    description: 'View and manage all loan applications and approvals.',
    icon: <FaMoneyCheckAlt className="size-8 text-blue-600" />,
    to: '/loans',
  },
  {
    title: 'Savings',
    description: 'Monitor and manage member savings accounts.',
    icon: <FaPiggyBank className="size-8 text-green-600" />,
    to: '/savings',
  },
  {
    title: 'Thresholds',
    description: 'Set and update system thresholds and limits.',
    icon: <FaSlidersH className="size-8 text-yellow-600" />,
    to: '/thresholds',
  },
  {
    title: 'Reports',
    description: 'Access financial and activity reports.',
    icon: <FaChartBar className="size-8 text-purple-600" />,
    to: '/reports',
  },
];

const AdminActions = () => (
  <div className="w-full flex justify-center">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-5xl">
      {adminActions.map((action) => (
        <Card key={action.title} className="items-center text-center p-4 hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-col items-center">
            {action.icon}
            <CardTitle className="mt-2">{action.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>{action.description}</CardDescription>
          </CardContent>
          <Button asChild className="mt-4 w-full" variant="secondary">
            <Link to={action.to}>Go to {action.title}</Link>
          </Button>
        </Card>
      ))}
    </div>
  </div>
);

const Dashboard = ({ title }) => {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get('/api/savings/dashboard');
        setStats(res.data);
      } catch (err) {
        setError('Failed to load dashboard stats');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="p-4 flex flex-col items-center min-h-screen bg-background">
      <h1 className="text-2xl font-bold mb-4 text-center">{title || 'Dashboard'}</h1>
      {loading ? (
        <div className="mb-4 text-gray-500">Loading stats...</div>
      ) : error ? (
        <div className="mb-4 text-red-500">{error}</div>
      ) : (
        <DashboardStatsCard stats={stats} />
      )}
      <div className="mb-4 w-full max-w-md flex justify-center">
        <BankBalanceCard />
      </div>
      <AdminActions />
    </div>
  );
};

export default Dashboard; 