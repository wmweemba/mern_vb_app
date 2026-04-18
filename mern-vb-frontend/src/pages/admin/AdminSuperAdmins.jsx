import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { API_BASE_URL } from '../../lib/utils';
import { useAuth } from '../../store/auth';
import TypedConfirmationModal from '../../components/ui/TypedConfirmationModal';

export default function AdminSuperAdmins() {
  const [data, setData] = useState({ admins: [], pendingInvites: [] });
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const { clerkUser } = useAuth();

  const myClerkId = clerkUser?.id;

  const fetchData = useCallback(() => {
    setLoading(true);
    axios.get(`${API_BASE_URL}/admin/super-admins`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load super admins'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error('Email is required'); return; }
    setInviting(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/admin/super-admins/invite`, { email: inviteEmail });
      setInviteResult(res.data);
      setInviteEmail('');
      toast.success('Invite sent');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send invite');
    } finally { setInviting(false); }
  };

  const handleRevoke = async () => {
    try {
      await axios.delete(`${API_BASE_URL}/admin/super-admins/${revokeTarget._id}`);
      toast.success('Super admin access revoked');
      setRevokeTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to revoke');
    }
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link);
    toast.success('Link copied');
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Super Admins</h1>
          <p className="text-sm text-text-secondary">Manage platform administrator access</p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setInviteResult(null); }}
          className="bg-brand-primary text-white text-sm font-semibold rounded-full px-5 h-11 hover:opacity-90 transition-opacity"
        >
          Invite Super Admin
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-text-secondary">Loading…</div>
      ) : (
        <div className="space-y-6">
          {/* Active admins */}
          <div className="bg-surface-card rounded-lg p-5 md:p-6">
            <h2 className="text-base font-semibold text-text-primary mb-4">Active Super Admins</h2>
            {data.admins.length === 0 ? (
              <p className="text-sm text-text-secondary">No active super admins.</p>
            ) : (
              <div className="space-y-3">
                {data.admins.map(a => (
                  <div key={a._id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border-default last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{a.email}</p>
                      <p className="text-xs text-text-secondary">
                        {a.name || 'No name'} · Added {new Date(a.createdAt).toLocaleDateString()}
                        {a.invitedBy && ` · Invited by ${a.invitedBy}`}
                      </p>
                    </div>
                    {a.clerkUserId !== myClerkId && (
                      <button
                        onClick={() => setRevokeTarget(a)}
                        className="text-xs text-status-overdue-text border border-status-overdue-bg rounded-full px-3 py-1.5 hover:bg-status-overdue-bg transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending invites */}
          {data.pendingInvites.length > 0 && (
            <div className="bg-surface-card rounded-lg p-5 md:p-6">
              <h2 className="text-base font-semibold text-text-primary mb-4">Pending Invites</h2>
              <div className="space-y-3">
                {data.pendingInvites.map(inv => (
                  <div key={inv._id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border-default last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{inv.email}</p>
                      <p className="text-xs text-text-secondary">Expires {new Date(inv.expiresAt).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => copyLink(`${window.location.origin}/admin/accept-invite?token=${inv.token}`)}
                      className="text-xs border border-border-default rounded-full px-3 py-1.5 text-text-secondary hover:bg-surface-page"
                    >
                      Copy Link
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invite drawer */}
      {showInvite && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowInvite(false)} />
          <div className="fixed bottom-0 left-0 right-0 md:top-0 md:right-0 md:left-auto md:bottom-0 md:w-[400px] bg-surface-card z-50 shadow-xl flex flex-col rounded-t-xl md:rounded-none md:rounded-l-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
              <h3 className="text-base font-bold text-text-primary">Invite Super Admin</h3>
              <button onClick={() => setShowInvite(false)}><X size={20} className="text-text-secondary" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary"
                  placeholder="email@example.com"
                />
                <p className="text-xs text-text-secondary mt-1">An email will be sent via Resend.</p>
              </div>
              {inviteResult?.warning && (
                <div className="bg-surface-page rounded-lg p-3 space-y-2">
                  <p className="text-xs text-text-secondary">{inviteResult.warning}</p>
                  <p className="text-xs font-mono break-all text-text-primary">{inviteResult.inviteLink}</p>
                  <button onClick={() => copyLink(inviteResult.inviteLink)} className="text-xs text-brand-primary hover:underline">Copy link</button>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border-default">
              <button onClick={handleInvite} disabled={inviting} className="w-full bg-brand-primary text-white rounded-full py-3 text-sm font-semibold disabled:opacity-50">
                {inviting ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </>
      )}

      <TypedConfirmationModal
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title={`Revoke "${revokeTarget?.email}"?`}
        description="This person will immediately lose super admin access."
        confirmWord={revokeTarget?.email}
        confirmLabel="Revoke Access"
        danger
      />
    </div>
  );
}
