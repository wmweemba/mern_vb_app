import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import SlideoverDrawer from '../ui/SlideoverDrawer';
import { API_BASE_URL } from '../../lib/utils';

export default function FinancialRulesDrawer({ open, onClose, onSaved, settings }) {
  const [interestRate, setInterestRate] = useState('');
  const [interestMethod, setInterestMethod] = useState('reducing');
  const [loanLimitMultiplier, setLoanLimitMultiplier] = useState('');
  const [profitSharingMethod, setProfitSharingMethod] = useState('proportional');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (settings && open) {
      setInterestRate(String(settings.interestRate ?? ''));
      setInterestMethod(settings.interestMethod || 'reducing');
      setLoanLimitMultiplier(String(settings.loanLimitMultiplier ?? ''));
      setProfitSharingMethod(settings.profitSharingMethod || 'proportional');
      setError(null);
    }
  }, [settings, open]);

  async function handleSubmit(e) {
    e.preventDefault();
    const rate = Number(interestRate);
    const multiplier = Number(loanLimitMultiplier);
    if (rate < 1 || rate > 50) {
      setError('Interest rate must be between 1 and 50%.');
      return;
    }
    if (multiplier < 1 || multiplier > 10) {
      setError('Multiplier must be between 1 and 10.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        interestRate: rate,
        interestMethod,
        loanLimitMultiplier: multiplier,
        profitSharingMethod,
      };
      const res = await axios.put(`${API_BASE_URL}/group-settings`, payload);
      toast.success('Financial rules updated');
      onSaved(res.data.settings);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full border border-border-default rounded-md px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary';
  const labelClass = 'text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5';

  const footer = (
    <button
      type="submit"
      form="financial-rules-form"
      disabled={saving}
      className="w-full bg-brand-primary hover:bg-brand-hover text-white font-semibold rounded-md px-5 py-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {saving ? 'Saving…' : 'Save Changes'}
    </button>
  );

  return (
    <SlideoverDrawer open={open} onClose={onClose} title="Edit Financial Rules" footer={footer}>
      <form id="financial-rules-form" onSubmit={handleSubmit}>
        {error && (
          <div className="bg-status-overdue-bg border border-status-overdue-text/30 text-status-overdue-text text-sm rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <p className={labelClass}>Interest Rate</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="1"
                max="50"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className={inputClass}
              />
              <span className="text-sm text-text-secondary flex-shrink-0">%</span>
            </div>
          </div>
          <div>
            <p className={labelClass}>Interest Method</p>
            <select
              value={interestMethod}
              onChange={(e) => setInterestMethod(e.target.value)}
              className={inputClass}
            >
              <option value="flat">Flat Rate</option>
              <option value="reducing">Reducing Balance</option>
            </select>
          </div>
          <div>
            <p className={labelClass}>Loan Limit Multiplier</p>
            <input
              type="number"
              step="1"
              min="1"
              max="10"
              value={loanLimitMultiplier}
              onChange={(e) => setLoanLimitMultiplier(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-text-muted mt-1">e.g. 3 means members can borrow up to 3× their savings.</p>
          </div>
          <div>
            <p className={labelClass}>Profit Sharing Method</p>
            <select
              value={profitSharingMethod}
              onChange={(e) => setProfitSharingMethod(e.target.value)}
              className={inputClass}
            >
              <option value="proportional">Proportional (by savings)</option>
              <option value="equal">Equal split</option>
            </select>
          </div>
        </div>
      </form>
    </SlideoverDrawer>
  );
}
