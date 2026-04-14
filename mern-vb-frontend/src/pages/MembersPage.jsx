import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { UserPlus } from 'lucide-react';
import SlideoverDrawer from '../components/ui/SlideoverDrawer';
import { API_BASE_URL } from '../lib/utils';
import { useAuth } from '../store/auth';

const AVATAR_COLORS = [
  { bg: '#F5E6DC', text: '#C8501A' },
  { bg: '#E8F0F8', text: '#2C5F8A' },
  { bg: '#EAF5E8', text: '#2D7A2D' },
  { bg: '#F5EAF0', text: '#8A2C5F' },
  { bg: '#F8F0E8', text: '#8A5F2C' },
  { bg: '#E8F5F0', text: '#2C8A6B' },
];

function avatarColor(name = '') {
  const code = name.charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function RoleBadge({ role }) {
  const styles = {
    admin: 'bg-[#FDECEA] text-[#C62828]',
    treasurer: 'bg-[#E8F0F8] text-[#2C5F8A]',
    loan_officer: 'bg-[#EAF5E8] text-[#2D7A2D]',
    member: 'bg-[#F0EDE8] text-[#6B6560]',
  };
  const labels = {
    admin: 'Admin',
    treasurer: 'Treasurer',
    loan_officer: 'Loan Officer',
    member: 'Member',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[role] || styles.member}`}>
      {labels[role] || role}
    </span>
  );
}

function MemberRow({ member }) {
  const color = avatarColor(member.name);
  const initials = member.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border-default last:border-b-0">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={{ backgroundColor: color.bg, color: color.text }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary truncate">{member.name}</p>
        {member.email && (
          <p className="text-xs text-text-secondary truncate">{member.email}</p>
        )}
      </div>
      <RoleBadge role={member.role} />
    </div>
  );
}

function InviteDrawer({ open, onClose, onInvited }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'member' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/invites/email`, form);
      toast.success(`Invite sent to ${form.email}`);
      setForm({ name: '', email: '', role: 'member' });
      onClose();
      onInvited();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to send invite. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <button
      form="invite-form"
      type="submit"
      disabled={loading}
      className="w-full bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full py-2.5 transition-colors disabled:opacity-60"
    >
      {loading ? 'Sending…' : 'Send Invite'}
    </button>
  );

  return (
    <SlideoverDrawer open={open} onClose={onClose} title="Invite Member" footer={footer}>
      <form id="invite-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
            Full Name
          </label>
          <input
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Grace Phiri"
            className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-text-muted"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
            Email Address
          </label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="grace@example.com"
            className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-text-muted"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
            Role
          </label>
          <select
            name="role"
            value={form.role}
            onChange={handleChange}
            className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value="member">Member</option>
            <option value="treasurer">Treasurer</option>
            <option value="loan_officer">Loan Officer</option>
          </select>
        </div>
        {error && (
          <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </form>
    </SlideoverDrawer>
  );
}

export default function MembersPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const canInvite = user && user.role !== 'member';

  async function fetchData() {
    try {
      const [membersRes, pendingRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/invites`),
        axios.get(`${API_BASE_URL}/invites/pending`),
      ]);
      setMembers(membersRes.data);
      setPending(pendingRes.data);
    } catch {
      // silently fail — members will be empty
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Members</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {members.length} active member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canInvite && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full px-4 py-2 transition-colors"
          >
            <UserPlus size={16} />
            <span>Invite Member</span>
          </button>
        )}
      </div>

      {/* Member list */}
      <div className="bg-surface-card rounded-xl border border-border-default px-4 mb-6">
        {loading ? (
          <div className="py-10 text-center text-sm text-text-secondary">Loading members…</div>
        ) : members.length === 0 ? (
          <div className="py-10 text-center text-sm text-text-secondary">
            No members yet. Invite your first member to get started.
          </div>
        ) : (
          members.map(m => <MemberRow key={m._id} member={m} />)
        )}
      </div>

      {/* Pending invites */}
      {pending.length > 0 && (
        <div className="bg-surface-card rounded-xl border border-border-default px-4">
          <div className="border-b border-border-default py-3">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Pending Invites
            </h2>
          </div>
          {pending.map(inv => (
            <div key={inv._id} className="flex items-center gap-3 py-3 border-b border-border-default last:border-b-0">
              <div className="w-10 h-10 rounded-full bg-[#FFF0E0] flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-[#B85A00]">?</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{inv.name}</p>
                <p className="text-xs text-text-secondary truncate">{inv.email}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <RoleBadge role={inv.role} />
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#FFF0E0] text-[#B85A00]">
                  Pending
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <InviteDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onInvited={fetchData}
      />
    </div>
  );
}
