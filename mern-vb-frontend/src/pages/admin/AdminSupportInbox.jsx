import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../lib/utils';
import SlideoverDrawer from '../../components/ui/SlideoverDrawer';

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

function DetailDrawer({ ticket, onClose, onUpdated }) {
  const [status, setStatus] = useState(ticket.status);
  const [resolutionNote, setResolutionNote] = useState(ticket.resolutionNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await axios.patch(`${API_BASE_URL}/admin/support/${ticket._id}`, { status, resolutionNote });
      toast.success('Ticket updated.');
      onUpdated();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update ticket.');
    } finally {
      setSaving(false);
    }
  }

  const saveButton = (
    <button
      type="button"
      onClick={handleSave}
      disabled={saving}
      className="w-full bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-md py-3 transition-colors disabled:opacity-60"
    >
      {saving ? 'Saving…' : 'Save'}
    </button>
  );

  return (
    <SlideoverDrawer
      open
      onClose={onClose}
      title="Support Request"
      footer={saveButton}
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

        <div className="bg-surface-page rounded-lg p-4 space-y-2">
          <NotifyRow label="Telegram" date={ticket.notifiedTelegramAt} />
          <NotifyRow label="Email" date={ticket.notifiedEmailAt} />
          {ticket.notifyError && (
            <p className="text-xs text-status-overdue-text">Error: {ticket.notifyError}</p>
          )}
        </div>

        <div className="border-t border-border-default pt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5">
              Update Status
            </label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1.5">
              Resolution Note
            </label>
            <textarea
              value={resolutionNote}
              onChange={e => setResolutionNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Optional note for this ticket…"
              className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-text-muted resize-none"
            />
            <p className="text-right text-xs text-text-muted mt-1">{resolutionNote.length}/2000</p>
          </div>
          {error && (
            <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2">
              {error}
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
