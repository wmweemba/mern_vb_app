import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';

export default function InviteAccept() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { isSignedIn } = useClerkAuth();
  const { refreshMembership } = useAuth();
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isSignedIn || !token) return;
    setStatus('loading');
    axios.post(`${API_BASE_URL}/invites/accept`, { token })
      .then(() => {
        setStatus('success');
        return refreshMembership();
      })
      .then(() => {
        navigate('/dashboard', { replace: true });
      })
      .catch(err => {
        setStatus('error');
        setErrorMsg(err.response?.data?.error || 'Failed to accept invite.');
      });
  }, [isSignedIn, token]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Invalid invite link — no token found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-8 space-y-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Group Invite</h1>

        <SignedOut>
          <p className="text-sm text-gray-600">Sign up or sign in to accept this invite and join the group.</p>
          <Link
            to={`/sign-up?redirect_url=/invite?token=${token}`}
            className="block w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Sign up to join
          </Link>
          <Link
            to={`/sign-in?redirect_url=/invite?token=${token}`}
            className="block w-full border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Already have an account? Sign in
          </Link>
        </SignedOut>

        <SignedIn>
          {status === 'loading' && <p className="text-gray-500 text-sm">Joining group...</p>}
          {status === 'error' && <p className="text-red-600 text-sm">{errorMsg}</p>}
          {status === 'success' && <p className="text-green-600 text-sm">Joined! Redirecting...</p>}
        </SignedIn>
      </div>
    </div>
  );
}
