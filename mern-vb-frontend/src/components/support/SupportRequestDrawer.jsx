import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import SlideoverDrawer from '../ui/SlideoverDrawer';
import { useAuth } from '../../store/auth';
import { API_BASE_URL } from '../../lib/utils';

export default function SupportRequestDrawer({ open, onClose }) {
  const { user: clerkUser } = useUser();
  const { user: member } = useAuth();
  const location = useLocation();

  const prefillName = member?.name || clerkUser?.fullName || '';
  const prefillEmail = clerkUser?.primaryEmailAddress?.emailAddress || '';

  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState(null);

  useEffect(() => {
    if (open) {
      setPhone('');
      setCategory('');
      setDescription('');
      setError(null);
      setSubmitted(false);
      setTicketId(null);
    }
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phone.trim()) return setError('Phone number is required.');
    if (!category) return setError('Please choose a category.');
    if (description.trim().length < 5) return setError('Please describe the issue (at least 5 characters).');
    if (description.length > 4000) return setError('Description is too long (max 4000 characters).');
    setSaving(true);
    setError(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/support/request`, {
        phone: phone.trim(),
        category,
        description: description.trim(),
        pagePath: location.pathname,
        userAgent: navigator.userAgent,
      });
      setTicketId(res.data?.ticketId || null);
      setSubmitted(true);
      toast.success("Support request sent. We'll be in touch shortly.");
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to send. Please try again or call support.');
    } finally {
      setSaving(false);
    }
  }

  const submitButton = (
    <button
      type="submit"
      form="support-request-form"
      disabled={saving}
      className="w-full bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-md py-3 transition-colors disabled:opacity-60"
    >
      {saving ? 'Sending…' : 'Send Request'}
    </button>
  );

  const confirmationBody = (
    <div className="flex flex-col items-center text-center py-6">
      <div className="w-14 h-14 rounded-full bg-status-paid-bg flex items-center justify-center mb-4">
        <CheckCircle2 size={32} className="text-status-paid-text" />
      </div>
      <h3 className="text-lg font-bold text-text-primary mb-1.5">Request received</h3>
      <p className="text-sm text-text-secondary max-w-xs">
        Thank you. Our support team has been notified and will reach out via phone or email shortly.
      </p>
      {ticketId && (
        <p className="text-xs text-text-muted mt-4">Ticket ID: {String(ticketId)}</p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-6 text-sm text-brand-primary font-medium hover:underline"
      >
        Close
      </button>
    </div>
  );

  const formBody = (
    <form id="support-request-form" onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5">
            Name
          </label>
          <input
            type="text"
            value={prefillName}
            readOnly
            className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-page cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={prefillEmail}
            readOnly
            className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-page cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5">
            Phone Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value); setError(null); }}
            placeholder="e.g. 0979645911"
            className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-text-muted"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5">
            Category
          </label>
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); setError(null); }}
            className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value="">Select a category…</option>
            <option value="error">Error / Bug</option>
            <option value="question">Question</option>
            <option value="feature_request">Feature Request</option>
            <option value="billing">Billing</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={e => { setDescription(e.target.value); setError(null); }}
            rows={5}
            placeholder="Describe the issue or question…"
            className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-text-muted resize-none"
          />
          <p className="text-right text-xs text-text-muted mt-1">{description.length}/4000</p>
        </div>
        {error && (
          <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </form>
  );

  return (
    <SlideoverDrawer
      open={open}
      onClose={onClose}
      title={submitted ? 'Support Request Sent' : 'Help & Support'}
      footer={submitted ? null : submitButton}
    >
      {submitted ? confirmationBody : formBody}
    </SlideoverDrawer>
  );
}
