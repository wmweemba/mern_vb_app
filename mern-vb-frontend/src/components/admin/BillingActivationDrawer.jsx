import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { API_BASE_URL } from '../../lib/utils';

export default function BillingActivationDrawer({ open, onClose, groupId, group, onSuccess }) {
  const [plans, setPlans] = useState({});
  const [plan, setPlan] = useState('Starter');
  const [durationMonths, setDurationMonths] = useState(1);
  const [customPaidUntil, setCustomPaidUntil] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      axios.get(`${API_BASE_URL}/admin/billing/plans`).then(r => setPlans(r.data)).catch(() => {});
    }
  }, [open]);

  const computedPaidUntil = (() => {
    if (customPaidUntil) return customPaidUntil;
    const now = new Date();
    const base = (group?.paidUntil && new Date(group.paidUntil) > now)
      ? new Date(group.paidUntil)
      : new Date(now);
    base.setMonth(base.getMonth() + Number(durationMonths));
    return base.toISOString().split('T')[0];
  })();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/admin/groups/${groupId}/billing/activate`, {
        plan,
        durationMonths: customPaidUntil ? undefined : Number(durationMonths),
        customPaidUntil: customPaidUntil || undefined,
      });
      toast.success('Billing activated');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to activate billing');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 md:top-0 md:right-0 md:left-auto md:bottom-0 md:w-[400px] bg-surface-card z-50 shadow-xl flex flex-col rounded-t-xl md:rounded-none md:rounded-l-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h3 className="text-base font-bold text-text-primary">Activate / Extend Billing</h3>
          <button onClick={onClose}><X size={20} className="text-text-secondary" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Plan</label>
            <select
              value={plan}
              onChange={e => setPlan(e.target.value)}
              className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary"
            >
              {Object.keys(plans).map(p => (
                <option key={p} value={p}>{p} — ZMW {plans[p]?.price}/mo</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Duration (months)</label>
            <input
              type="number"
              min={1}
              max={36}
              value={durationMonths}
              onChange={e => setDurationMonths(e.target.value)}
              disabled={!!customPaidUntil}
              className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Custom end date (optional)</label>
            <input
              type="date"
              value={customPaidUntil}
              onChange={e => setCustomPaidUntil(e.target.value)}
              className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary"
            />
            <p className="text-xs text-text-secondary mt-1">Overrides duration — sets paidUntil to this exact date.</p>
          </div>
          <div className="bg-surface-page rounded-lg p-3">
            <p className="text-xs text-text-secondary">New paidUntil:</p>
            <p className="text-sm font-semibold text-text-primary">{computedPaidUntil}</p>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border-default">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-brand-primary text-white rounded-full py-3 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Activate / Extend'}
          </button>
        </div>
      </div>
    </>
  );
}
