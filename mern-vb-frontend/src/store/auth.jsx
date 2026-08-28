import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import axios from 'axios';
import { API_BASE_URL } from '../lib/utils';

const AppContext = createContext();

export const AuthProvider = ({ children }) => {
  const { getToken, isSignedIn, isLoaded } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [groupMember, setGroupMember] = useState(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [trialActive, setTrialActive] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminMode, setAdminMode] = useState(() => sessionStorage.getItem('adminMode') === 'true');

  // Interceptor: inject a fresh Clerk token before every axios request.
  // getToken() auto-refreshes when the 2-min JWT is about to expire — so this
  // always attaches a valid token regardless of how long ago the user signed in.
  //
  // Deliberately does NOT gate on `isSignedIn`: that value is captured in this
  // effect's closure at registration time, and a page that fires a request the
  // instant isSignedIn flips true (e.g. InviteAccept, right after a redirect_url
  // sign-up) can call in before this effect re-runs with the fresh value — the
  // stale closure still reads `false` and silently skips the auth header,
  // producing a 401 the caller never expected. getToken() itself always reads
  // Clerk's live session state, so it's safe to call unconditionally: it
  // resolves to null when signed out and a valid token the instant signed in,
  // with no dependency on effect ordering.
  useEffect(() => {
    const id = axios.interceptors.request.use(async config => {
      const token = await getToken();
      if (token) config.headers['Authorization'] = `Bearer ${token}`;
      return config;
    });
    return () => axios.interceptors.request.eject(id);
  }, [getToken]);

  // Global 403 trial_expired handler
  useEffect(() => {
    const id = axios.interceptors.response.use(
      response => response,
      error => {
        if (error?.response?.status === 403 && error?.response?.data?.error === 'trial_expired') {
          setTrialActive(false);
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, []);

  // Fetch group membership once the interceptor is installed.
  // Passes token explicitly to avoid race condition on first load.
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setGroupMember(null);
      setNeedsOnboarding(false);
      setAuthLoading(false);
      setIsSuperAdmin(false);
      setAdminMode(false);
      sessionStorage.removeItem('adminMode');
      return;
    }

    setAuthLoading(true);
    getToken().then(token => {
      if (!token) { setAuthLoading(false); return; }
      axios.get(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          if (res.data.isSuperAdmin) {
            setIsSuperAdmin(true);
            setGroupMember(res.data);
            setTrialActive(false); // super admins never see the trial banner
            setNeedsOnboarding(false);
          } else {
            setGroupMember(res.data);
            setTrialActive(res.data.trialActive);
            setNeedsOnboarding(false);
          }
        })
        .catch(err => {
          if (err?.response?.data?.code === 'NO_GROUP') {
            setNeedsOnboarding(true);
          }
        })
        .finally(() => setAuthLoading(false));
    });
  }, [isSignedIn, isLoaded]);

  const applyAdminMode = next => {
    setAdminMode(next);
    sessionStorage.setItem('adminMode', String(next));
  };

  const toggleAdminMode = () => applyAdminMode(!adminMode);

  const refreshMembership = () => {
    return getToken().then(token => {
      return axios.get(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        if (res.data.isSuperAdmin) {
          setIsSuperAdmin(true);
          setGroupMember(res.data);
          setTrialActive(false);
        } else {
          setGroupMember(res.data);
          setTrialActive(res.data.trialActive);
        }
        setNeedsOnboarding(false);
      });
    });
  };

  const value = {
    isLoaded,
    isSignedIn,
    clerkUser,
    user: groupMember,       // { _id, name, role, groupId } — backward compat
    needsOnboarding,
    authLoading,
    refreshMembership,
    trialActive,
    isSuperAdmin,
    adminMode,
    toggleAdminMode,
    applyAdminMode,
    logout: () => {},
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAuth = () => useContext(AppContext);
