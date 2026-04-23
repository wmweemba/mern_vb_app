import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import SlideoverDrawer from '../ui/SlideoverDrawer';
import { API_BASE_URL } from '../../lib/utils';

const MEETING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Not set'];

export default function GroupProfileDrawer({ open, onClose, onSaved, settings }) {
  const [groupName, setGroupName] = useState('');
  const [meetingDay, setMeetingDay] = useState('Not set');
  const [cycleLengthMonths, setCycleLengthMonths] = useState('6');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (settings && open) {
      setGroupName(settings.groupName || '');
      setMeetingDay(settings.meetingDay || 'Not set');
      setCycleLengthMonths(String(settings.cycleLengthMonths || '6'));
      setError(null);
    }
  }, [settings, open]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = groupName.trim();
    if (!trimmed || trimmed.length > 60) {
      setError('Group name must be between 1 and 60 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        groupName: trimmed,
        meetingDay: meetingDay === 'Not set' ? null : meetingDay,
        cycleLengthMonths: Number(cycleLengthMonths),
      };
      const res = await axios.put(`${API_BASE_URL}/group-settings`, payload);
      toast.success('Group profile updated');
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
      form="group-profile-form"
      disabled={saving}
      className="w-full bg-brand-primary hover:bg-brand-hover text-white font-semibold rounded-md px-5 py-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {saving ? 'Saving…' : 'Save Changes'}
    </button>
  );

  return (
    <SlideoverDrawer open={open} onClose={onClose} title="Edit Group Profile" footer={footer}>
      <form id="group-profile-form" onSubmit={handleSubmit}>
        {error && (
          <div className="bg-status-overdue-bg border border-status-overdue-text/30 text-status-overdue-text text-sm rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <p className={labelClass}>Group Name</p>
            <input
              type="text"
              name="groupName"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className={inputClass}
              maxLength={60}
            />
          </div>
          <div>
            <p className={labelClass}>Meeting Day</p>
            <select
              value={meetingDay}
              onChange={(e) => setMeetingDay(e.target.value)}
              className={inputClass}
            >
              {MEETING_DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <p className={labelClass}>Cycle Length</p>
            <select
              value={cycleLengthMonths}
              onChange={(e) => setCycleLengthMonths(e.target.value)}
              className={inputClass}
            >
              <option value="6">6 months</option>
              <option value="12">12 months</option>
            </select>
          </div>
          <div>
            <p className={labelClass}>Currency</p>
            <p className="text-sm text-text-muted">ZMW (Zambian Kwacha)</p>
          </div>
        </div>
      </form>
    </SlideoverDrawer>
  );
}
