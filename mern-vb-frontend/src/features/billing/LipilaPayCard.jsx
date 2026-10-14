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
 *
 * F2 fix-up: `/billing/lipila/latest` is no longer fetched by this card —
 * UpgradePage fetches it once on page mount and hands the result down as
 * `enabled`/`checkedLatest`/`resumedAttempt`, so the card never re-fetches it
 * (Step 8a.1). When `resumedAttempt` is a resumable pending or recent success,
 * this card seeds its state from it and always renders that attempt's OWN
 * `plan`/`amount`/`maskedMsisdn` fields, never the `plan` prop — UpgradePage
 * only passes a `resumedAttempt` that already matches the card it's wiring up,
 * but this card never trusts `plan` for wording regardless, as a backstop.
 */
export default function LipilaPayCard({ plan, enabled, checkedLatest, resumedAttempt }) {
  const { user: member, refreshMembership } = useAuth();
  const navigate = useNavigate();

  const resumable =
    resumedAttempt && (resumedAttempt.status === 'pending' || resumedAttempt.status === 'success')
      ? resumedAttempt
      : null;

  // idle | pending | success | failed | timeout
  const [status, setStatus] = useState(resumable ? resumable.status : 'idle');
  const [attemptId, setAttemptId] = useState(resumable?.attemptId || null);
  const [amount, setAmount] = useState(resumable?.amount ?? null);
  const [maskedMsisdn, setMaskedMsisdn] = useState(resumable?.maskedMsisdn || null);
  const [resultPlan, setResultPlan] = useState(resumable?.plan || null);
  const [paidUntil, setPaidUntil] = useState(resumable?.paidUntil || null);
  const [failureKind, setFailureKind] = useState(null);
  const [msisdn, setMsisdn] = useState(member?.phone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // refreshMembership is not memoised in the auth store, so it changes identity
  // on every AuthProvider render. Read it through a ref so the poll effect below
  // doesn't restart (and reset its 150 s timeout) whenever auth re-renders.
  const refreshRef = useRef(refreshMembership);
  refreshRef.current = refreshMembership;

  // Read via a ref inside the poll effect below (which is keyed only on
  // attemptId) so a status change alone never restarts/re-triggers it.
  const statusRef = useRef(status);
  statusRef.current = status;

  // A resumed success (e.g. the banner atop the plan list) refreshes
  // membership too, same as a poll-discovered success — but only once.
  const resumedSuccessHandledRef = useRef(false);
  useEffect(() => {
    if (resumable?.status === 'success' && !resumedSuccessHandledRef.current) {
      resumedSuccessHandledRef.current = true;
      refreshRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 8a.4/8a.7/8a.10 (F2 fix-up) — one effect for poll setup AND cleanup,
  // keyed only on attemptId, no didInit ref (React 19 dev double-invocation
  // gotcha). A chained setTimeout (not setInterval) schedules the next 3 s
  // poll only after the current request settles, so a slow response from
  // Lipila can never overlap with a second one. The 150 s overall limit is a
  // separate one-shot timer, independent of the poll cadence, so it still
  // fires even while a poll request is stuck in flight. The `cancelled` flag
  // (set by `stop()`, which cleanup also calls) stops any stale in-flight
  // response — including one still outstanding when Try again fires — from
  // updating state after this effect has moved on.
  useEffect(() => {
    if (!attemptId || statusRef.current !== 'pending') return;
    let cancelled = false;
    let pollTimer = null;

    function schedulePoll() {
      pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    function stop() {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      clearTimeout(overallTimer);
    }

    async function poll() {
      if (cancelled) return;
      try {
        const res = await axios.get(`${API_BASE_URL}/billing/lipila/attempts/${attemptId}`);
        if (cancelled) return;
        const data = res.data?.data;
        if (!data) {
          schedulePoll();
          return;
        }
        if (data.amount != null) setAmount(data.amount);
        if (data.plan) setResultPlan(data.plan);
        if (data.status === 'success') {
          stop();
          setPaidUntil(data.paidUntil);
          setStatus('success');
          refreshRef.current?.();
          return;
        }
        if (data.status === 'failed') {
          stop();
          setFailureKind(data.failureKind);
          setStatus('failed');
          return;
        }
        schedulePoll();
      } catch {
        // transient network hiccup — keep polling, bounded by the timeout above
        if (!cancelled) schedulePoll();
      }
    }

    const overallTimer = setTimeout(() => {
      if (cancelled) return;
      stop();
      setStatus('timeout');
    }, POLL_TIMEOUT_MS);

    schedulePoll();

    return () => {
      stop();
    };
  }, [attemptId]);

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
    // Clear attemptId first (F2 fix-up): this is what triggers the poll
    // effect's cleanup, cancelling any in-flight request, before the status
    // flips back to idle — so a stale response can never land afterwards.
    setAttemptId(null);
    setStatus('idle');
    setFailureKind(null);
    setError('');
  }

  if (!checkedLatest || !enabled) return null;

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
