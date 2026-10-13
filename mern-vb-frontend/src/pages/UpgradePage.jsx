import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import { ArrowLeft, Check, CheckCircle2 } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { API_BASE_URL } from '../lib/utils';
import { useAuth } from '../store/auth';
import LipilaPayCard from '../features/billing/LipilaPayCard';
import PaymentHistory from '../features/billing/PaymentHistory';

// Reused by both the manual-payment confirmation screen and the >40-member
// "contact us" message below — one source for the WhatsApp number.
const WHATSAPP_CONTACT_URL = 'https://wa.me/260979645911';
const WHATSAPP_CONTACT_NUMBER = '0979645911';

const PLAN_META = {
  starter: {
    id: 'starter',
    recommended: false,
    features: (memberLimit) => [
      `Up to ${memberLimit} members`,
      'Savings tracking',
      'Loan management',
      'Financial reports',
      'PDF & Excel exports',
    ],
  },
  standard: {
    id: 'standard',
    recommended: true,
    features: (memberLimit) => [
      `Up to ${memberLimit} members`,
      'Everything in Starter',
      'Priority support',
    ],
  },
};

function ConfirmationScreen({ plan, groupName }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-12">
      <div className="w-16 h-16 rounded-full bg-[#EAF5E8] flex items-center justify-center mb-5">
        <CheckCircle2 size={36} className="text-[#2D7A2D]" />
      </div>
      <h2 className="text-2xl font-bold text-text-primary mb-2">Request Received!</h2>
      <p className="text-sm text-text-secondary mb-8 max-w-xs">
        Thank you for choosing Chama360. Your account will be activated within
        24 hours of payment confirmation.
      </p>

      <div className="w-full max-w-sm bg-surface-card rounded-xl border border-border-default p-5 text-left space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">
            Payment Instructions
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Airtel Money</span>
              <span className="font-medium text-text-primary">0979645911</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">MTN MoMo</span>
              <span className="font-medium text-text-primary">0766792396</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Bank</span>
              <span className="font-medium text-text-primary">Access Bank Zambia</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Account</span>
              <span className="font-medium text-text-primary">0030211570841</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Branch</span>
              <span className="font-medium text-text-primary">Acacia — 350003</span>
            </div>
          </div>
        </div>
        <div className="border-t border-border-default pt-3">
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-text-primary">Reference:</span>{' '}
            {groupName} — {plan.name}
          </p>
        </div>
        <div className="border-t border-border-default pt-3">
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-text-primary">WhatsApp:</span>{' '}
            <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer" className="text-brand-primary underline">
              {WHATSAPP_CONTACT_NUMBER}
            </a>
          </p>
        </div>
      </div>

      <Link
        to="/dashboard"
        className="mt-8 text-sm text-brand-primary font-medium hover:underline"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}

function SubscribeForm({ plan, onBack, onConfirmed }) {
  const { user: clerkUser } = useUser();
  const { user: member } = useAuth();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const prefillName = member?.name || clerkUser?.fullName || '';
  const prefillEmail = clerkUser?.primaryEmailAddress?.emailAddress || '';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Phone number is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/billing/request`, {
        planName: plan.name,
        planPrice: plan.price,
        phone: phone.trim(),
      });
      onConfirmed();
    } catch (err) {
      setError(err?.response?.data?.error || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-5 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to plans
      </button>
      <div className="bg-surface-card rounded-xl border-2 border-brand-primary p-5 mb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">Selected Plan</p>
        <p className="text-lg font-bold text-text-primary mt-0.5">{plan.name}</p>
        <p className="text-2xl font-bold text-brand-primary">ZMW {plan.price}<span className="text-sm font-normal text-text-secondary"> / month</span></p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
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
          <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
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
          <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5">
            Phone Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value); setError(''); }}
            placeholder="e.g. 0979645911"
            className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-text-muted"
          />
        </div>
        {error && (
          <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full py-3 transition-colors disabled:opacity-60"
        >
          {loading ? 'Sending request…' : 'Confirm Subscription Request'}
        </button>
      </form>
    </div>
  );
}

export default function UpgradePage() {
  const { user: member, authLoading } = useAuth();
  // F2 fix-up (point 5): while Clerk/the auth store hasn't resolved the
  // member/role yet, show nothing rather than guessing — in particular,
  // never show the non-admin "Ask your admin" sentence before we actually
  // know the role. Only the explicit loading flag blanks the page: if /me
  // failed (member stays null) the plans and the manual request form must
  // still render, as they did before Lipila — just without any role message.
  const loadingAuth = Boolean(authLoading);

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [plans, setPlans] = useState([]);
  // Step 8a.1 (F2 fix-up) — /latest is fetched once here, on page mount, and
  // handed down to LipilaPayCard instead of the card fetching it itself.
  const [latestAttempt, setLatestAttempt] = useState(null);
  const [latestChecked, setLatestChecked] = useState(false);
  const [lipilaEnabled, setLipilaEnabled] = useState(false);
  const autoSelectedRef = useRef(false);

  const groupName = member?.groupName || 'My Group';
  const role = member?.role;
  // Step 8a.1 — only admin/treasurer get the Lipila pay card and payment
  // history; every other role sees the "ask your admin" sentence instead.
  // The manual SubscribeForm/ConfirmationScreen flow below stays open to
  // every role, unchanged.
  const canPayDirectly = role === 'admin' || role === 'treasurer';
  const memberCount = member?.memberCount ?? null;
  const overCapacity = memberCount != null && memberCount > 40;
  // Step 8a.2 — a no-expiry group (isPaid with no paidUntil) gets no Pay UI
  // at all; the manual flow is the only path for them.
  const noExpiryGroup = Boolean(member?.isPaid && !member?.paidUntil);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/billing/plans`)
      .then(res => {
        const list = Object.entries(res.data)
          .filter(([id]) => PLAN_META[id])
          .map(([id, data]) => ({
            id,
            name: data.name,
            price: data.price,
            memberLimit: data.memberLimit,
            recommended: PLAN_META[id].recommended,
            features: PLAN_META[id].features(data.memberLimit),
          }));
        setPlans(list);
      })
      .catch(() => {});
  }, []);

  // Step 8a.1 — GET /billing/lipila/latest once the role is known, for
  // admin/treasurer only (other roles, and no-expiry groups, never call it —
  // there's nothing for them to resume or pay).
  useEffect(() => {
    if (loadingAuth) return;
    if (!canPayDirectly || noExpiryGroup) {
      setLatestChecked(true);
      return;
    }
    let cancelled = false;
    axios
      .get(`${API_BASE_URL}/billing/lipila/latest`)
      .then(res => {
        if (cancelled) return;
        const data = res.data?.data;
        setLipilaEnabled(Boolean(data?.enabled));
        setLatestAttempt(data?.attempt || null);
      })
      .catch(() => {
        if (!cancelled) setLipilaEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setLatestChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAuth, canPayDirectly, noExpiryGroup]);

  // Pre-select the plan a resumable pending attempt belongs to, once, so the
  // page shows the right plan without requiring a click (Step 8a.1).
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (!latestChecked || !latestAttempt || latestAttempt.status !== 'pending') return;
    if (!plans.length) return;
    const match = plans.find(p => p.id === latestAttempt.plan);
    if (!match) return;
    autoSelectedRef.current = true;
    setSelectedPlan(match);
  }, [latestChecked, latestAttempt, plans]);

  if (loadingAuth) return null;

  if (confirmed && selectedPlan) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
        <ConfirmationScreen plan={selectedPlan} groupName={groupName} />
      </div>
    );
  }

  if (selectedPlan) {
    // F2 fix-up (point 2): the resumed attempt only seeds THIS card when its
    // own plan matches the plan currently selected — if the admin picked a
    // different plan than the one that was resumed (e.g. after a success, or
    // by backing out and choosing another), this card must render idle for
    // that newly chosen plan rather than showing someone else's wording.
    const resumedForSelected =
      latestAttempt && latestAttempt.status === 'pending' && latestAttempt.plan === selectedPlan.id
        ? latestAttempt
        : null;
    return (
      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
        {/* U11: additive "Pay now with mobile money" card. The plan key passed
            here is selectedPlan.id, which already matches the API's plan keys
            ('starter' | 'standard') 1:1 — PLAN_META above is keyed the same
            way, so no separate mapping was needed.
            U12: never rendered for a no-expiry group.
            F2: never rendered for a non-admin/treasurer role, and waits for
            latestChecked so it doesn't flash idle before snapping to the
            resumed state. */}
        {canPayDirectly && !noExpiryGroup && latestChecked && (
          <LipilaPayCard
            plan={selectedPlan.id}
            enabled={lipilaEnabled}
            checkedLatest={latestChecked}
            resumedAttempt={resumedForSelected}
          />
        )}
        <p className="text-xs text-text-secondary text-center mb-4">
          Paid another way? Use the details below.
        </p>
        <SubscribeForm
          plan={selectedPlan}
          onBack={() => setSelectedPlan(null)}
          onConfirmed={() => setConfirmed(true)}
        />
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <Link
        to="/dashboard"
        className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </Link>

      <h1 className="text-3xl font-bold text-text-primary">Choose Your Plan</h1>
      <p className="text-sm text-text-secondary mt-1.5 mb-8">
        Start with a 30-day paid subscription. Cancel anytime.
      </p>

      {/* F2 fix-up (point 2): a recent success (within the backend's 24 h
          resume window) is shown here, above the still-selectable plan
          cards — it must never block paying again / switching plans. */}
      {canPayDirectly && !noExpiryGroup && latestChecked && latestAttempt?.status === 'success' && (
        <LipilaPayCard
          plan={latestAttempt.plan}
          enabled={lipilaEnabled}
          checkedLatest={latestChecked}
          resumedAttempt={latestAttempt}
        />
      )}

      {/* Step 8a.1 — role-appropriate messaging for anyone who can't renew
          themselves. The manual flow below stays available to every role. */}
      {member != null && !canPayDirectly && (
        <p className="text-sm text-text-secondary bg-surface-card border border-border-default rounded-xl px-4 py-3 mb-6">
          Ask your group admin or treasurer to renew the subscription.
        </p>
      )}

      {/* Step 8a.2 — a group bigger than every plan can't subscribe to any
          of them; point everyone at WhatsApp instead. */}
      {overCapacity && (
        <p className="text-sm text-text-secondary bg-surface-card border border-border-default rounded-xl px-4 py-3 mb-6">
          Your group has {memberCount} members, more than our largest plan covers.{' '}
          <a
            href={WHATSAPP_CONTACT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-primary underline font-medium"
          >
            Contact us to subscribe
          </a>
          .
        </p>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans.map(plan => {
          // Step 8a.2 — a plan too small for the group's current member
          // count is disabled, not selectable. memberCount comes from /me
          // (set on the auth store's `user`); memberLimit comes from the
          // same GET /billing/plans response the cards render from.
          const tooSmall = memberCount != null && plan.memberLimit < memberCount;
          const disabled = tooSmall || overCapacity;
          return (
            <div
              key={plan.id}
              className={`relative bg-surface-card rounded-xl p-6 flex flex-col ${
                plan.recommended
                  ? 'border-2 border-brand-primary'
                  : 'border border-border-default'
              } ${disabled ? 'opacity-60' : ''}`}
            >
              {plan.recommended && (
                <div className="absolute -top-3 right-4">
                  <span className="bg-brand-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Recommended
                  </span>
                </div>
              )}

              <h2 className="text-lg font-bold text-text-primary">{plan.name}</h2>
              <p className="text-3xl font-bold text-text-primary mt-1">
                ZMW {plan.price}
                <span className="text-sm font-normal text-text-secondary"> / month</span>
              </p>

              <ul className="mt-5 space-y-2.5 flex-1">
                {plan.features.map(feat => (
                  <li key={feat} className="flex items-start gap-2">
                    <Check size={16} className="text-[#2D7A2D] mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-text-primary">{feat}</span>
                  </li>
                ))}
              </ul>

              {tooSmall && (
                <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2 mt-4">
                  Your group has {memberCount} members. {plan.name} covers up to {plan.memberLimit}.
                </p>
              )}

              <button
                onClick={() => !disabled && setSelectedPlan(plan)}
                disabled={disabled}
                className={`mt-6 w-full text-sm font-semibold rounded-full py-2.5 transition-colors ${
                  disabled
                    ? 'bg-surface-page border border-border-default text-text-muted cursor-not-allowed'
                    : plan.recommended
                    ? 'bg-brand-primary hover:bg-brand-hover text-white'
                    : 'bg-surface-card border border-border-default text-text-primary hover:bg-surface-page'
                }`}
              >
                Subscribe
              </button>
            </div>
          );
        })}
      </div>

      {/* Step 8a.9 — admin/treasurer-only payment history, hides itself
          while there are no rows (feature dark or never used). */}
      {canPayDirectly && <PaymentHistory />}
    </div>
  );
}
