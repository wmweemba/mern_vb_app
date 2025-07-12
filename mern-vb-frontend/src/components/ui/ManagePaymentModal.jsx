import React, { useState } from 'react';
import axios from 'axios';

const ManagePaymentModal = ({ open, onClose }) => {
  const [type, setType] = useState('repayment');
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setSuccess(''); setError('');
    try {
      const endpoint = type === 'repayment' ? '/api/payments/repayment' : '/api/payments/payout';
      await axios.post(endpoint, { userId, amount: Number(amount), note });
      setSuccess(type === 'repayment' ? 'Repayment recorded!' : 'Payout recorded!');
      setUserId(''); setAmount(''); setNote('');
    } catch (err) {
      setError('Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded shadow-lg p-6 w-full max-w-sm relative">
        <button className="absolute top-2 right-2 text-gray-500" onClick={onClose}>&times;</button>
        <h2 className="text-lg font-bold mb-4">Manage Payment</h2>
        <div className="flex gap-2 mb-4">
          <button className={`flex-1 py-2 rounded ${type === 'repayment' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`} onClick={() => setType('repayment')}>Repayment</button>
          <button className={`flex-1 py-2 rounded ${type === 'payout' ? 'bg-yellow-600 text-white' : 'bg-gray-200'}`} onClick={() => setType('payout')}>Payout</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="User ID" className="border rounded px-3 py-2" required />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" className="border rounded px-3 py-2" required />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className="border rounded px-3 py-2" />
          <button type="submit" className="bg-green-600 text-white rounded py-2 mt-2" disabled={loading}>{loading ? (type === 'repayment' ? 'Recording...' : 'Paying...') : (type === 'repayment' ? 'Record Repayment' : 'Record Payout')}</button>
          {success && <div className="text-green-600 text-sm mt-1">{success}</div>}
          {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
        </form>
      </div>
    </div>
  );
};

export default ManagePaymentModal; 