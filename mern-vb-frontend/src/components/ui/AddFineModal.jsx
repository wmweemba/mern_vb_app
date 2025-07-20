import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';

const AddFineModal = ({ open, onClose }) => {
  const [form, setForm] = useState({ username: '', amount: '', note: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setSuccess(''); setError('');
    try {
      await axios.post(`${API_BASE_URL}/payments/fine`, form);
      setSuccess('Fine/Penalty recorded!');
      setForm({ username: '', amount: '', note: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record fine/penalty');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded shadow-lg p-6 w-full max-w-sm relative">
        <button className="absolute top-2 right-2 text-gray-500" onClick={onClose}>&times;</button>
        <h2 className="text-lg font-bold mb-4">Add Fine / Penalty</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input name="username" value={form.username} onChange={handleChange} placeholder="Username" className="border rounded px-3 py-2" required />
          <input name="amount" value={form.amount} onChange={handleChange} placeholder="Amount" type="number" min="0" className="border rounded px-3 py-2" required />
          <textarea name="note" value={form.note} onChange={handleChange} placeholder="Note (optional)" className="border rounded px-3 py-2" />
          <button type="submit" className="bg-red-600 text-white rounded py-2 mt-2" disabled={loading}>{loading ? 'Adding...' : 'Add Fine/Penalty'}</button>
          {success && <div className="text-green-600 text-sm mt-1">{success}</div>}
          {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
        </form>
      </div>
    </div>
  );
};

export default AddFineModal; 