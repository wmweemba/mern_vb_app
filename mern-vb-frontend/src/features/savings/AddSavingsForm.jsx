import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';
import MemberSelect from '../../components/ui/MemberSelect';

const inputCls = 'h-12 w-full border border-border-default rounded-md px-3.5 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors placeholder:text-text-muted';
const labelCls = 'block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1';

const AddSavingsForm = ({ onSuccess, formId = 'add-savings-form' }) => {
  const [form, setForm] = useState({
    username: '',
    month: '',
    amount: '',
    date: '',
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
      await axios.post(`${API_BASE_URL}/savings`, { ...form });
      setForm({ username: '', month: '', amount: '', date: '', notes: '' });
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add savings');
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
        <label className={labelCls}>Month Number</label>
        <input name="month" value={form.month} onChange={handleChange} type="number" min="1" placeholder="e.g. 1" className={inputCls} required />
      </div>
      <div>
        <label className={labelCls}>Amount (ZMW)</label>
        <input name="amount" value={form.amount} onChange={handleChange} type="number" min="0" placeholder="0.00" className={inputCls} required />
      </div>
      <div>
        <label className={labelCls}>Date</label>
        <input name="date" value={form.date} onChange={handleChange} type="date" className={inputCls} required />
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

export default AddSavingsForm;
