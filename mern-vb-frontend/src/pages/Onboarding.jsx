import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';

const DEFAULTS = {
  cycleLengthMonths: 6,
  interestRate: 10,
  interestMethod: 'reducing',
  loanLimitMultiplier: 3,
  lateFineAmount: 500,
  lateFineType: 'fixed',
};

const STEP_LABELS = { 1: 'Group Details', 2: 'Lending Rules', 3: 'Fine Rules', 4: 'Confirm & Launch' };

const fieldClass = "h-12 w-full border border-border-default rounded-md px-3.5 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors";
const labelClass = "block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1";
const helpClass = "text-xs text-text-muted mt-1";

export default function Onboarding() {
  const { refreshMembership } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  // Step 1 fields
  const [groupName, setGroupName] = useState('');
  const [meetingDay, setMeetingDay] = useState('Saturday');
  const [cycleStartDate, setCycleStartDate] = useState('');
  const [cycleLengthMonths, setCycleLengthMonths] = useState(DEFAULTS.cycleLengthMonths);

  // Step 2 fields
  const [treasurerName, setTreasurerName] = useState('');
  const [phone, setPhone] = useState('');
  const [interestRate, setInterestRate] = useState(DEFAULTS.interestRate);
  const [interestMethod, setInterestMethod] = useState(DEFAULTS.interestMethod);
  const [loanLimitMultiplier, setLoanLimitMultiplier] = useState(DEFAULTS.loanLimitMultiplier);

  // Step 3 fields
  const [lateFineAmount, setLateFineAmount] = useState(DEFAULTS.lateFineAmount);
  const [lateFineType, setLateFineType] = useState(DEFAULTS.lateFineType);

  const handleSubmit = async () => {
    if (!groupName.trim() || !treasurerName.trim()) {
      setError('Group name and your display name are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE_URL}/groups`, {
        groupName,
        treasurerName,
        phone,
        meetingDay,
        cycleStartDate,
        cycleLengthMonths,
        interestRate,
        interestMethod,
        loanLimitMultiplier,
        lateFineAmount,
        lateFineType,
      });
      await refreshMembership();
      setShowWelcome(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create group. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showWelcome) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
        <div className="w-full max-w-md bg-surface-card rounded-xl p-8 space-y-6 text-center">
          <div className="text-4xl">&#127881;</div>
          <h1 className="text-2xl font-bold text-text-primary">Your group is ready!</h1>
          <p className="text-text-secondary">Start by adding your first member.</p>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="w-full bg-brand-primary hover:bg-brand-hover text-white py-3 rounded-md text-sm font-semibold transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
      <div className="w-full max-w-md bg-surface-card rounded-xl p-8 space-y-6">
        {/* Logo mark */}
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-brand-primary flex items-center justify-center text-white text-xl font-bold">C</div>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary">Setup Your Chama</h1>
          <p className="text-sm text-text-secondary mt-1">Step {step} of 4: {STEP_LABELS[step]}</p>
        </div>

        {/* Step indicator pills */}
        <div className="flex justify-center gap-1.5">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className={`h-1.5 rounded-full transition-all ${step === n ? 'w-8 bg-brand-primary' : 'w-6 bg-border-default'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Group name</label>
              <input type="text" placeholder="e.g. Pamodzi Savings Group" value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Meeting day</label>
              <select value={meetingDay} onChange={e => setMeetingDay(e.target.value)} className={fieldClass}>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d =>
                  <option key={d} value={d}>{d}</option>
                )}
              </select>
            </div>
            <div>
              <label className={labelClass}>Cycle start date</label>
              <input type="date" value={cycleStartDate} onChange={e => setCycleStartDate(e.target.value)}
                className={fieldClass} />
              <p className={helpClass}>When does your current or next savings cycle begin?</p>
            </div>
            <div>
              <label className={labelClass}>Cycle length</label>
              <select value={cycleLengthMonths} onChange={e => setCycleLengthMonths(Number(e.target.value))} className={fieldClass}>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
              </select>
              <p className={helpClass}>How long is one full savings-and-lending cycle?</p>
            </div>
            {error && <p className="text-status-overdue-text text-sm">{error}</p>}
            <button
              onClick={() => { if (groupName.trim()) { setError(''); setStep(2); } else setError('Please enter a group name.'); }}
              className="w-full bg-brand-primary hover:bg-brand-hover text-white py-3 rounded-md text-sm font-semibold transition-colors">
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Your display name</label>
              <input type="text" placeholder="Your full name (shown to members)" value={treasurerName}
                onChange={e => setTreasurerName(e.target.value)}
                className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Phone number (optional)</label>
              <input type="tel" placeholder="+260..." value={phone}
                onChange={e => setPhone(e.target.value)}
                className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Interest rate (%)</label>
              <input type="number" min="1" max="50" value={interestRate}
                onChange={e => setInterestRate(Number(e.target.value))}
                className={fieldClass} />
              <p className={helpClass}>The interest rate charged on loans. E.g. 10 means 10% interest.</p>
            </div>
            <div>
              <label className={labelClass}>Interest method</label>
              <select value={interestMethod} onChange={e => setInterestMethod(e.target.value)} className={fieldClass}>
                <option value="reducing">Reducing balance</option>
                <option value="flat">Flat rate</option>
              </select>
              <p className={helpClass}>
                {interestMethod === 'reducing'
                  ? 'Interest decreases as the loan is repaid — fairer for borrowers.'
                  : 'Same interest charge every installment — simpler to explain.'}
              </p>
            </div>
            <div>
              <label className={labelClass}>Loan limit multiplier</label>
              <input type="number" min="1" max="10" value={loanLimitMultiplier}
                onChange={e => setLoanLimitMultiplier(Number(e.target.value))}
                className={fieldClass} />
              <p className={helpClass}>
                Members can borrow up to X times their total savings.
                E.g. 3 means a member with K1,000 saved can borrow up to K3,000.
              </p>
            </div>
            {error && <p className="text-status-overdue-text text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 border border-border-default rounded-md py-3 text-sm text-text-secondary hover:bg-surface-page transition-colors">Back</button>
              <button
                onClick={() => { if (treasurerName.trim()) { setError(''); setStep(3); } else setError('Please enter your name.'); }}
                className="flex-1 bg-brand-primary hover:bg-brand-hover text-white py-3 rounded-md text-sm font-semibold transition-colors">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Late payment fine</label>
              <input type="number" min="0" value={lateFineAmount}
                onChange={e => setLateFineAmount(Number(e.target.value))}
                className={fieldClass} />
              <p className={helpClass}>
                {lateFineType === 'fixed'
                  ? `A flat K${lateFineAmount} fine for late payments.`
                  : `${lateFineAmount}% of the overdue amount as a fine.`}
              </p>
            </div>
            <div>
              <label className={labelClass}>Fine type</label>
              <select value={lateFineType} onChange={e => setLateFineType(e.target.value)} className={fieldClass}>
                <option value="fixed">Fixed amount (e.g. K500)</option>
                <option value="percentage">Percentage of overdue amount</option>
              </select>
            </div>
            {error && <p className="text-status-overdue-text text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 border border-border-default rounded-md py-3 text-sm text-text-secondary hover:bg-surface-page transition-colors">Back</button>
              <button onClick={() => { setError(''); setStep(4); }}
                className="flex-1 bg-brand-primary hover:bg-brand-hover text-white py-3 rounded-md text-sm font-semibold transition-colors">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-surface-page rounded-lg p-4 space-y-2 text-sm text-text-primary">
              <p><span className="font-medium">Group:</span> {groupName}</p>
              <p><span className="font-medium">Meeting day:</span> {meetingDay}</p>
              <p><span className="font-medium">Cycle:</span> {cycleLengthMonths} months{cycleStartDate ? `, starting ${cycleStartDate}` : ''}</p>
              <p><span className="font-medium">Your name:</span> {treasurerName}</p>
              {phone && <p><span className="font-medium">Phone:</span> {phone}</p>}
              <p><span className="font-medium">Interest:</span> {interestRate}% ({interestMethod} balance)</p>
              <p><span className="font-medium">Loan limit:</span> {loanLimitMultiplier}x savings</p>
              <p><span className="font-medium">Late fine:</span> {lateFineType === 'fixed' ? `K${lateFineAmount}` : `${lateFineAmount}%`}</p>
              <p><span className="font-medium">Your role:</span> Admin</p>
              <p><span className="font-medium">Free trial:</span> 15 days</p>
            </div>
            {error && <p className="text-status-overdue-text text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep(3)} className="flex-1 border border-border-default rounded-md py-3 text-sm text-text-secondary hover:bg-surface-page transition-colors">Back</button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 bg-brand-primary hover:bg-brand-hover text-white py-3 rounded-md text-sm font-semibold transition-colors disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
