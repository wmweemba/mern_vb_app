import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { useUser } from '@clerk/clerk-react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Plus } from 'lucide-react';
import SlideoverDrawer from '../ui/SlideoverDrawer';
import { useAuth } from '../../store/auth';
import { API_BASE_URL } from '../../lib/utils';

const CATEGORY_LABELS = {
  error: 'Error / Bug',
  question: 'Question',
  feature_request: 'Feature Request',
  billing: 'Billing',
  other: 'Other',
};

const STATUS_META = {
  open: { label: 'Open', cls: 'bg-status-overdue-bg text-status-overdue-text' },
  in_progress: { label: 'In Progress', cls: 'bg-trial-bg text-trial-text' },
  resolved: { label: 'Resolved', cls: 'bg-status-paid-bg text-status-paid-text' },
  closed: { label: 'Closed', cls: 'bg-surface-page text-text-secondary' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, cls: 'bg-surface-page text-text-secondary' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export default function SupportRequestDrawer({ open, onClose, onTicketsChanged }) {
  const { user: clerkUser } = useUser();
  const { user: member } = useAuth();
  const location = useLocation();

  const prefillName = member?.name || clerkUser?.fullName || '';
  const prefillEmail = clerkUser?.primaryEmailAddress?.emailAddress || '';

  // 'form' | 'confirmation' | 'list' | 'thread'
  const [screen, setScreen] = useState('form');
  const [tickets, setTickets] = useState([]);

  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [ticketId, setTicketId] = useState(null);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replySaving, setReplySaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPhone('');
      setCategory('');
      setDescription('');
      setError(null);
      setTicketId(null);
      setScreen('form');
    }
  }, [open]);

  // Fetch the user's own tickets so the drawer can default to the list when
  // there's history to show. If it fails (or, in tests, axios isn't mocked
  // for this call), fall back silently — the create form is always safe.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/support/requests`);
        if (cancelled) return;
        const list = res.data.requests;
        setTickets(list);
        setScreen(prev => (prev === 'form' && list.length > 0 ? 'list' : prev));
      } catch {
        // leave the create form as the default
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  function refetchTickets() {
    axios.get(`${API_BASE_URL}/support/requests`)
      .then(res => {
        setTickets(res.data.requests);
        onTicketsChanged?.(res.data.requests);
      })
      .catch(() => {});
  }

  function openThread(ticketSummary) {
    setScreen('thread');
    setThreadLoading(true);
    setSelectedTicket(ticketSummary);
    setReplyBody('');
    axios.get(`${API_BASE_URL}/support/requests/${ticketSummary._id}`)
      .then(res => {
        setSelectedTicket(res.data);
        // This ticket is now read — reflect that locally without a full refetch.
        setTickets(prev => {
          const next = prev.map(t => t._id === res.data._id ? { ...t, hasUnread: false } : t);
          onTicketsChanged?.(next);
          return next;
        });
      })
      .catch(() => toast.error('Failed to load this request.'))
      .finally(() => setThreadLoading(false));
  }

  async function handleSendReply() {
    if (replyBody.trim().length < 1) return;
    setReplySaving(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/support/requests/${selectedTicket._id}/messages`, {
        body: replyBody.trim(),
      });
      setSelectedTicket(res.data);
      setReplyBody('');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to send message.');
    } finally {
      setReplySaving(false);
    }
  }

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
      setScreen('confirmation');
      toast.success("Support request sent. We'll be in touch shortly.");
      refetchTickets();
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
        onClick={() => setScreen('list')}
        className="mt-6 text-sm text-brand-primary font-medium hover:underline"
      >
        View my requests
      </button>
    </div>
  );

  const formBody = (
    <form id="support-request-form" onSubmit={handleSubmit}>
      <div className="space-y-4">
        {tickets.length > 0 && (
          <button
            type="button"
            onClick={() => setScreen('list')}
            className="flex items-center gap-1 text-sm text-brand-primary font-medium hover:underline"
          >
            <ChevronLeft size={16} /> Back to my requests
          </button>
        )}
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

  const listBody = (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setScreen('form')}
        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border-dashed rounded-xl py-2.5 text-sm font-medium text-brand-primary hover:bg-surface-page transition-colors"
      >
        <Plus size={16} /> New Request
      </button>
      {tickets.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-8">No requests yet.</p>
      ) : (
        tickets.map(t => (
          <button
            key={t._id}
            type="button"
            onClick={() => openThread(t)}
            className="w-full text-left bg-surface-page rounded-xl p-3.5 hover:bg-border-default/40 transition-colors relative"
          >
            {t.hasUnread && (
              <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-brand-primary" aria-label="Unread reply" />
            )}
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={t.status} />
              <span className="text-xs text-text-secondary">{CATEGORY_LABELS[t.category] || t.category}</span>
            </div>
            <p className="text-sm text-text-primary line-clamp-2 pr-4">{t.description}</p>
            <p className="text-xs text-text-muted mt-1">{dayjs(t.createdAt).format('DD MMM YYYY, HH:mm')}</p>
          </button>
        ))
      )}
    </div>
  );

  const threadFooter = selectedTicket && !threadLoading ? (
    <div className="flex flex-col gap-2">
      <textarea
        value={replyBody}
        onChange={e => setReplyBody(e.target.value)}
        rows={2}
        placeholder="Write a reply…"
        maxLength={4000}
        className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-text-muted resize-none"
      />
      <button
        type="button"
        onClick={handleSendReply}
        disabled={replySaving || replyBody.trim().length < 1}
        className="w-full bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-md py-3 transition-colors disabled:opacity-60"
      >
        {replySaving ? 'Sending…' : 'Send Reply'}
      </button>
    </div>
  ) : null;

  const threadBody = threadLoading || !selectedTicket ? (
    <p className="text-sm text-text-secondary text-center py-8">Loading…</p>
  ) : (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => { setScreen('list'); refetchTickets(); }}
        className="flex items-center gap-1 text-sm text-brand-primary font-medium hover:underline"
      >
        <ChevronLeft size={16} /> Back to my requests
      </button>

      <div className="flex items-center gap-2">
        <StatusBadge status={selectedTicket.status} />
        <span className="text-xs text-text-secondary">{CATEGORY_LABELS[selectedTicket.category] || selectedTicket.category}</span>
      </div>

      <div className="bg-surface-page rounded-xl p-3.5">
        <p className="text-xs text-text-muted mb-1">{dayjs(selectedTicket.createdAt).format('DD MMM YYYY, HH:mm')}</p>
        <p className="text-sm text-text-primary whitespace-pre-wrap">{selectedTicket.description}</p>
      </div>

      {(selectedTicket.messages || []).map((m, i) => (
        <div key={i} className={`flex ${m.authorType === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[85%] rounded-xl p-3 ${
            m.authorType === 'user' ? 'bg-brand-primary text-white' : 'bg-surface-page text-text-primary'
          }`}>
            <p className={`text-[10px] mb-1 ${m.authorType === 'user' ? 'text-white/70' : 'text-text-muted'}`}>
              {m.authorName} · {dayjs(m.createdAt).format('DD MMM, HH:mm')}
            </p>
            <p className="text-sm whitespace-pre-wrap">{m.body}</p>
          </div>
        </div>
      ))}
    </div>
  );

  const titles = {
    form: 'Help & Support',
    confirmation: 'Support Request Sent',
    list: 'My Requests',
    thread: 'Support Request',
  };

  const footers = {
    form: submitButton,
    confirmation: null,
    list: null,
    thread: threadFooter,
  };

  const bodies = {
    form: formBody,
    confirmation: confirmationBody,
    list: listBody,
    thread: threadBody,
  };

  return (
    <SlideoverDrawer
      open={open}
      onClose={onClose}
      title={titles[screen]}
      footer={footers[screen]}
    >
      {bodies[screen]}
    </SlideoverDrawer>
  );
}
