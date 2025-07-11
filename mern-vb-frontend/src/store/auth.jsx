import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      // Optionally fetch user info here
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  // Axios interceptor for auth
  useEffect(() => {
    const reqInterceptor = axios.interceptors.request.use(
      (config) => {
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (err) => Promise.reject(err)
    );
    return () => axios.interceptors.request.eject(reqInterceptor);
  }, [token]);

  const login = async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/auth/login', { username, password });
      setToken(res.data.token);
      setUser(res.data.user);
      setLoading(false);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      setLoading(false);
      return false;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext); 