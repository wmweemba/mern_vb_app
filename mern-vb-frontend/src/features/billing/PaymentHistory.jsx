import { useEffect, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../lib/utils';

function planLabel(planKey) {
  if (!planKey) return '';
  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

/**
 * Step 8a.9 — admin/treasurer-only "Payment history" section on /upgrade,
 * backed by GET /billing/lipila/history (success rows only, newest first,
 * masked MSISDN). UI_SPEC §6.5's list-row pattern (avatar omitted — there's
 * no member here, just the group's own payments) + §6.9's card container.
 *
 * Renders nothing while the row list is empty — this keeps the section
 * invisible while the Lipila feature is dark (kill switch off) without a
 * second "enabled" flag to thread through, and there's no meaningful
 * empty state to show a group that has simply never paid by mobile money.
 */
export default function PaymentHistory() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API_BASE_URL}/billing/lipila/history`)
      .then(res => {
        if (cancelled) return;
        setRows(Array.isArray(res.data?.data) ? res.data.data : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-lg font-bold text-text-primary mb-3">Payment history</h2>
      <div className="bg-surface-card rounded-xl border border-border-default p-4 divide-y divide-border-default">
        {rows.map((row, idx) => (
          <div
            key={row.providerExternalId || `${row.date}-${idx}`}
            className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">{planLabel(row.plan)}</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {dayjs(row.date).format('D MMM YYYY')}
                {row.maskedMsisdn ? ` · ${row.maskedMsisdn}` : ''}
                {row.providerExternalId ? ` · ${row.providerExternalId}` : ''}
              </p>
              {row.initiatedByName && (
                <p className="text-xs text-text-secondary mt-0.5">Paid by {row.initiatedByName}</p>
              )}
            </div>
            <p className="text-sm font-semibold text-text-primary whitespace-nowrap">
              K{row.amount}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
