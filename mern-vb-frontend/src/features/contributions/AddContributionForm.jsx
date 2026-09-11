import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';
import MemberSelect from '../../components/ui/MemberSelect';
import Select from '../../components/ui/Select';

const inputCls = 'h-12 w-full border border-border-default rounded-md px-3.5 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors placeholder:text-text-muted';
const labelCls = 'block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1';

const AddContributionForm = ({ onSuccess, formId = 'add-contribution-form' }) => {
  const [form, setForm] = useState({
    username: '',
    contributionTypeId: '',
    amount: '',
    date: '',
    note: '',
    fundId: '',   // '' = main lending pool; otherwise a GroupFund id
  });
  const [types, setTypes] = useState([]);
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE_URL}/contribution-types?active=true`)
      .then(res => setTypes(res.data))
      .catch(() => {});
    axios.get(`${API_BASE_URL}/funds?active=true`)
      .then(res => setFunds(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);

  // A type's default destination. Legacy types that predate named funds carry
  // only affectsMainBalance=false with no fundId — the backend routes those to
  // the social fund, so mirror that here rather than showing "Main".
  const defaultFundIdFor = (type) => {
    if (!type) return '';
    if (type.fundId) return String(type.fundId);
    if (type.affectsMainBalance === false) {
      const social = funds.find(f => f.key === 'social_fund');
      return social ? String(social._id) : '';
    }
    return '';
  };

  const handleTypeChange = (e) => {
    const id = e.target.value;
    const selected = types.find(t => t._id === id);
    setForm(f => ({
      ...f,
      contributionTypeId: id,
      fundId: defaultFundIdFor(selected),
    }));
  };

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // fundId null = main pool. Sending fundId explicitly (rather than the
      // deprecated affectsMainBalance flag) is what lets a contribution land in
      // any named pot, not just "main or social".
      await axios.post(`${API_BASE_URL}/contributions`, { ...form, fundId: form.fundId || null });
      setForm({ username: '', contributionTypeId: '', amount: '', date: '', note: '', fundId: '' });
      window.dispatchEvent(new Event('contributionsChanged'));
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record contribution');
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
        <label className={labelCls}>Contribution Type</label>
        <Select
          name="contributionTypeId"
          value={form.contributionTypeId}
          onChange={handleTypeChange}
          required
        >
          <option value="">Select type...</option>
          {types.map(t => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </Select>
      </div>

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
        <label className={labelCls}>Notes (optional)</label>
        <textarea
          name="note"
          value={form.note}
          onChange={handleChange}
          placeholder="Any notes..."
          rows={2}
          className="w-full border border-border-default rounded-md px-3.5 py-3 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors placeholder:text-text-muted resize-none"
        />
      </div>

      {/* Destination — shown below type so it's clearly linked. Defaults to the
          type's own fund; changing it is an explicit per-contribution override. */}
      {form.contributionTypeId && (
        <div>
          <label className={labelCls}>Where does this go?</label>
          <Select
            name="fundId"
            value={form.fundId}
            onChange={handleChange}
          >
            <option value="">Main lending pool</option>
            {funds.map(f => (
              <option key={f._id} value={f._id}>{f.name}</option>
            ))}
          </Select>
          {form.fundId !== defaultFundIdFor(types.find(t => t._id === form.contributionTypeId)) && (
            <p className="text-xs text-status-pending-text mt-1.5">
              ⚠ This overrides the type's default destination
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-status-overdue-text">{error}</p>}
      {loading && <p className="text-xs text-text-secondary">Recording...</p>}
    </form>
  );
};

export default AddContributionForm;
