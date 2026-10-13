import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../lib/utils';
import { useAuth } from '../../store/auth';

// Step 8a.4/8a.7 — 3 s poll, 150 s overall timeout.
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 150000;

function formatAmount(amount) {
  const n = Number(amount);
  return Number.isFinite(n) ? `K${n.toLocaleString()}` : `K${amount}`;
}

function planLabel(planKey) {
  if (!planKey) return '';
  return planKey.charAt(0).toUpperCase() + planKey.slice(1);
}

// Step 8a.6 — failed-state copy, keyed by the server's coarse failureKind.
function failureMessage(failureKind) {
  if (failureKind === 'pin') return 'The PIN was wrong or the request was declined.';
  if (failureKind === 'timeout') return 'The request timed out before it was approved.';
  if (failureKind === 'rate_limited') return 'Too many attempts. Please wait a few minutes.';
  return "That didn't go through. You weren't charged.";
}

// Step 8a.8 — inline errors from /initiate. COLLECTION_REJECTED is handled
// separately (it creates a real attempt, so it gets the full failed state);
// everything else here is shown inline on the idle card, because no attempt
// was ever created for these.
function initiateErrorMessage(code, data) {
  switch (code) {
    case 'INVALID_MSISDN':
      return 'Enter an MTN, Airtel or Zamtel number';
    case 'PLAN_TOO_SMALL':
      return `Your group has ${data?.activeCount ?? '?'} members. This plan covers up to ${data?.memberLimit ?? '?'}.`;
    case 'ATTEMPT_IN_PROGRESS':
      return 'A payment is already in progress. Check your phone, or try again in a minute.';
    case 'UNAVAILABLE':
      return 'Mobile money payments are unavailable right now. Use the details below.';
    case 'NO_EXPIRY_GROUP':
      return 'Your subscription has no expiry date. Contact support.';
    // Deviation (recorded, not in the source plan's explicit inline list): the
    // initiate-time 429 TOO_MANY_ATTEMPTS throttle never creates an attempt, so
    // it is shown inline here rather than as a full failed state — the
    // 'rate_limited'/429 copy in 8a.6 is reused since the wording fits either way.
    case 'TOO_MANY_ATTEMPTS':
      return 'Too many attempts. Please wait a few minutes.';
    default:
      return "That didn't go through. You weren't charged.";
  }
}

const cardClass = 'bg-surface-card rounded-xl border border-border-default p-5 mb-4';
const labelClass = 'block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5';
const inputClass = 'w-full border border-border-default rounded-md px-3.5 h-12 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-0 focus:border-brand-primary placeholder:text-text-muted';
const primaryButtonClass = 'w-full bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full py-3 transition-colors disabled:opacity-60';
const secondaryButtonClass = 'w-full border border-border-default text-text-primary text-sm font-medium rounded-full py-3 hover:bg-surface-page transition-colors';

/**
 * UI_SPEC §6.7 (buttons), §6.8 (inputs), §6.14 (status colour tokens) — card
 * styling matches §5/§11.2's bg-surface-card + rounded-xl + border pattern
 * used elsewhere on this page.
 *
 * `plan` is the plan key currently selected on /upgrade ('starter' | 'standard'),
 * passed down from UpgradePage's own selectedPlan.id — see that file for how it
 * is wired (PLAN_META's keys already match the API's plan keys 1:1, so no
 * mapping was needed there).
 */
export default function LipilaPayCard({ plan }) {
  const { user: member, refreshMembership } = useAuth();
  const navigate = useNavigate();
  const role = member?.role;
  const eligible = role === 'admin' || role === 'treasurer';

  const [checkedLatest, setCheckedLatest] = useState(false);
  const [enabled, setEnabled] = useState(false);
  // idle | pending | success | failed | timeout
  const [status, setStatus] = useState('idle');
  const [attemptId, setAttemptId] = useState(null);
  const [amount, setAmount] = useState(null);
  const [maskedMsisdn, setMaskedMsisdn] = useState(null);
  const [resultPlan, setResultPlan] = useState(null);
  const [paidUntil, setPaidUntil] = useState(null);
  const [failureKind, setFailureKind] = useState(null);
  const [msisdn, setMsisdn] = useState(member?.phone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // refreshMembership is not memoised in the auth store, so it changes identity
  // on every AuthProvider render. Read it through a ref so the poll effect below
  // doesn't restart (and reset its 150 s timeout) whenever auth re-renders.
  const refreshRef = useRef(refreshMembership);
  refreshRef.current = refreshMembership;

  // Step 8a.1 — resume from /latest on mount. Only called for admin/treasurer;
  // other roles never hit this endpoint (U12 owns their messaging).
  useEffect(() => {
    if (!eligible) {
      setCheckedLatest(true);
      return;
    }
    let cancelled = false;
    axios
      .get(`${API_BASE_URL}/billing/lipila/latest`)
      .then(res => {
        if (cancelled) return;
        const data = res.data?.data;
        if (!data?.enabled) {
          setEnabled(false);
          return;
        }
        setEnabled(true);
        const attempt = data.attempt;
        if (attempt?.status === 'pending') {
          setAttemptId(attempt.attemptId);
          setAmount(attempt.amount);
          setMaskedMsisdn(attempt.maskedMsisdn);
          setResultPlan(attempt.plan);
          setStatus('pending');
        } else if (attempt?.status === 'success') {
          setAmount(attempt.amount);
          setResultPlan(attempt.plan);
          setPaidUntil(attempt.paidUntil);
          setStatus('success');
          refreshMembership?.();
        }
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setCheckedLatest(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible]);

  // Step 8a.4/8a.7/8a.10 — poll setup AND cleanup in one effect, keyed on the
  // attempt id, no didInit ref (React 19 dev double-invocation gotcha).
  useEffect(() => {
    if (status !== 'pending' || !attemptId) return;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        clearInterval(timer);
        setStatus('timeout');
        return;
      }
      try {
        const res = await axios.get(`${API_BASE_URL}/billing/lipila/attempts/${attemptId}`);
        const data = res.data?.data;
        if (!data) return;
        if (data.amount != null) setAmount(data.amount);
        if (data.plan) setResultPlan(data.plan);
        if (data.status === 'success') {
          clearInterval(timer);
          setPaidUntil(data.paidUntil);
          setStatus('success');
          refreshRef.current?.();
        } else if (data.status === 'failed') {
          clearInterval(timer);
          setFailureKind(data.failureKind);
          setStatus('failed');
        }
      } catch {
        // transient network hiccup — keep polling, bounded by the timeout above
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [attemptId, status]);

  async function handlePay() {
    if (!plan || loading) return;
    setError('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/billing/lipila/initiate`, {
        plan,
        msisdn: msisdn.trim(),
      });
      const data = res.data?.data;
      setAttemptId(data.attemptId);
      setAmount(data.amount);
      setMaskedMsisdn(data.maskedMsisdn);
      setResultPlan(plan);
      setFailureKind(null);
      setStatus('pending');
    } catch (err) {
      const body = err?.response?.data;
      const code = body?.error;
      if (code === 'COLLECTION_REJECTED') {
        setAttemptId(body?.data?.attemptId || null);
        setFailureKind(body?.data?.failureKind || null);
        setStatus('failed');
      } else {
        setError(initiateErrorMessage(code, body?.data));
      }
    } finally {
      setLoading(false);
    }
  }

  function handleTryAgain() {
    setStatus('idle');
    setFailureKind(null);
    setAttemptId(null);
    setError('');
  }

  if (!eligible || !checkedLatest || !enabled) return null;

  if (status === 'success') {
    const dateLabel = paidUntil ? dayjs(paidUntil).format('D MMM YYYY') : '';
    return (
      <div className={cardClass}>
        <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">
          Pay now with mobile money
        </p>
        <p className="text-sm text-status-paid-text bg-status-paid-bg rounded-lg px-3 py-2 mt-3">
          Payment received. Your group is on {planLabel(resultPlan)}
          {dateLabel ? ` until ${dateLabel}.` : '.'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className={`${primaryButtonClass} mt-4`}
        >
          Go to dashboard
        </button>
      </div>
    );
  }

  if (status === 'pending' || status === 'timeout') {
    return (
      <div className={cardClass}>
        <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">
          Pay now with mobile money
        </p>
        <p className="text-sm text-status-pending-text bg-status-pending-bg rounded-lg px-3 py-2 mt-3">
          {status === 'timeout'
            ? 'Still waiting for confirmation. If you approved it, it will activate shortly. Check back on this page.'
            : `Check your phone${maskedMsisdn ? ` (${maskedMsisdn})` : ''} and enter your PIN to approve ${amount != null ? formatAmount(amount) : ''}.`}
        </p>
        {status === 'timeout' && (
          <button type="button" onClick={handleTryAgain} className={`${secondaryButtonClass} mt-4`}>
            Try again
          </button>
        )}
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className={cardClass}>
        <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">
          Pay now with mobile money
        </p>
        <p className="text-sm text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2 mt-3">
          {failureMessage(failureKind)}
        </p>
        <button type="button" onClick={handleTryAgain} className={`${primaryButtonClass} mt-4`}>
          Try again
        </button>
        <p className="text-xs text-text-secondary mt-3">
          Paid another way? Use the manual option below instead.
        </p>
      </div>
    );
  }

  // idle
  return (
    <div className={cardClass}>
      <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">
        Pay now with mobile money
      </p>
      <div className="mt-3">
        <label className={labelClass}>Phone Number</label>
        <input
          type="tel"
          value={msisdn}
          onChange={e => {
            setMsisdn(e.target.value);
            setError('');
          }}
          placeholder="e.g. 0979645911"
          className={inputClass}
        />
      </div>
      {error && (
        <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2 mt-3">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handlePay}
        disabled={loading || !plan}
        className={`${primaryButtonClass} mt-4`}
      >
        {loading ? 'Sending request…' : 'Pay now'}
      </button>
    </div>
  );
}
