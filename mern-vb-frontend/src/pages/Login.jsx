import React, { useState } from 'react';
import { useAuth } from '../store/auth';

const Login = () => {
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ok = await login(username, password);
    setSuccess(ok);
    // Optionally redirect here if ok
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-md w-full max-w-xs">
        <h2 className="text-2xl font-bold mb-4 text-[#2979FF]">Village Bank Login</h2>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="mb-2 w-full px-3 py-2 border rounded"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="mb-2 w-full px-3 py-2 border rounded"
          required
        />
        <button
          type="submit"
          className="w-full bg-[#2979FF] text-white py-2 rounded font-semibold mt-2"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
        {error && <div className="text-red-500 mt-2 text-sm">{error}</div>}
        {success && <div className="text-green-600 mt-2 text-sm">Login successful!</div>}
      </form>
    </div>
  );
};

export default Login; 