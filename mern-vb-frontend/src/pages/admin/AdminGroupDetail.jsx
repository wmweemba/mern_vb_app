import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import { API_BASE_URL } from '../../lib/utils';
import BillingActivationDrawer from '../../components/admin/BillingActivationDrawer';
import TypedConfirmationModal from '../../components/ui/TypedConfirmationModal';

const STATUS_LABELS = {
  trial_active: { label: 'Trial', cls: 'bg-trial-bg text-trial-text' },
  paid: { label: 'Paid', cls: 'bg-status-paid-bg text-status-paid-text' },
  expired: { label: 'Expired', cls: 'bg-status-overdue-bg text-status-overdue-text' },
  suspended: { label: 'Suspended', cls: 'bg-status-pending-bg text-status-pending-text' },
  deleted: { label: 'Deleted', cls: 'bg-surface-page text-text-secondary' },
};

const TABS = ['Overview', 'Members', 'Settings', 'Billing', 'Danger Zone', 'Activity'];

function getStatus(g) {
  const now = new Date();
  if (!g) return 'trial_active';
  if (g.deletedAt) return 'deleted';
  if (g.suspendedAt) return 'suspended';
  if (g.isPaid && (!g.paidUntil || new Date(g.paidUntil) > now)) return 'paid';
  if (g.trialExpiresAt && new Date(g.trialExpiresAt) < now) return 'expired';
  return 'trial_active';
}

// ---- Sub-tabs ----

function OverviewTab({ group }) {
  return (
    <div className="space-y-4">
      <div className="bg-surface-card rounded-lg p-5 md:p-6">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">Group Info</h3>
        <dl className="space-y-2">
          {[
            ['Slug', group.slug],
            ['Clerk Admin ID', group.clerkAdminId || '—'],
            ['Created', new Date(group.createdAt).toLocaleDateString()],
            ['Trial Expires', group.trialExpiresAt ? new Date(group.trialExpiresAt).toLocaleDateString() : '—'],
            ['Paid Until', group.paidUntil ? new Date(group.paidUntil).toLocaleDateString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <dt className="text-text-secondary">{k}</dt>
              <dd className="text-text-primary font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="bg-surface-card rounded-lg p-5 md:p-6">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">Bank Balance</h3>
        <p className="text-2xl font-bold text-text-primary">
          ZMW {group.bankBalance?.balance?.toLocaleString() ?? '—'}
        </p>
      </div>
    </div>
  );
}

function MembersTab({ groupId, onRefresh }) {
  const [members, setMembers] = useState([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [editMember, setEditMember] = useState(null);
  const [deleteMember, setDeleteMember] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchMembers = useCallback(() => {
    axios.get(`${API_BASE_URL}/admin/groups/${groupId}/members?includeDeleted=${includeDeleted}`)
      .then(r => setMembers(r.data))
      .catch(() => toast.error('Failed to load members'));
  }, [groupId, includeDeleted]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleEdit = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API_BASE_URL}/admin/groups/${groupId}/members/${editMember._id}`, editForm);
      toast.success('Member updated');
      setEditMember(null);
      fetchMembers();
    } catch { toast.error('Failed to update member'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API_BASE_URL}/admin/groups/${groupId}/members/${deleteMember._id}`, {
        data: { confirmation: deleteMember.name },
      });
      toast.success('Member removed');
      setDeleteMember(null);
      fetchMembers();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to remove member'); }
  };

  const handleRestore = async (m) => {
    try {
      await axios.post(`${API_BASE_URL}/admin/groups/${groupId}/members/${m._id}/restore`);
      toast.success('Member restored');
      fetchMembers();
    } catch { toast.error('Failed to restore member'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
          <input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} className="rounded" />
          Show removed members
        </label>
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-surface-card rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default">
              {['Name', 'Email', 'Phone', 'Role', 'Active', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide text-text-secondary font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m._id} className={`border-b border-border-default last:border-0 ${m.deletedAt ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-text-primary">{m.name}</td>
                <td className="px-4 py-3 text-text-secondary">{m.email || '—'}</td>
                <td className="px-4 py-3 text-text-secondary">{m.phone || '—'}</td>
                <td className="px-4 py-3 text-text-primary capitalize">{m.role}</td>
                <td className="px-4 py-3">{m.active ? '✓' : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {m.deletedAt ? (
                      <button onClick={() => handleRestore(m)} className="text-xs text-brand-primary hover:underline">Restore</button>
                    ) : (
                      <>
                        <button onClick={() => { setEditMember(m); setEditForm({ name: m.name, email: m.email, phone: m.phone, role: m.role, active: m.active }); }} className="text-xs text-brand-primary hover:underline">Edit</button>
                        <button onClick={() => setDeleteMember(m)} className="text-xs text-status-overdue-text hover:underline">Remove</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {members.map(m => (
          <div key={m._id} className={`bg-surface-card rounded-md p-4 ${m.deletedAt ? 'opacity-50' : ''}`}>
            <div className="flex justify-between mb-2">
              <p className="font-medium text-text-primary">{m.name}</p>
              <span className="text-xs text-text-secondary capitalize">{m.role}</span>
            </div>
            <p className="text-xs text-text-secondary mb-3">{m.email || m.phone || '—'}</p>
            <div className="flex gap-2">
              {m.deletedAt ? (
                <button onClick={() => handleRestore(m)} className="flex-1 text-xs border border-border-default rounded-full py-2 text-brand-primary">Restore</button>
              ) : (
                <>
                  <button onClick={() => { setEditMember(m); setEditForm({ name: m.name, email: m.email, phone: m.phone, role: m.role, active: m.active }); }} className="flex-1 text-xs border border-border-default rounded-full py-2 text-text-primary">Edit</button>
                  <button onClick={() => setDeleteMember(m)} className="flex-1 text-xs border border-border-default rounded-full py-2 text-status-overdue-text">Remove</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit drawer */}
      {editMember && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setEditMember(null)} />
          <div className="fixed bottom-0 left-0 right-0 md:top-0 md:right-0 md:left-auto md:bottom-0 md:w-[400px] bg-surface-card z-50 shadow-xl flex flex-col rounded-t-xl md:rounded-none md:rounded-l-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
              <h3 className="text-base font-bold text-text-primary">Edit Member</h3>
              <button onClick={() => setEditMember(null)}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {[['name','Name','text'], ['email','Email','email'], ['phone','Phone','tel']].map(([k, label, type]) => (
                <div key={k}>
                  <label className="block text-sm font-medium text-text-primary mb-1">{label}</label>
                  <input type={type} value={editForm[k] || ''} onChange={e => setEditForm(f => ({ ...f, [k]: e.target.value }))} className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Role</label>
                <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary">
                  {['admin','treasurer','loan_officer','member'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editForm.active} onChange={e => setEditForm(f => ({ ...f, active: e.target.checked }))} className="rounded" />
                <span className="text-sm text-text-primary">Active</span>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-border-default">
              <button onClick={handleEdit} disabled={saving} className="w-full bg-brand-primary text-white rounded-full py-3 text-sm font-semibold disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}

      <TypedConfirmationModal
        open={!!deleteMember}
        onClose={() => setDeleteMember(null)}
        onConfirm={handleDelete}
        title={`Remove "${deleteMember?.name}"?`}
        description="This member will lose access to the group."
        confirmWord={deleteMember?.name}
        confirmLabel="Remove Member"
        danger
      />
    </div>
  );
}

function SettingsTab({ groupId }) {
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/admin/groups/${groupId}/settings`)
      .then(r => setSettings(r.data))
      .catch(() => toast.error('Failed to load settings'));
  }, [groupId]);

  const SECTIONS = [
    { title: 'Group Info', fields: ['groupName', 'meetingDay'] },
    { title: 'Lending Rules', fields: ['interestRate', 'interestMethod', 'defaultLoanDuration', 'loanLimitMultiplier', 'cycleLengthMonths'] },
    { title: 'Fine Rules', fields: ['latePenaltyRate', 'overdueFineAmount', 'earlyPaymentCharge', 'lateFineType'] },
    { title: 'Savings Rules', fields: ['savingsInterestRate', 'minimumSavingsMonth1', 'minimumSavingsMonthly', 'maximumSavingsFirst3Months', 'savingsShortfallFine'] },
    { title: 'Profit Sharing', fields: ['profitSharingMethod'] },
  ];

  const handleSave = async (section) => {
    setSaving(true);
    try {
      const res = await axios.patch(`${API_BASE_URL}/admin/groups/${groupId}/settings`, form);
      setSettings(res.data);
      setEditing(null);
      toast.success('Settings saved');
    } catch { toast.error('Failed to save settings'); } finally { setSaving(false); }
  };

  if (!settings) return <div className="text-sm text-text-secondary">Loading settings…</div>;

  return (
    <div className="space-y-4">
      {SECTIONS.map(sec => (
        <div key={sec.title} className="bg-surface-card rounded-lg p-5 md:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">{sec.title}</h3>
            {editing !== sec.title ? (
              <button onClick={() => { setEditing(sec.title); const patch = {}; sec.fields.forEach(f => { patch[f] = settings[f]; }); setForm(patch); }} className="text-xs text-brand-primary hover:underline">Edit</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="text-xs text-text-secondary hover:underline">Cancel</button>
                <button onClick={() => handleSave(sec.title)} disabled={saving} className="text-xs text-brand-primary hover:underline">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            )}
          </div>
          <dl className="space-y-2">
            {sec.fields.map(f => (
              <div key={f} className="flex justify-between text-sm items-center">
                <dt className="text-text-secondary capitalize">{f.replace(/([A-Z])/g, ' $1').trim()}</dt>
                {editing === sec.title ? (
                  <input
                    value={form[f] ?? ''}
                    onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                    className="border border-border-default rounded-md px-2 py-1 text-sm text-text-primary bg-surface-page w-36"
                  />
                ) : (
                  <dd className="text-text-primary font-medium">{String(settings[f] ?? '—')}</dd>
                )}
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function BillingTab({ group, groupId, onRefresh }) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [marking, setMarking] = useState(false);

  const handleMarkUnpaid = async () => {
    setMarking(true);
    try {
      await axios.post(`${API_BASE_URL}/admin/groups/${groupId}/billing/mark-unpaid`);
      toast.success('Marked as unpaid');
      onRefresh();
    } catch { toast.error('Failed to mark unpaid'); } finally { setMarking(false); }
  };

  const now = new Date();
  const status = getStatus(group);

  return (
    <div className="space-y-4">
      <div className="bg-surface-card rounded-lg p-5 md:p-6">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">Current Billing Status</h3>
        <dl className="space-y-2">
          {[
            ['Is Paid', group.isPaid ? 'Yes' : 'No'],
            ['Paid Until', group.paidUntil ? new Date(group.paidUntil).toLocaleDateString() : '—'],
            ['Trial Expires', group.trialExpiresAt ? new Date(group.trialExpiresAt).toLocaleDateString() : '—'],
            ['Status', status],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <dt className="text-text-secondary">{k}</dt>
              <dd className="text-text-primary font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex flex-col md:flex-row gap-2 md:gap-3">
        <button
          onClick={() => setShowDrawer(true)}
          className="flex-1 bg-brand-primary text-white rounded-full py-2.5 text-sm font-semibold h-11"
        >
          Activate / Extend Billing
        </button>
        <button
          onClick={handleMarkUnpaid}
          disabled={marking || !group.isPaid}
          className="flex-1 border border-border-default text-text-primary rounded-full py-2.5 text-sm font-medium h-11 disabled:opacity-40"
        >
          Mark as Unpaid
        </button>
      </div>
      <BillingActivationDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        groupId={groupId}
        group={group}
        onSuccess={onRefresh}
      />
    </div>
  );
}

function DangerZoneTab({ group, groupId, onRefresh }) {
  const navigate = useNavigate();
  const [suspendReason, setSuspendReason] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [unsuspending, setUnsuspending] = useState(false);

  const handleSuspend = async () => {
    if (!suspendReason.trim()) { toast.error('Reason is required'); return; }
    setSuspending(true);
    try {
      await axios.post(`${API_BASE_URL}/admin/groups/${groupId}/suspend`, { reason: suspendReason });
      toast.success('Group suspended');
      setSuspendReason('');
      onRefresh();
    } catch { toast.error('Failed to suspend'); } finally { setSuspending(false); }
  };

  const handleUnsuspend = async () => {
    setUnsuspending(true);
    try {
      await axios.post(`${API_BASE_URL}/admin/groups/${groupId}/unsuspend`);
      toast.success('Group unsuspended');
      onRefresh();
    } catch { toast.error('Failed to unsuspend'); } finally { setUnsuspending(false); }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API_BASE_URL}/admin/groups/${groupId}`, { data: { confirmation: group.name } });
      toast.success('Group deleted');
      setShowDelete(false);
      navigate('/admin/groups');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
  };

  const handleRestore = async () => {
    try {
      await axios.post(`${API_BASE_URL}/admin/groups/${groupId}/restore`);
      toast.success('Group restored');
      onRefresh();
    } catch { toast.error('Failed to restore'); }
  };

  return (
    <div className="space-y-4">
      {/* Suspend */}
      {!group.deletedAt && (
        <div className="bg-surface-card rounded-lg p-5 md:p-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">Suspend Group</h3>
          {group.suspendedAt ? (
            <div>
              <p className="text-sm text-text-secondary mb-3">Group is currently suspended: <em>{group.suspendedReason || 'no reason given'}</em></p>
              <button onClick={handleUnsuspend} disabled={unsuspending} className="bg-brand-primary text-white rounded-full px-5 h-11 text-sm font-semibold disabled:opacity-50">
                {unsuspending ? 'Unsuspending…' : 'Unsuspend Group'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Reason for suspension"
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
                className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary"
              />
              <button onClick={handleSuspend} disabled={suspending} className="bg-status-pending-bg text-status-pending-text border border-status-pending-border rounded-full px-5 h-11 text-sm font-semibold disabled:opacity-50">
                {suspending ? 'Suspending…' : 'Suspend Group'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete / Restore */}
      <div className="bg-surface-card rounded-lg p-5 md:p-6 border border-status-overdue-bg">
        <h3 className="text-sm font-semibold text-status-overdue-text uppercase tracking-wide mb-3">
          {group.deletedAt ? 'Restore Group' : 'Delete Group'}
        </h3>
        {group.deletedAt ? (
          <div>
            <p className="text-sm text-text-secondary mb-3">This group has been soft-deleted. Restore to re-enable access.</p>
            <button onClick={handleRestore} className="bg-brand-primary text-white rounded-full px-5 h-11 text-sm font-semibold">Restore Group</button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-text-secondary mb-3">Soft-deletes the group. Members lose access. Data is preserved and can be restored.</p>
            <button onClick={() => setShowDelete(true)} className="bg-status-overdue-bg text-status-overdue-text rounded-full px-5 h-11 text-sm font-semibold">Delete Group</button>
          </div>
        )}
      </div>

      <TypedConfirmationModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title={`Delete "${group.name}"?`}
        description="Members will immediately lose access. You can restore the group later."
        confirmWord={group.name}
        confirmLabel="Delete Group"
        danger
      />
    </div>
  );
}

function ActivityTab({ groupId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/admin/audit-log?groupId=${groupId}&limit=50`)
      .then(r => setLogs(r.data.logs || []))
      .catch(() => toast.error('Failed to load activity'))
      .finally(() => setLoading(false));
  }, [groupId]);

  if (loading) return <div className="text-sm text-text-secondary">Loading…</div>;
  if (!logs.length) return <div className="text-sm text-text-secondary">No activity for this group.</div>;

  return (
    <div className="space-y-3">
      {logs.map(log => (
        <div key={log._id} className="bg-surface-card rounded-md p-4">
          <div className="flex justify-between mb-1">
            <p className="text-sm font-medium text-text-primary">{log.action}</p>
            <p className="text-xs text-text-secondary">{new Date(log.createdAt).toLocaleString()}</p>
          </div>
          <p className="text-xs text-text-secondary">{log.actorEmail}</p>
        </div>
      ))}
    </div>
  );
}

// ---- Main page ----

export default function AdminGroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState(true);

  const fetchGroup = useCallback(() => {
    setLoading(true);
    axios.get(`${API_BASE_URL}/admin/groups/${groupId}`)
      .then(r => setGroup(r.data))
      .catch(() => toast.error('Failed to load group'))
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  if (loading) return <div className="max-w-[1200px] mx-auto pt-4 text-sm text-text-secondary">Loading…</div>;
  if (!group) return <div className="max-w-[1200px] mx-auto pt-4 text-sm text-status-overdue-text">Group not found.</div>;

  const status = getStatus(group);
  const badge = STATUS_LABELS[status] || { label: status, cls: 'bg-surface-page text-text-secondary' };

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Back link */}
      <button onClick={() => navigate('/admin/groups')} className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-4">
        <ChevronLeft size={16} />
        All Groups
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-text-primary">{group.name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
          </div>
          <p className="text-sm text-text-secondary mt-0.5">{group.clerkAdminId || 'No admin linked'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto flex gap-2 snap-x mb-6 pb-1">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-shrink-0 snap-start px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-brand-primary text-white'
                : 'border border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-page'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && <OverviewTab group={group} />}
      {activeTab === 'Members' && <MembersTab groupId={groupId} onRefresh={fetchGroup} />}
      {activeTab === 'Settings' && <SettingsTab groupId={groupId} />}
      {activeTab === 'Billing' && <BillingTab group={group} groupId={groupId} onRefresh={fetchGroup} />}
      {activeTab === 'Danger Zone' && <DangerZoneTab group={group} groupId={groupId} onRefresh={fetchGroup} />}
      {activeTab === 'Activity' && <ActivityTab groupId={groupId} />}
    </div>
  );
}
