import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../lib/utils';
import SlideoverDrawer from '../../components/ui/SlideoverDrawer';
import Select from '../../components/ui/Select';

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

const STATUS_FILTERS = ['all', 'open', 'in_progress', 'resolved', 'closed'];
const STATUS_FILTER_LABELS = { all: 'All', open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

const LIMIT = 25;

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, cls: 'bg-surface-page text-text-secondary' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function DetailDrawer({ ticket: initialTicket, onClose, onUpdated }) {
  const [ticket, setTicket] = useState(initialTicket);
  const [status, setStatus] = useState(initialTicket.status);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState(null);

  const [replyBody, setReplyBody] = useState('');
  const [replySaving, setReplySaving] = useState(false);
  const [replyError, setReplyError] = useState(null);

  async function handleSaveStatus() {
    setStatusSaving(true);
    setStatusError(null);
    try {
      const res = await axios.patch(`${API_BASE_URL}/admin/support/${ticket._id}`, { status });
      setTicket(res.data);
      toast.success('Status updated.');
      onUpdated();
    } catch (err) {
      setStatusError(err?.response?.data?.error || 'Failed to update status.');
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleSendReply() {
    if (replyBody.trim().length < 1) return;
    setReplySaving(true);
    setReplyError(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/admin/support/${ticket._id}/messages`, { body: replyBody.trim() });
      setTicket(res.data);
      setStatus(res.data.status);
      setReplyBody('');
      toast.success('Reply sent.');
      onUpdated();
    } catch (err) {
      setReplyError(err?.response?.data?.error || 'Failed to send reply.');
    } finally {
      setReplySaving(false);
    }
  }

  const footer = (
    <div className="flex flex-col gap-2">
      <textarea
        value={replyBody}
        onChange={e => setReplyBody(e.target.value)}
        rows={2}
        maxLength={4000}
        placeholder="Reply to this ticket…"
        className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-text-muted resize-none"
      />
      {replyError && (
        <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2">{replyError}</p>
      )}
      <button
        type="button"
        onClick={handleSendReply}
        disabled={replySaving || replyBody.trim().length < 1}
        className="w-full bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-md py-3 transition-colors disabled:opacity-60"
      >
        {replySaving ? 'Sending…' : 'Send Reply'}
      </button>
    </div>
  );

  return (
    <SlideoverDrawer
      open
      onClose={onClose}
      title="Support Request"
      footer={footer}
    >
      <div className="space-y-4 text-sm">
        <div className="bg-surface-page rounded-lg p-4 space-y-2">
          <Row label="Ticket ID" value={String(ticket._id)} mono />
          <Row label="Submitted" value={dayjs(ticket.createdAt).format('DD MMM YYYY, HH:mm')} />
          <Row label="Status" value={<StatusBadge status={ticket.status} />} />
          <Row label="Category" value={CATEGORY_LABELS[ticket.category] || ticket.category} />
        </div>

        <div className="bg-surface-page rounded-lg p-4 space-y-2">
          <Row label="Name" value={ticket.name} />
          <Row label="Email" value={ticket.email} />
          <Row label="Phone" value={ticket.phone} />
          <Row label="Role" value={ticket.role || '—'} />
          <Row label="Group" value={ticket.groupName || '—'} />
          <Row label="Page" value={ticket.pagePath || '—'} />
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5">Description</p>
          <p className="text-sm text-text-primary whitespace-pre-wrap bg-surface-page rounded-lg p-3">{ticket.description}</p>
        </div>

        {ticket.messages && ticket.messages.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5">Thread</p>
            <div className="space-y-2">
              {ticket.messages.map((m, i) => (
                <div key={i} className={`flex ${m.authorType === 'admin' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl p-3 ${
                    m.authorType === 'admin' ? 'bg-brand-primary text-white' : 'bg-surface-page text-text-primary'
                  }`}>
                    <p className={`text-[10px] mb-1 ${m.authorType === 'admin' ? 'text-white/70' : 'text-text-muted'}`}>
                      {m.authorName} · {dayjs(m.createdAt).format('DD MMM, HH:mm')}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-surface-page rounded-lg p-4 space-y-2">
          <NotifyRow label="Telegram" date={ticket.notifiedTelegramAt} />
          <NotifyRow label="Email" date={ticket.notifiedEmailAt} />
          {ticket.notifyError && (
            <p className="text-xs text-status-overdue-text">Error: {ticket.notifyError}</p>
          )}
        </div>

        <div className="border-t border-border-default pt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5">
              Update Status
            </label>
            <div className="flex gap-2">
              <Select
                className="flex-1"
                value={status}
                onChange={e => setStatus(e.target.value)}
              >
                {STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>
                ))}
              </Select>
              <button
                type="button"
                onClick={handleSaveStatus}
                disabled={statusSaving || status === ticket.status}
                className="border border-border-default rounded-xl px-4 text-sm font-medium text-text-primary hover:bg-surface-page transition-colors disabled:opacity-40"
              >
                {statusSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {statusError && (
            <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2">
              {statusError}
            </p>
          )}
        </div>
      </div>
    </SlideoverDrawer>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-xs text-text-secondary flex-shrink-0">{label}</span>
      <span className={`text-xs text-text-primary text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function NotifyRow({ label, date }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${date ? 'bg-status-paid-text' : 'bg-status-overdue-text'}`} />
      <span className="text-xs text-text-secondary">{label}:</span>
      <span className="text-xs text-text-primary">{date ? dayjs(date).format('HH:mm DD MMM') : 'Not sent'}</span>
    </div>
  );
}

export default function AdminSupportInbox() {
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const fetchRequests = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (statusFilter !== 'all') params.status = statusFilter;
    if (debouncedSearch) params.q = debouncedSearch;
    axios.get(`${API_BASE_URL}/admin/support`, { params })
      .then(r => { setRequests(r.data.requests); setTotal(r.data.total); })
      .catch(() => toast.error('Failed to load support requests'))
      .finally(() => setLoading(false));
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const totalPages = Math.ceil(total / LIMIT);
  const start = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const end = Math.min(page * LIMIT, total);

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Support Inbox</h1>
        <p className="text-sm text-text-secondary">{total} {total === 1 ? 'request' : 'requests'}</p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, group, or description…"
          className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-text-muted"
        />
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-brand-primary text-white'
                : 'border border-border-default text-text-secondary hover:bg-surface-page'
            }`}
          >
            {STATUS_FILTER_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-text-secondary">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="bg-surface-card border border-dashed border-border-dashed rounded-lg p-12 text-center">
          <p className="text-sm font-medium text-text-primary mb-1">No support requests</p>
          <p className="text-xs text-text-secondary">When users submit a support request from inside the app, it will appear here.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-surface-card rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default">
                  {['Submitted', 'From', 'Group', 'Category', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide text-text-secondary font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r._id} className="border-b border-border-default last:border-0 hover:bg-surface-page transition-colors">
                    <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                      {dayjs(r.createdAt).format('DD MMM, HH:mm')}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-text-primary">{r.name}</p>
                      <p className="text-xs text-text-muted">{r.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{r.groupName || '—'}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{CATEGORY_LABELS[r.category] || r.category}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedTicket(r)}
                        className="text-xs text-brand-primary hover:underline font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3 mb-4">
            {requests.map(r => (
              <button
                key={r._id}
                onClick={() => setSelectedTicket(r)}
                className="w-full text-left bg-surface-card rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-text-primary">{r.name}</p>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-xs text-text-secondary mb-1">
                  {CATEGORY_LABELS[r.category] || r.category}
                  {r.groupName ? ` · ${r.groupName}` : ''}
                  {' · '}{dayjs(r.createdAt).fromNow?.() || dayjs(r.createdAt).format('DD MMM')}
                </p>
                <p className="text-xs text-text-secondary line-clamp-2">{r.description}</p>
              </button>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-secondary">Showing {start}–{end} of {total}</p>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="border border-border-default rounded-full px-4 py-2 text-sm disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="border border-border-default rounded-full px-4 py-2 text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {selectedTicket && (
        <DetailDrawer
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdated={fetchRequests}
        />
      )}
    </div>
  );
}
