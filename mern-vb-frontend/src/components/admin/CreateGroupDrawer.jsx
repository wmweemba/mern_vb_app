import { useState } from 'react';
import { X } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { API_BASE_URL } from '../../lib/utils';

export default function CreateGroupDrawer({ open, onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '', adminName: '', adminEmail: '', trialDays: 15 });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.name || !form.adminName) {
      toast.error('Group name and admin name are required');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/admin/groups`, form);
      toast.success('Group created');
      setForm({ name: '', adminName: '', adminEmail: '', trialDays: 15 });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 md:top-0 md:right-0 md:left-auto md:bottom-0 md:w-[400px] bg-surface-card z-50 shadow-xl flex flex-col rounded-t-xl md:rounded-none md:rounded-l-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h3 className="text-base font-bold text-text-primary">Create Group</h3>
          <button onClick={onClose}><X size={20} className="text-text-secondary" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Group Name *</label>
            <input type="text" value={form.name} onChange={set('name')} className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Admin Name *</label>
            <input type="text" value={form.adminName} onChange={set('adminName')} className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Admin Email</label>
            <input type="email" value={form.adminEmail} onChange={set('adminEmail')} className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Trial Days</label>
            <input type="number" value={form.trialDays} onChange={set('trialDays')} min={1} max={90} className="w-full border border-border-default rounded-lg px-3 py-2.5 text-base bg-surface-page text-text-primary" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border-default">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-brand-primary text-white rounded-full py-3 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </>
  );
}
