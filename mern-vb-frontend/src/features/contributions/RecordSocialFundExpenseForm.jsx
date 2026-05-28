import { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';
import MemberSelect from '../../components/ui/MemberSelect';

const inputCls = 'h-12 w-full border border-border-default rounded-md px-3.5 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors placeholder:text-text-muted';
const labelCls = 'block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1';

const CATEGORIES = [
  { value: 'birthday',     label: 'Birthday' },
  { value: 'bereavement',  label: 'Bereavement' },
  { value: 'stationery',   label: 'Stationery' },
  { value: 'refreshments', label: 'Refreshments' },
  { value: 'other',        label: 'Other' },
];

const RecordSocialFundExpenseForm = ({ onSuccess, formId = 'record-expense-form' }) => {
  const [form, setForm] = useState({
    amount: '',
    category: 'other',
    description: '',
    date: '',
    beneficiaryName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        amount: form.amount,
        category: form.category,
        description: form.description,
        ...(form.beneficiaryName ? { beneficiaryName: form.beneficiaryName } : {}),
      };
      await axios.post(`${API_BASE_URL}/social-fund/expenses`, payload);
      setForm({ amount: '', category: 'other', description: '', date: '', beneficiaryName: '' });
      window.dispatchEvent(new Event('contributionsChanged'));
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Amount (ZMW)</label>
        <input
          name="amount"
          value={form.amount}
          onChange={handleChange}
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          className={inputCls}
          required
        />
      </div>

      <div>
        <label className={labelCls}>Category</label>
        <select
          name="category"
          value={form.category}
          onChange={handleChange}
          className={inputCls}
        >
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="What was bought or paid for..."
          rows={3}
          className="w-full border border-border-default rounded-md px-3.5 py-3 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors placeholder:text-text-muted resize-none"
          required
        />
      </div>

      <div>
        <label className={labelCls}>Date</label>
        <input
          name="date"
          value={form.date}
          onChange={handleChange}
          type="date"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Paid to (optional)</label>
        <MemberSelect
          value={form.beneficiaryName}
          onChange={val => setForm({ ...form, beneficiaryName: val })}
          placeholder="Search member or leave blank..."
        />
      </div>

      {error && <p className="text-xs text-status-overdue-text">{error}</p>}
      {loading && <p className="text-xs text-text-secondary">Recording...</p>}
    </form>
  );
};

export default RecordSocialFundExpenseForm;
