import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';
import MemberSelect from '../../components/ui/MemberSelect';
import Select from '../../components/ui/Select';

const inputCls = 'h-12 w-full border border-border-default rounded-md px-3.5 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors placeholder:text-text-muted';
const labelCls = 'block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1';

const CATEGORIES = [
  { value: 'birthday',     label: 'Birthday' },
  { value: 'bereavement',  label: 'Bereavement' },
  { value: 'stationery',   label: 'Stationery' },
  { value: 'refreshments', label: 'Refreshments' },
  { value: 'app_subscription', label: 'App Subscription' },
  { value: 'other',        label: 'Other' },
];

const RecordSocialFundExpenseForm = ({ onSuccess, initialFundId = null, formId = 'record-expense-form' }) => {
  const [funds, setFunds] = useState([]);
  const [form, setForm] = useState({
    fundId: '',
    amount: '',
    category: 'other',
    description: '',
    date: '',
    beneficiaryName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // A group can hold several pots, so the expense has to say which one it comes
  // out of. Defaults to the first active fund, which for most groups is the only one.
  useEffect(() => {
    axios.get(`${API_BASE_URL}/funds?active=true`)
      .then(res => {
        setFunds(res.data);
        if (res.data.length) setForm(f => ({ ...f, fundId: initialFundId || f.fundId || res.data[0]._id }));
      })
      .catch(() => setFunds([]));
  }, [initialFundId]);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        fundId: form.fundId || undefined,
        amount: form.amount,
        category: form.category,
        description: form.description,
        ...(form.beneficiaryName ? { beneficiaryName: form.beneficiaryName } : {}),
      };
      await axios.post(`${API_BASE_URL}/funds/expenses`, payload);
      setForm(f => ({ fundId: f.fundId, amount: '', category: 'other', description: '', date: '', beneficiaryName: '' }));
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
      {funds.length > 1 && (
        <div>
          <label className={labelCls}>Pay from</label>
          <Select name="fundId" value={form.fundId} onChange={handleChange}>
            {funds.map(f => (
              <option key={f._id} value={f._id}>{f.name}</option>
            ))}
          </Select>
        </div>
      )}
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
        <Select
          name="category"
          value={form.category}
          onChange={handleChange}
        >
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
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
