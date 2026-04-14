import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';
import MemberSelect from '../../components/ui/MemberSelect';

const inputCls = 'h-12 w-full border border-border-default rounded-md px-3.5 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors placeholder:text-text-muted';
const labelCls = 'block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1';

const AddLoanForm = ({ onSuccess, formId = 'add-loan-form' }) => {
  const [form, setForm] = useState({
    username: '',
    amount: '',
    interest: '',
    startDate: '',
    duration: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/loans`, { ...form });
      setForm({ username: '', amount: '', interest: '', startDate: '', duration: '', notes: '' });
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add loan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Member</label>
        <MemberSelect
          value={form.username}
          onChange={val => setForm({ ...form, username: val })}
          placeholder="Search member name..."
        />
      </div>
      <div>
        <label className={labelCls}>Amount (ZMW)</label>
        <input name="amount" value={form.amount} onChange={handleChange} type="number" min="0" placeholder="0.00" className={inputCls} required />
      </div>
      <div>
        <label className={labelCls}>Interest Rate (%)</label>
        <input name="interest" value={form.interest} onChange={handleChange} type="number" min="0" step="0.01" placeholder="e.g. 10" className={inputCls} required />
      </div>
      <div>
        <label className={labelCls}>Start Date</label>
        <input name="startDate" value={form.startDate} onChange={handleChange} type="date" className={inputCls} required />
      </div>
      <div>
        <label className={labelCls}>Duration (months)</label>
        <input name="duration" value={form.duration} onChange={handleChange} type="number" min="1" placeholder="e.g. 6" className={inputCls} required />
      </div>
      <div>
        <label className={labelCls}>Notes (optional)</label>
        <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Any notes..." rows={3}
          className="w-full border border-border-default rounded-md px-3.5 py-3 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors placeholder:text-text-muted resize-none" />
      </div>
      {error && <p className="text-xs text-status-overdue-text">{error}</p>}
      {loading && <p className="text-xs text-text-secondary">Saving...</p>}
    </form>
  );
};

export default AddLoanForm;
