import { useEffect, useState } from 'react';
import NewCycleBanner from '../components/NewCycleBanner';
import BeginNewCycleModal from '../components/ui/BeginNewCycleModal';
import DashboardStatsCard from '../components/ui/DashboardStatsCard';
import axios from 'axios';
import { API_BASE_URL } from '../lib/utils';
import { useAuth } from '../store/auth';

const CYCLE_ROLES = ['admin', 'treasurer', 'loan_officer'];

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewCycle, setShowNewCycle] = useState(false);

  const fetchStats = async () => {
    setLoading(true); setError('');
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
    } catch {
      setError('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const handleLoanDataChange = () => fetchStats();
    window.addEventListener('loanDataChanged', handleLoanDataChange);
    return () => window.removeEventListener('loanDataChanged', handleLoanDataChange);
  }, []);

  return (
    <div className="py-4 w-full max-w-2xl mx-auto">
      <NewCycleBanner isVisible={CYCLE_ROLES.includes(user?.role)} onBeginCycle={() => setShowNewCycle(true)} />
      <BeginNewCycleModal
        isOpen={showNewCycle}
        onClose={() => setShowNewCycle(false)}
        onSuccess={() => window.location.reload()}
      />

      {loading ? (
        <div className="text-text-secondary text-sm">Loading stats...</div>
      ) : error ? (
        <div className="text-status-overdue-text text-sm">{error}</div>
      ) : (
        <DashboardStatsCard stats={stats} />
      )}
    </div>
  );
};

export default Dashboard;
