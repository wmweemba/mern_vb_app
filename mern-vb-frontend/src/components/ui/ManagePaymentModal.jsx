import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';

const ManagePaymentModal = ({ open, onClose }) => {
  const [type, setType] = useState('repayment');
  // const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [fineId, setFineId] = useState('');
  const [unpaidFines, setUnpaidFines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && type === 'fine') {
      axios.get(`${API_BASE_URL}/payments/unpaid-fines`)
        .then(res => setUnpaidFines(res.data))
        .catch(() => setUnpaidFines([]));
    }
  }, [open, type]);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setSuccess(''); setError('');
    try {
      if (type === 'fine') {
        await axios.post(`${API_BASE_URL}/payments/pay-fine`, { fineId });
        setSuccess('Fine payment recorded!');
        setFineId('');
      } else {
        const endpoint = type === 'repayment' ? `${API_BASE_URL}/payments/repayment` : `${API_BASE_URL}/payments/payout`;
        // await axios.post(endpoint, { userId, amount: Number(amount), note });
        await axios.post(endpoint, { username, amount: Number(amount), note });
        setSuccess(type === 'repayment' ? 'Repayment recorded!' : 'Payout recorded!');
        setUserId(''); setAmount(''); setNote('');
      }
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
          <button className={`flex-1 py-2 rounded ${type === 'fine' ? 'bg-red-600 text-white' : 'bg-gray-200'}`} onClick={() => setType('fine')}>Fine Payment</button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {type === 'fine' ? (
            <select value={fineId} onChange={e => setFineId(e.target.value)} className="border rounded px-3 py-2" required>
              <option value="">Select a fine to pay</option>
              {unpaidFines.map(fine => (
                <option key={fine._id} value={fine._id}>
                  {fine.userId?.username} ({fine.userId?.name}) - K{Number(fine.amount).toLocaleString()} {fine.note ? `- ${fine.note}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <>
              {/* <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="User ID" className="border rounded px-3 py-2" required /> */}
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="border rounded px-3 py-2" required />
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" className="border rounded px-3 py-2" required />
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className="border rounded px-3 py-2" />
            </>
          )}
          <button type="submit" className="bg-green-600 text-white rounded py-2 mt-2" disabled={loading}>{loading ? (type === 'repayment' ? 'Recording...' : type === 'payout' ? 'Paying...' : 'Paying Fine...') : (type === 'repayment' ? 'Record Repayment' : type === 'payout' ? 'Record Payout' : 'Pay Fine')}</button>
          {success && <div className="text-green-600 text-sm mt-1">{success}</div>}
          {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
        </form>
      </div>
    </div>
  );
};

export default ManagePaymentModal; 