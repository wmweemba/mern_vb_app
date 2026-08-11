import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';
import Select from '../components/ui/Select';

const DEFAULTS = {
  cycleLengthMonths: 6,
  interestRate: 10,
  interestMethod: 'reducing',
  loanLimitMultiplier: 3,
  lateFineAmount: 500,
  lateFineType: 'fixed',
};

// Fallback catalogue shown if GET /api/group-templates fails or hasn't been seeded —
// same two archetypes the backend seeds by default, so onboarding still works.
const FALLBACK_TEMPLATES = [
  {
    key: 'village_bank', name: 'Village Bank',
    description: 'Standard savings group: scheduled loans repaid over fixed installments, profit share-out at cycle end.',
    policies: { loanAccrual: 'scheduled_reducing', interestObligation: 'none' },
    features: { fines: true, shareOut: true, savingsInterest: true },
    defaults: DEFAULTS,
  },
  {
    key: 'grocery_chilimba', name: 'Grocery Savings Group',
    description: 'Members save monthly and borrow from a revolving pool; funds buy groceries in bulk at cycle end. No fines, no fixed installments.',
    policies: { loanAccrual: 'revolving_monthly', interestObligation: 'per_member_quota' },
    features: { fines: false, shareOut: false, savingsInterest: false },
    defaults: { ...DEFAULTS, interestRate: 10 },
  },
];

const labelClass = "block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1";
const fieldClass = "h-12 w-full border border-border-default rounded-md px-3.5 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors";
const helpClass = "text-xs text-text-muted mt-1";

export default function Onboarding() {
  const { refreshMembership } = useAuth();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState(FALLBACK_TEMPLATES);
  const [templateKey, setTemplateKey] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  // Group Details
  const [groupName, setGroupName] = useState('');
  const [meetingDay, setMeetingDay] = useState('Saturday');
  const [cycleStartDate, setCycleStartDate] = useState('');
  const [cycleLengthMonths, setCycleLengthMonths] = useState(DEFAULTS.cycleLengthMonths);

  // Lending Rules
  const [treasurerName, setTreasurerName] = useState('');
  const [phone, setPhone] = useState('');
  const [interestRate, setInterestRate] = useState(DEFAULTS.interestRate);
  const [interestMethod, setInterestMethod] = useState(DEFAULTS.interestMethod);
  const [loanLimitMultiplier, setLoanLimitMultiplier] = useState(DEFAULTS.loanLimitMultiplier);
  const [interestObligationAmount, setInterestObligationAmount] = useState(0);

  // Fine Rules
  const [lateFineAmount, setLateFineAmount] = useState(DEFAULTS.lateFineAmount);
  const [lateFineType, setLateFineType] = useState(DEFAULTS.lateFineType);
  const [partialPaymentFineAmount, setPartialPaymentFineAmount] = useState(0);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/group-templates`)
      .then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) setTemplates(res.data);
      })
      .catch(() => { /* keep FALLBACK_TEMPLATES */ });
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find(t => t.key === templateKey) || null,
    [templates, templateKey]
  );

  const isRevolving = selectedTemplate?.policies?.loanAccrual === 'revolving_monthly';
  const hasQuota = selectedTemplate?.policies?.interestObligation === 'per_member_quota';
  const showFineStep = selectedTemplate ? selectedTemplate.features?.fines !== false : true;

  // Steps are template-dependent: Fine Rules is skipped entirely for a template with
  // no fines (e.g. grocery_chilimba), per docs/plan_configurable_group_rules.md §2.3.
  const steps = useMemo(() => {
    const s = ['template', 'details', 'lending'];
    if (showFineStep) s.push('fines');
    s.push('confirm');
    return s;
  }, [showFineStep]);

  const STEP_LABELS = {
    template: 'Choose a Template',
    details: 'Group Details',
    lending: 'Lending Rules',
    fines: 'Fine Rules',
    confirm: 'Confirm & Launch',
  };

  const step = steps[stepIndex];
  const goTo = name => setStepIndex(steps.indexOf(name));
  const goNext = () => setStepIndex(i => Math.min(i + 1, steps.length - 1));
  const goBack = () => setStepIndex(i => Math.max(i - 1, 0));

  const handleSelectTemplate = key => {
    setTemplateKey(key);
    const tpl = templates.find(t => t.key === key);
    if (tpl?.defaults) {
      setCycleLengthMonths(tpl.defaults.cycleLengthMonths ?? DEFAULTS.cycleLengthMonths);
      setInterestRate(tpl.defaults.interestRate ?? DEFAULTS.interestRate);
      setInterestMethod(tpl.defaults.interestMethod ?? DEFAULTS.interestMethod);
      setLoanLimitMultiplier(tpl.defaults.loanLimitMultiplier ?? DEFAULTS.loanLimitMultiplier);
      setInterestObligationAmount(tpl.defaults.interestObligationAmount ?? 0);
    }
    setError('');
    goNext();
  };

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
        lateFineAmount: showFineStep ? lateFineAmount : 0,
        lateFineType,
        partialPaymentFineAmount: showFineStep ? partialPaymentFineAmount : 0,
        templateKey: templateKey || 'village_bank',
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
          <p className="text-sm text-text-secondary mt-1">Step {stepIndex + 1} of {steps.length}: {STEP_LABELS[step]}</p>
        </div>

        {/* Step indicator pills */}
        <div className="flex justify-center gap-1.5">
          {steps.map((s, i) => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${i === stepIndex ? 'w-8 bg-brand-primary' : 'w-6 bg-border-default'}`} />
          ))}
        </div>

        {step === 'template' && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">Pick the setup that matches how your group actually runs. You can change this later, before your first cycle has any transactions.</p>
            <div className="space-y-3">
              {templates.map(tpl => (
                <button
                  key={tpl.key}
                  onClick={() => handleSelectTemplate(tpl.key)}
                  className="w-full text-left border border-border-default rounded-md p-4 hover:border-brand-primary hover:bg-brand-light/40 transition-colors"
                >
                  <p className="text-sm font-semibold text-text-primary">{tpl.name}</p>
                  <p className="text-xs text-text-secondary mt-1">{tpl.description}</p>
                </button>
              ))}
            </div>
            {error && <p className="text-status-overdue-text text-sm">{error}</p>}
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Group name</label>
              <input type="text" placeholder="e.g. Pamodzi Savings Group" value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Meeting day</label>
              <Select value={meetingDay} onChange={e => setMeetingDay(e.target.value)}>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d =>
                  <option key={d} value={d}>{d}</option>
                )}
              </Select>
            </div>
            <div>
              <label className={labelClass}>Cycle start date</label>
              <input type="date" value={cycleStartDate} onChange={e => setCycleStartDate(e.target.value)}
                className={fieldClass} />
              <p className={helpClass}>When does your current or next savings cycle begin?</p>
            </div>
            <div>
              <label className={labelClass}>Cycle length</label>
              <Select value={cycleLengthMonths} onChange={e => setCycleLengthMonths(Number(e.target.value))}>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
              </Select>
              <p className={helpClass}>How long is one full savings-and-lending cycle?</p>
            </div>
            {error && <p className="text-status-overdue-text text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => goTo('template')} className="flex-1 border border-border-default rounded-md py-3 text-sm text-text-secondary hover:bg-surface-page transition-colors">Back</button>
              <button
                onClick={() => { if (groupName.trim()) { setError(''); goNext(); } else setError('Please enter a group name.'); }}
                className="flex-1 bg-brand-primary hover:bg-brand-hover text-white py-3 rounded-md text-sm font-semibold transition-colors">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'lending' && (
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
              <label className={labelClass}>{isRevolving ? 'Monthly interest rate (%)' : 'Interest rate (%)'}</label>
              <input type="number" min="1" max="50" value={interestRate}
                onChange={e => setInterestRate(Number(e.target.value))}
                className={fieldClass} />
              <p className={helpClass}>
                {isRevolving
                  ? 'Charged each month on whatever balance a member still owes — there is no fixed schedule.'
                  : 'The interest rate charged on loans. E.g. 10 means 10% interest.'}
              </p>
            </div>

            {!isRevolving && (
              <>
                <div>
                  <label className={labelClass}>Interest method</label>
                  <Select value={interestMethod} onChange={e => setInterestMethod(e.target.value)}>
                    <option value="reducing">Reducing balance</option>
                    <option value="flat">Flat rate</option>
                  </Select>
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
              </>
            )}

            {hasQuota && (
              <div>
                <label className={labelClass}>Mandatory interest quota (K)</label>
                <input type="number" min="0" value={interestObligationAmount}
                  onChange={e => setInterestObligationAmount(Number(e.target.value))}
                  className={fieldClass} />
                <p className={helpClass}>
                  Every member owes this much interest per cycle, whether from their own borrowing
                  or a direct top-up payment. Set to 0 if the group has no such rule.
                </p>
              </div>
            )}

            {error && <p className="text-status-overdue-text text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => goTo('details')} className="flex-1 border border-border-default rounded-md py-3 text-sm text-text-secondary hover:bg-surface-page transition-colors">Back</button>
              <button
                onClick={() => { if (treasurerName.trim()) { setError(''); goNext(); } else setError('Please enter your name.'); }}
                className="flex-1 bg-brand-primary hover:bg-brand-hover text-white py-3 rounded-md text-sm font-semibold transition-colors">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'fines' && (
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
              <Select value={lateFineType} onChange={e => setLateFineType(e.target.value)}>
                <option value="fixed">Fixed amount (e.g. K500)</option>
                <option value="percentage">Percentage of overdue amount</option>
              </Select>
            </div>
            <div>
              <label className={labelClass}>Partial payment fine</label>
              <input type="number" min="0" value={partialPaymentFineAmount}
                onChange={e => setPartialPaymentFineAmount(Number(e.target.value))}
                className={fieldClass} />
              <p className={helpClass}>Optional. Charge a fine when a member pays only the interest and carries the principal forward. Set to 0 for no fine.</p>
            </div>
            {error && <p className="text-status-overdue-text text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => goTo('lending')} className="flex-1 border border-border-default rounded-md py-3 text-sm text-text-secondary hover:bg-surface-page transition-colors">Back</button>
              <button onClick={() => { setError(''); goNext(); }}
                className="flex-1 bg-brand-primary hover:bg-brand-hover text-white py-3 rounded-md text-sm font-semibold transition-colors">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-surface-page rounded-lg p-4 space-y-2 text-sm text-text-primary">
              <p><span className="font-medium">Template:</span> {selectedTemplate?.name || 'Village Bank'}</p>
              <p><span className="font-medium">Group:</span> {groupName}</p>
              <p><span className="font-medium">Meeting day:</span> {meetingDay}</p>
              <p><span className="font-medium">Cycle:</span> {cycleLengthMonths} months{cycleStartDate ? `, starting ${cycleStartDate}` : ''}</p>
              <p><span className="font-medium">Your name:</span> {treasurerName}</p>
              {phone && <p><span className="font-medium">Phone:</span> {phone}</p>}
              {isRevolving
                ? <p><span className="font-medium">Interest:</span> {interestRate}% monthly, on outstanding balance</p>
                : <>
                    <p><span className="font-medium">Interest:</span> {interestRate}% ({interestMethod} balance)</p>
                    <p><span className="font-medium">Loan limit:</span> {loanLimitMultiplier}x savings</p>
                  </>
              }
              {hasQuota && <p><span className="font-medium">Interest quota:</span> {interestObligationAmount > 0 ? `K${interestObligationAmount} per member per cycle` : 'None'}</p>}
              {showFineStep
                ? <>
                    <p><span className="font-medium">Late fine:</span> {lateFineType === 'fixed' ? `K${lateFineAmount}` : `${lateFineAmount}%`}</p>
                    <p><span className="font-medium">Partial payment fine:</span> {partialPaymentFineAmount > 0 ? `K${partialPaymentFineAmount}` : 'None'}</p>
                  </>
                : <p><span className="font-medium">Fines:</span> Not used by this group type</p>
              }
              <p><span className="font-medium">Your role:</span> Admin</p>
              <p><span className="font-medium">Free trial:</span> 15 days</p>
            </div>
            {error && <p className="text-status-overdue-text text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={goBack} className="flex-1 border border-border-default rounded-md py-3 text-sm text-text-secondary hover:bg-surface-page transition-colors">Back</button>
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
