import { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../lib/utils';

function planLabel(planKey) {
  if (!planKey) return '';
  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

const STATUS_BADGE = {
  success: 'bg-status-paid-bg text-status-paid-text',
  pending: 'bg-status-pending-bg text-status-pending-text',
  failed: 'bg-status-overdue-bg text-status-overdue-text',
};

function StatusBadge({ status }) {
  const classes = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return (
    <span
      className={`${classes} rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide`}
    >
      {status}
    </span>
  );
}

function FlagBadge({ children }) {
  return (
    <span className="bg-status-overdue-bg text-status-overdue-text rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide">
      {children}
    </span>
  );
}

/**
 * U13 — Step 8b: super admin, read-only "Payments" list inside AdminGroupDetail's
 * BillingTab, backed by GET /admin/groups/:groupId/billing/payments (every attempt,
 * all statuses, newest first). UI_SPEC §6.14 status badge tokens for success/pending/
 * failed; §6.9-style card container + divided rows (same shape as PaymentHistory.jsx's
 * group-facing history list).
 */
export default function SubscriptionPaymentsList({ groupId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    axios
      .get(`${API_BASE_URL}/admin/groups/${groupId}/billing/payments`)
      .then(res => {
        if (cancelled) return;
        setRows(Array.isArray(res.data?.data) ? res.data.data : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return (
    <div className="bg-surface-card rounded-lg p-5 md:p-6">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
        Paid automatically (Lipila)
      </h3>

      {loading && <p className="text-sm text-text-secondary">Loading payments...</p>}

      {!loading && error && (
        <p className="text-sm text-status-overdue-text">Failed to load payments.</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-text-muted">No automated payments yet.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="divide-y divide-border-default">
          {rows.map((row, idx) => (
            <div key={row.id || idx} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {planLabel(row.plan)}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {dayjs(row.createdAt).format('D MMM YYYY HH:mm')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary whitespace-nowrap">
                    K{row.amount}
                  </p>
                  <StatusBadge status={row.status} />
                </div>
              </div>

              {row.status === 'failed' && row.failureReason && (
                <p className="text-xs text-status-overdue-text">{row.failureReason}</p>
              )}

              <p className="text-xs text-text-secondary">
                {row.maskedMsisdn}
                {row.providerExternalId ? ` · ${row.providerExternalId}` : ''}
                {row.initiatedByName ? ` · Paid by ${row.initiatedByName}` : ''}
              </p>

              {row.status === 'success' && row.paidUntilAfter && (
                <p className="text-xs text-text-secondary">
                  Paid until {dayjs(row.paidUntilAfter).format('D MMM YYYY')}
                </p>
              )}

              {(row.isTestAmount || row.amountMismatch || row.wasLateSuccess) && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {row.isTestAmount && <FlagBadge>Test amount</FlagBadge>}
                  {row.amountMismatch && <FlagBadge>Amount mismatch</FlagBadge>}
                  {row.wasLateSuccess && <FlagBadge>Late success</FlagBadge>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
