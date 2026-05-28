import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';
import MemberSelect from '../../components/ui/MemberSelect';

const inputCls = 'h-12 w-full border border-border-default rounded-md px-3.5 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors placeholder:text-text-muted';
const labelCls = 'block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1';

function RoutingToggle({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex items-start gap-2.5 px-3 py-3 rounded-md border text-left transition-colors ${
          value
            ? 'bg-brand-light border-brand-primary/40 text-brand-primary'
            : 'bg-surface-card border-border-default text-text-secondary'
        }`}
      >
        <div className={`w-3.5 h-3.5 rounded-full mt-0.5 flex-shrink-0 ${value ? 'bg-brand-primary' : 'bg-border-default'}`} />
        <div>
          <p className="text-xs font-semibold leading-tight">Goes to main account</p>
          <p className="text-xs leading-tight opacity-70 mt-0.5">Available to lend</p>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex items-start gap-2.5 px-3 py-3 rounded-md border text-left transition-colors ${
          !value
            ? 'bg-blue-50 border-blue-300 text-blue-700'
            : 'bg-surface-card border-border-default text-text-secondary'
        }`}
      >
        <div className={`w-3.5 h-3.5 rounded-full mt-0.5 flex-shrink-0 ${!value ? 'bg-blue-600' : 'bg-border-default'}`} />
        <div>
          <p className="text-xs font-semibold leading-tight">Goes to social fund</p>
          <p className="text-xs leading-tight opacity-70 mt-0.5">Tracked separately</p>
        </div>
      </button>
    </div>
  );
}

const AddContributionForm = ({ onSuccess, formId = 'add-contribution-form' }) => {
  const [form, setForm] = useState({
    username: '',
    contributionTypeId: '',
    amount: '',
    date: '',
    note: '',
    affectsMainBalance: true,
  });
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE_URL}/contribution-types?active=true`)
      .then(res => setTypes(res.data))
      .catch(() => {});
  }, []);

  const handleTypeChange = (e) => {
    const id = e.target.value;
    const selected = types.find(t => t._id === id);
    setForm(f => ({
      ...f,
      contributionTypeId: id,
      affectsMainBalance: selected ? selected.affectsMainBalance : f.affectsMainBalance,
    }));
  };

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/contributions`, form);
      setForm({ username: '', contributionTypeId: '', amount: '', date: '', note: '', affectsMainBalance: true });
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
        <select
          name="contributionTypeId"
          value={form.contributionTypeId}
          onChange={handleTypeChange}
          className={inputCls}
          required
        >
          <option value="">Select type...</option>
          {types.map(t => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </select>
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

      {/* Routing toggle — shown below type so it's clearly linked */}
      {form.contributionTypeId && (
        <div>
          <label className={labelCls}>Where does this go?</label>
          <RoutingToggle
            value={form.affectsMainBalance}
            onChange={val => setForm({ ...form, affectsMainBalance: val })}
          />
          {form.affectsMainBalance !== (types.find(t => t._id === form.contributionTypeId)?.affectsMainBalance ?? true) && (
            <p className="text-xs text-status-pending-text mt-1.5">
              ⚠ This overrides the type's default routing
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
