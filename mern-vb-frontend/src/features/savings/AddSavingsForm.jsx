import React, { useState } from 'react';
import axios from 'axios';

const AddSavingsForm = ({ onSuccess }) => {
  const [form, setForm] = useState({
    member: '',
    amount: '',
    date: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      await axios.post('/api/savings', form);
      setSuccess(true);
      setForm({ member: '', amount: '', date: '', notes: '' });
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add savings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded shadow p-4 w-full max-w-md mx-auto flex flex-col gap-3">
      <h2 className="text-lg font-bold mb-2">Add Savings</h2>
      <input name="member" value={form.member} onChange={handleChange} placeholder="Member Name or ID" className="border rounded px-3 py-2" required />
      <input name="amount" value={form.amount} onChange={handleChange} placeholder="Amount" type="number" min="0" className="border rounded px-3 py-2" required />
      <input name="date" value={form.date} onChange={handleChange} placeholder="Date" type="date" className="border rounded px-3 py-2" required />
      <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Notes (optional)" className="border rounded px-3 py-2" />
      <button type="submit" className="bg-green-600 text-white rounded py-2 mt-2" disabled={loading}>{loading ? 'Adding...' : 'Add Savings'}</button>
      {success && <div className="text-green-600 text-sm mt-1">Savings added successfully!</div>}
      {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
    </form>
  );
};

export default AddSavingsForm; 