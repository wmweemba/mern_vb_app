import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { API_BASE_URL } from '../../lib/utils';
import BillingActivationDrawer from '../../components/admin/BillingActivationDrawer';
import TypedConfirmationModal from '../../components/ui/TypedConfirmationModal';
import CreateGroupDrawer from '../../components/admin/CreateGroupDrawer';

const STATUS_LABELS = {
  trial_active: { label: 'Trial', cls: 'bg-trial-bg text-trial-text' },
  paid: { label: 'Paid', cls: 'bg-status-paid-bg text-status-paid-text' },
  expired: { label: 'Expired', cls: 'bg-status-overdue-bg text-status-overdue-text' },
  suspended: { label: 'Suspended', cls: 'bg-status-pending-bg text-status-pending-text' },
  deleted: { label: 'Deleted', cls: 'bg-surface-page text-text-secondary' },
};

const ALL_STATUSES = ['all', 'trial_active', 'paid', 'expired', 'suspended', 'deleted'];

export default function AdminGroupsList() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [billingGroup, setBillingGroup] = useState(null);
  const [deleteGroup, setDeleteGroup] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const fetchGroups = useCallback(() => {
    setLoading(true);
    axios.get(`${API_BASE_URL}/admin/groups?includeDeleted=${includeDeleted}`)
      .then(r => setGroups(r.data))
      .catch(() => toast.error('Failed to load groups'))
      .finally(() => setLoading(false));
  }, [includeDeleted]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const filtered = groups.filter(g => {
    const matchSearch = !search || g.name.toLowerCase().includes(search.toLowerCase()) || g.slug?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || g.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleSuspend = async (g) => {
    try {
      await axios.post(`${API_BASE_URL}/admin/groups/${g._id}/suspend`, { reason: 'Suspended by admin' });
      toast.success('Group suspended');
      fetchGroups();
    } catch { toast.error('Failed to suspend group'); }
  };

  const handleUnsuspend = async (g) => {
    try {
      await axios.post(`${API_BASE_URL}/admin/groups/${g._id}/unsuspend`);
      toast.success('Group unsuspended');
      fetchGroups();
    } catch { toast.error('Failed to unsuspend group'); }
  };

  const handleRestore = async (g) => {
    try {
      await axios.post(`${API_BASE_URL}/admin/groups/${g._id}/restore`);
      toast.success('Group restored');
      fetchGroups();
    } catch { toast.error('Failed to restore group'); }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API_BASE_URL}/admin/groups/${deleteGroup._id}`, {
        data: { confirmation: deleteGroup.name },
      });
      toast.success('Group deleted');
      setDeleteGroup(null);
      fetchGroups();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete group');
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">All Groups</h1>
          <p className="text-sm text-text-secondary">{groups.length} groups total</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-brand-primary text-white text-sm font-semibold rounded-full px-5 h-11 hover:opacity-90 transition-opacity"
        >
          Create Group
        </button>
      </div>

      {/* Controls */}
      <div className="bg-surface-card rounded-lg p-4 mb-4 space-y-3">
        <input
          type="text"
          placeholder="Search by name or slug…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
        <div className="flex flex-wrap gap-2 items-center">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'border-border-default text-text-secondary hover:bg-surface-page'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]?.label || s}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-text-secondary ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={e => setIncludeDeleted(e.target.checked)}
              className="rounded"
            />
            Show deleted
          </label>
        </div>
      </div>

      {/* Desktop table */}
      {loading ? (
        <div className="bg-surface-card rounded-lg p-8 text-center text-sm text-text-secondary">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-card rounded-lg p-8 text-center text-sm text-text-secondary">No groups found.</div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-surface-card rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default">
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-text-secondary font-medium">Group</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-text-secondary font-medium">Members</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-text-secondary font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-text-secondary font-medium">Expires</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-text-secondary font-medium">Created</th>
                  <th className="text-right px-4 py-3 text-xs uppercase tracking-wide text-text-secondary font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(g => {
                  const badge = STATUS_LABELS[g.status] || { label: g.status, cls: 'bg-surface-page text-text-secondary' };
                  const expiry = g.paidUntil || g.trialExpiresAt;
                  return (
                    <tr key={g._id} className="border-b border-border-default last:border-0 hover:bg-surface-page">
                      <td className="px-4 py-3">
                        <p className="font-medium text-text-primary">{g.name}</p>
                        <p className="text-xs text-text-secondary">{g.slug}</p>
                      </td>
                      <td className="px-4 py-3 text-text-primary">{g.memberCount}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {expiry ? new Date(expiry).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {new Date(g.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/admin/groups/${g._id}`)}
                            className="text-xs font-medium text-brand-primary hover:underline"
                          >
                            View
                          </button>
                          {!g.deletedAt && (
                            <button
                              onClick={() => setBillingGroup(g)}
                              className="text-xs font-medium text-text-secondary hover:text-text-primary border border-border-default rounded-full px-2 py-1"
                            >
                              Billing
                            </button>
                          )}
                          {!g.deletedAt && !g.suspendedAt && (
                            <button onClick={() => handleSuspend(g)} className="text-xs text-status-pending-text hover:underline">Suspend</button>
                          )}
                          {g.suspendedAt && !g.deletedAt && (
                            <button onClick={() => handleUnsuspend(g)} className="text-xs text-brand-primary hover:underline">Unsuspend</button>
                          )}
                          {g.deletedAt ? (
                            <button onClick={() => handleRestore(g)} className="text-xs text-brand-primary hover:underline">Restore</button>
                          ) : (
                            <button onClick={() => setDeleteGroup(g)} className="text-xs text-status-overdue-text hover:underline">Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(g => {
              const badge = STATUS_LABELS[g.status] || { label: g.status, cls: 'bg-surface-page text-text-secondary' };
              const expiry = g.paidUntil || g.trialExpiresAt;
              return (
                <div key={g._id} className="bg-surface-card rounded-md p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-text-primary">{g.name}</p>
                      <p className="text-xs text-text-secondary">{g.slug}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="space-y-1 text-sm mb-4">
                    <div className="flex justify-between"><span className="text-text-secondary">Members</span><span className="text-text-primary">{g.memberCount}</span></div>
                    <div className="flex justify-between"><span className="text-text-secondary">Expires</span><span className="text-text-primary text-xs">{expiry ? new Date(expiry).toLocaleDateString() : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-text-secondary">Created</span><span className="text-text-primary text-xs">{new Date(g.createdAt).toLocaleDateString()}</span></div>
                  </div>
                  <button
                    onClick={() => navigate(`/admin/groups/${g._id}`)}
                    className="w-full border border-border-default rounded-full py-2.5 text-sm font-medium text-text-primary hover:bg-surface-page transition-colors"
                  >
                    View Details
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <BillingActivationDrawer
        open={!!billingGroup}
        onClose={() => setBillingGroup(null)}
        groupId={billingGroup?._id}
        group={billingGroup}
        onSuccess={fetchGroups}
      />

      <TypedConfirmationModal
        open={!!deleteGroup}
        onClose={() => setDeleteGroup(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteGroup?.name}"?`}
        description="This will soft-delete the group. Members will lose access. You can restore it later."
        confirmWord={deleteGroup?.name}
        confirmLabel="Delete Group"
        danger
      />

      <CreateGroupDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={fetchGroups}
      />
    </div>
  );
}
