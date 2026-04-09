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

  // Interceptor: inject a fresh Clerk token before every axios request.
  // getToken() auto-refreshes when the 2-min JWT is about to expire — so this
  // always attaches a valid token regardless of how long ago the user signed in.
  useEffect(() => {
    const id = axios.interceptors.request.use(async config => {
      if (isSignedIn) {
        const token = await getToken();
        if (token) config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    });
    return () => axios.interceptors.request.eject(id);
  }, [isSignedIn, getToken]);

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

  const refreshMembership = () => {
    return getToken().then(token => {
      return axios.get(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        if (res.data.isSuperAdmin) {
          setIsSuperAdmin(true);
          setGroupMember(res.data);
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
    // Legacy compat shim — old code that calls logout() will just sign out via Clerk
    logout: () => {},
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAuth = () => useContext(AppContext);
