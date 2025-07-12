import React, { useState } from 'react';
import axios from 'axios';

const AddLoanForm = ({ onSuccess }) => {
  const [form, setForm] = useState({
    member: '',
    amount: '',
    interest: '',
    startDate: '',
    duration: '',
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
      await axios.post('/api/loans', form);
      setSuccess(true);
      setForm({ member: '', amount: '', interest: '', startDate: '', duration: '', notes: '' });
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add loan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded shadow p-4 w-full max-w-md mx-auto flex flex-col gap-3">
      <h2 className="text-lg font-bold mb-2">Add New Loan</h2>
      <input name="member" value={form.member} onChange={handleChange} placeholder="Member Name or ID" className="border rounded px-3 py-2" required />
      <input name="amount" value={form.amount} onChange={handleChange} placeholder="Amount" type="number" min="0" className="border rounded px-3 py-2" required />
      <input name="interest" value={form.interest} onChange={handleChange} placeholder="Interest Rate (%)" type="number" min="0" step="0.01" className="border rounded px-3 py-2" required />
      <input name="startDate" value={form.startDate} onChange={handleChange} placeholder="Start Date" type="date" className="border rounded px-3 py-2" required />
      <input name="duration" value={form.duration} onChange={handleChange} placeholder="Duration (months)" type="number" min="1" className="border rounded px-3 py-2" required />
      <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Notes (optional)" className="border rounded px-3 py-2" />
      <button type="submit" className="bg-blue-600 text-white rounded py-2 mt-2" disabled={loading}>{loading ? 'Adding...' : 'Add Loan'}</button>
      {success && <div className="text-green-600 text-sm mt-1">Loan added successfully!</div>}
      {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
    </form>
  );
};

export default AddLoanForm; 