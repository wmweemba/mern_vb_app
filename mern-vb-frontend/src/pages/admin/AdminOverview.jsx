import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';
import { useAuth } from '../../store/auth';

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-surface-card rounded-lg p-5">
      <p className="text-xs uppercase tracking-wide text-text-secondary font-medium">{label}</p>
      <p className="text-3xl font-bold text-text-primary mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { clerkUser, user } = useAuth();

  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE_URL}/admin/overview`),
      axios.get(`${API_BASE_URL}/admin/audit-log?limit=5`),
    ]).then(([statsRes, logsRes]) => {
      setStats(statsRes.data);
      setRecentLogs(logsRes.data.logs || []);
    }).finally(() => setLoading(false));
  }, []);

  const adminEmail = clerkUser?.primaryEmailAddress?.emailAddress || user?.email || '';

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto pt-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface-card rounded w-48" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-surface-card rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Platform Overview</h1>
        <p className="text-sm text-text-secondary mt-1">Chama360 platform administration</p>
      </div>

      {/* Hero card */}
      <div className="bg-surface-dark text-white rounded-xl p-5 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-sm font-medium opacity-70">Welcome, Super Admin</p>
          <p className="text-base font-semibold mt-0.5">{adminEmail}</p>
        </div>
        <button
          onClick={() => navigate('/admin/groups')}
          className="border border-white/30 text-white text-sm font-medium rounded-full px-4 py-2 hover:bg-white/10 transition-colors w-full md:w-auto"
        >
          Manage Groups
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatCard label="Total Groups" value={stats?.totalGroups} />
        <StatCard label="Active Trials" value={stats?.trialGroups} />
        <StatCard
          label="Paid Groups"
          value={stats?.paidGroups}
          sub={`MRR est. ZMW ${stats?.mrrEstimate?.toLocaleString()}`}
        />
        <StatCard
          label="Expiring This Week"
          value={stats?.expiringThisWeek}
          sub={`${stats?.totalMembers} total members`}
        />
      </div>

      {/* Recent activity */}
      <div className="bg-surface-card rounded-lg p-5 md:p-6">
        <h2 className="text-base font-semibold text-text-primary mb-4">Recent Activity</h2>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-text-secondary">No activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {recentLogs.map(log => (
              <li key={log._id} className="flex items-start justify-between gap-4 pb-3 border-b border-border-default last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-text-primary">{log.action}</p>
                  <p className="text-xs text-text-secondary">{log.actorEmail}</p>
                </div>
                <p className="text-xs text-text-secondary flex-shrink-0">
                  {new Date(log.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
