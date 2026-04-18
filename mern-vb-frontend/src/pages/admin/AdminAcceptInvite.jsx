import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useSignIn } from '@clerk/clerk-react';
import { API_BASE_URL } from '../../lib/utils';
import { useAuth } from '../../store/auth';

export default function AdminAcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { isSignedIn, refreshMembership } = useAuth();
  const { signIn } = useSignIn();
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const handleAccept = async () => {
    setStatus('loading');
    try {
      await axios.post(`${API_BASE_URL}/admin/super-admins/accept-invite`, { token });
      await refreshMembership();
      setStatus('success');
      toast.success('Super admin access granted');
      setTimeout(() => navigate('/admin'), 1500);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.response?.data?.error || 'Failed to accept invite');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-page px-4">
        <div className="bg-surface-card rounded-xl p-8 max-w-sm w-full text-center shadow-lg">
          <p className="text-sm text-status-overdue-text">Invalid invite link — token is missing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page px-4">
      <div className="bg-surface-card rounded-xl p-8 max-w-sm w-full shadow-lg text-center">
        <div className="w-12 h-12 rounded-full bg-brand-primary flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-lg">C</span>
        </div>
        <h1 className="text-xl font-bold text-text-primary mb-2">Platform Admin Invite</h1>
        <p className="text-sm text-text-secondary mb-6">
          You have been invited to become a Chama360 Super Admin.
        </p>

        {status === 'success' && (
          <div className="bg-surface-page rounded-lg p-3 mb-4">
            <p className="text-sm text-text-primary font-medium">Access granted! Redirecting…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-status-overdue-bg rounded-lg p-3 mb-4">
            <p className="text-sm text-status-overdue-text">{errorMsg}</p>
          </div>
        )}

        {isSignedIn ? (
          <button
            onClick={handleAccept}
            disabled={status === 'loading' || status === 'success'}
            className="w-full bg-brand-primary text-white rounded-full py-3 text-sm font-semibold disabled:opacity-50"
          >
            {status === 'loading' ? 'Accepting…' : 'Accept Super Admin Invite'}
          </button>
        ) : (
          <a
            href={`/sign-in?redirect_url=${encodeURIComponent(`/admin/accept-invite?token=${token}`)}`}
            className="block w-full bg-brand-primary text-white rounded-full py-3 text-sm font-semibold text-center"
          >
            Sign In to Accept
          </a>
        )}
      </div>
    </div>
  );
}
