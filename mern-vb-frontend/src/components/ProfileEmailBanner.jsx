import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ProfileEmailBanner() {
  const { user, isSuperAdmin, refreshMembership } = useAuth();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!user || isSuperAdmin || user.email) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await axios.put(`${API_BASE_URL}/users/me/email`, { email: trimmed });
      toast.success('Email added');
      await refreshMembership();
      setEditing(false);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-status-pending-bg border-b border-status-pending-text/20 px-4 py-3 text-sm text-status-pending-text">
      <div className="max-w-7xl mx-auto">
        {!editing ? (
          <div className="flex items-center justify-between gap-4">
            <p>Your account has no email on file. Add one to receive notifications and use support tickets.</p>
            <button
              onClick={() => setEditing(true)}
              className="flex-shrink-0 bg-brand-primary hover:bg-brand-hover text-white text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
            >
              Add Email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 min-w-0 border border-status-pending-text/30 rounded-md px-3 py-1.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="submit"
                disabled={saving}
                className="bg-brand-primary hover:bg-brand-hover text-white text-xs font-semibold rounded-full px-3 py-1.5 transition-colors disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setError(null); }}
                className="text-xs font-medium text-status-pending-text hover:underline"
              >
                Cancel
              </button>
            </div>
            {error && <p className="text-xs text-status-overdue-text sm:ml-2">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
