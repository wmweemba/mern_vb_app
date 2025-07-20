import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../store/auth';
import { API_BASE_URL } from '../../lib/utils';

const ChangePasswordModal = ({ open, onClose }) => {
  const { user } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setSuccess(''); setError('');
    try {
      await axios.put(`${API_BASE_URL}/users/${user.id}/password`, { oldPassword, newPassword });
      setSuccess('Password changed successfully!');
      setOldPassword(''); setNewPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded shadow-lg p-6 w-full max-w-sm relative">
        <button className="absolute top-2 right-2 text-gray-500" onClick={onClose}>&times;</button>
        <h2 className="text-lg font-bold mb-4">Change Password</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="Old Password" className="border rounded px-3 py-2" required />
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New Password" className="border rounded px-3 py-2" required />
          <button type="submit" className="bg-blue-600 text-white rounded py-2 mt-2" disabled={loading}>{loading ? 'Changing...' : 'Change Password'}</button>
          {success && <div className="text-green-600 text-sm mt-1">{success}</div>}
          {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal; 