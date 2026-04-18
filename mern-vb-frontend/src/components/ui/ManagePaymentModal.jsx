import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { API_BASE_URL } from '../../lib/utils';

const ManagePaymentModal = ({ open, onClose, initialType = 'repayment' }) => {
  const [type, setType] = useState(initialType);
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [fineId, setFineId] = useState('');
  const [unpaidFines, setUnpaidFines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setType(initialType);
      setSuccess('');
      setError('');
    }
  }, [open, initialType]);

  useEffect(() => {
    if (open && type === 'fine') {
      axios.get(`${API_BASE_URL}/payments/unpaid-fines`)
        .then(res => setUnpaidFines(res.data))
        .catch(() => setUnpaidFines([]));
    }
  }, [open, type]);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setSuccess('');
    setError('');

    try {
      let response;

      if (type === 'fine') {
        response = await axios.post(`${API_BASE_URL}/payments/pay-fine`, { fineId });
        setSuccess('Fine payment recorded!');
        setFineId('');
        const updatedFines = await axios.get(`${API_BASE_URL}/payments/unpaid-fines`);
        setUnpaidFines(updatedFines.data);
      } else {
        const endpoint = type === 'repayment'
          ? `${API_BASE_URL}/payments/repayment`
          : `${API_BASE_URL}/payments/payout`;
        response = await axios.post(endpoint, { username, amount: Number(amount), note });

        if (type === 'repayment' && response.data.installmentsPaid) {
          const installmentDetails = response.data.installmentsPaid
            .map(inst => `Month ${inst.month}: K${inst.amount}`)
            .join(', ');
          let msg = `Loan payment recorded! Paid: ${installmentDetails}`;
          if (response.data.loanFullyPaid) msg += ' — Loan fully paid!';
          setSuccess(msg);
        } else {
          setSuccess(type === 'repayment' ? 'Loan payment recorded!' : 'Payout recorded!');
        }

        window.dispatchEvent(new CustomEvent('loanDataChanged', { detail: { type, response: response.data } }));
        setUsername('');
        setAmount('');
        setNote('');
      }
    } catch (err) {
      let errorMessage = 'Failed to record payment';
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
        if (err.response.data.details) errorMessage += `: ${err.response.data.details}`;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const tabs = [
    { key: 'repayment', label: 'Loan Payment' },
    { key: 'payout', label: 'Payout' },
    { key: 'fine', label: 'Fine Payment' },
  ];

  const submitLabel = {
    repayment: loading ? 'Recording…' : 'Record Loan Payment',
    payout: loading ? 'Recording…' : 'Record Payout',
    fine: loading ? 'Paying…' : 'Pay Fine',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-card rounded-2xl p-6 w-full max-w-md mx-4 relative">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-text-primary">Manage Payment</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-5 p-1 bg-surface-page rounded-full">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setType(tab.key); setSuccess(''); setError(''); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                type === tab.key
                  ? 'bg-brand-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {type === 'fine' ? (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
                Select Fine
              </label>
              <select
                value={fineId}
                onChange={e => setFineId(e.target.value)}
                className="w-full border border-border-default rounded-md px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary"
                required
              >
                <option value="">Select a fine to pay</option>
                {unpaidFines.map(fine => (
                  <option key={fine._id} value={fine._id}>
                    {fine.userId?.username} ({fine.userId?.name}) — K{Number(fine.amount).toLocaleString()}{fine.note ? ` — ${fine.note}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
                  Username
                </label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full border border-border-default rounded-md px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
                  Amount (ZMW)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-border-default rounded-md px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
                  Note (optional)
                </label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add a note"
                  className="w-full border border-border-default rounded-md px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
              </div>
            </>
          )}

          {success && (
            <p className="text-sm font-medium text-[#2D7A2D] bg-[#E8F5E8] rounded-lg px-3.5 py-2.5">
              {success}
            </p>
          )}
          {error && (
            <p className="text-sm font-medium text-status-overdue-text bg-[#FDECEA] rounded-lg px-3.5 py-2.5">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-border-default text-text-primary rounded-full px-5 py-2 text-sm hover:bg-surface-page transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-primary hover:bg-brand-hover text-white rounded-full px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {submitLabel[type]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManagePaymentModal;
