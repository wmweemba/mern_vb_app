import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import { ArrowLeft, Check, CheckCircle2 } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { API_BASE_URL } from '../lib/utils';
import { useAuth } from '../store/auth';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 150,
    recommended: false,
    features: [
      'Up to 15 members',
      'Savings tracking',
      'Loan management',
      'Financial reports',
      'PDF & Excel exports',
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 250,
    recommended: true,
    features: [
      'Up to 40 members',
      'Everything in Starter',
      'Priority support',
    ],
  },
];

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
            <a href="https://wa.me/260979645911" target="_blank" rel="noopener noreferrer" className="text-brand-primary underline">
              0979645911
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
  const { user: member } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const groupName = member?.groupName || 'My Group';

  if (confirmed && selectedPlan) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
        <ConfirmationScreen plan={selectedPlan} groupName={groupName} />
      </div>
    );
  }

  if (selectedPlan) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
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

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PLANS.map(plan => (
          <div
            key={plan.id}
            className={`relative bg-surface-card rounded-xl p-6 flex flex-col ${
              plan.recommended
                ? 'border-2 border-brand-primary'
                : 'border border-border-default'
            }`}
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

            <button
              onClick={() => setSelectedPlan(plan)}
              className={`mt-6 w-full text-sm font-semibold rounded-full py-2.5 transition-colors ${
                plan.recommended
                  ? 'bg-brand-primary hover:bg-brand-hover text-white'
                  : 'bg-surface-card border border-border-default text-text-primary hover:bg-surface-page'
              }`}
            >
              Subscribe
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
