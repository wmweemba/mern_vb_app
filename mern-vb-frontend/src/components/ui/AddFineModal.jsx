import React, { useState } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
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
    setLoading(true);
    setSuccess('');
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/payments/fine`, form);
      setSuccess('Fine / penalty recorded successfully.');
      setForm({ username: '', amount: '', note: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record fine / penalty');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-card rounded-2xl p-6 w-full max-w-md mx-4 relative">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-text-primary">Issue Fine / Penalty</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
              Username
            </label>
            <input
              name="username"
              value={form.username}
              onChange={handleChange}
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
              name="amount"
              value={form.amount}
              onChange={handleChange}
              placeholder="0.00"
              type="number"
              min="0"
              className="w-full border border-border-default rounded-md px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
              Reason / Note (optional)
            </label>
            <textarea
              name="note"
              value={form.note}
              onChange={handleChange}
              placeholder="Describe the reason for this fine"
              rows={3}
              className="w-full border border-border-default rounded-md px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none"
            />
          </div>

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
              {loading ? 'Issuing…' : 'Issue Fine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddFineModal;
