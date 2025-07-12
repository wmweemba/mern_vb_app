import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ManageBankBalanceModal = ({ open, onClose }) => {
  const [balance, setBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSuccess(''); setError('');
      axios.get('/api/bank-balance').then(res => {
        setBalance(res.data.balance);
      }).catch(() => setBalance(''));
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setSuccess(''); setError('');
    try {
      await axios.put('/api/bank-balance', { balance: Number(balance) });
      setSuccess('Bank balance updated!');
    } catch (err) {
      setError('Failed to update bank balance');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded shadow-lg p-6 w-full max-w-sm relative">
        <button className="absolute top-2 right-2 text-gray-500" onClick={onClose}>&times;</button>
        <h2 className="text-lg font-bold mb-4">Manage Bank Balance</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="font-medium">Current Balance</label>
          <input type="number" value={balance} onChange={e => setBalance(e.target.value)} className="border rounded px-3 py-2" required />
          <button type="submit" className="bg-blue-600 text-white rounded py-2 mt-2" disabled={loading}>{loading ? 'Updating...' : 'Update Balance'}</button>
          {success && <div className="text-green-600 text-sm mt-1">{success}</div>}
          {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
        </form>
      </div>
    </div>
  );
};

export default ManageBankBalanceModal; 