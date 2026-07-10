import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import SlideoverDrawer from '../ui/SlideoverDrawer';
import { API_BASE_URL } from '../../lib/utils';

export default function FineRulesDrawer({ open, onClose, onSaved, settings }) {
  const [overdueFineAmount, setOverdueFineAmount] = useState('0');
  const [lateFineType, setLateFineType] = useState('fixed');
  const [partialPaymentFineAmount, setPartialPaymentFineAmount] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (settings && open) {
      setOverdueFineAmount(String(settings.overdueFineAmount ?? '0'));
      setLateFineType(settings.lateFineType || 'fixed');
      setPartialPaymentFineAmount(String(settings.partialPaymentFineAmount ?? '0'));
      setError(null);
    }
  }, [settings, open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        overdueFineAmount: Number(overdueFineAmount) || 0,
        lateFineType,
        partialPaymentFineAmount: Number(partialPaymentFineAmount) || 0,
      };
      const res = await axios.put(`${API_BASE_URL}/group-settings`, payload);
      toast.success('Fine rules updated');
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
      form="fine-rules-form"
      disabled={saving}
      className="w-full bg-brand-primary hover:bg-brand-hover text-white font-semibold rounded-md px-5 py-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {saving ? 'Saving…' : 'Save Changes'}
    </button>
  );

  return (
    <SlideoverDrawer open={open} onClose={onClose} title="Edit Fine Rules" footer={footer}>
      <form id="fine-rules-form" onSubmit={handleSubmit}>
        {error && (
          <div className="bg-status-overdue-bg border border-status-overdue-text/30 text-status-overdue-text text-sm rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <p className={labelClass}>Late Fine Amount (K)</p>
            <input
              type="number"
              step="1"
              min="0"
              value={overdueFineAmount}
              onChange={(e) => setOverdueFineAmount(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <p className={labelClass}>Fine Type</p>
            <select
              value={lateFineType}
              onChange={(e) => setLateFineType(e.target.value)}
              className={inputClass}
            >
              <option value="fixed">Fixed amount</option>
              <option value="percentage">Percentage of overdue</option>
            </select>
          </div>
          <div>
            <p className={labelClass}>Partial Payment Fine (K)</p>
            <input
              type="number"
              step="1"
              min="0"
              value={partialPaymentFineAmount}
              onChange={(e) => setPartialPaymentFineAmount(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-text-muted mt-1">Fine issued when a member covers interest but carries the principal forward. Set to 0 for no fine.</p>
          </div>
        </div>
      </form>
    </SlideoverDrawer>
  );
}
