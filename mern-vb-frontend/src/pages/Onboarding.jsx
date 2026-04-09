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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow p-8 space-y-6 text-center">
          <div className="text-4xl">&#127881;</div>
          <h1 className="text-2xl font-bold text-gray-900">Your group is ready!</h1>
          <p className="text-gray-600">Start by adding your first member.</p>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="w-full bg-blue-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Chama360</h1>
          <p className="text-sm text-gray-500 mt-1">Set up your group in 4 easy steps</p>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${step >= n ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">Step 1: Group info</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Group name</label>
              <input type="text" placeholder="e.g. Pamodzi Savings Group" value={groupName}
                onChange={e => setGroupName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting day</label>
              <select value={meetingDay} onChange={e => setMeetingDay(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d =>
                  <option key={d} value={d}>{d}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cycle start date</label>
              <input type="date" value={cycleStartDate} onChange={e => setCycleStartDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">When does your current or next savings cycle begin?</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cycle length</label>
              <select value={cycleLengthMonths} onChange={e => setCycleLengthMonths(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">How long is one full savings-and-lending cycle?</p>
            </div>
            <button
              onClick={() => { if (groupName.trim()) { setError(''); setStep(2); } else setError('Please enter a group name.'); }}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">Step 2: Loan settings</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your display name</label>
              <input type="text" placeholder="Your full name (shown to members)" value={treasurerName}
                onChange={e => setTreasurerName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone number (optional)</label>
              <input type="tel" placeholder="+260..." value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interest rate (%)</label>
              <input type="number" min="1" max="50" value={interestRate}
                onChange={e => setInterestRate(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">The interest rate charged on loans. E.g. 10 means 10% interest.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interest method</label>
              <select value={interestMethod} onChange={e => setInterestMethod(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="reducing">Reducing balance</option>
                <option value="flat">Flat rate</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {interestMethod === 'reducing'
                  ? 'Interest decreases as the loan is repaid — fairer for borrowers.'
                  : 'Same interest charge every installment — simpler to explain.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan limit multiplier</label>
              <input type="number" min="1" max="10" value={loanLimitMultiplier}
                onChange={e => setLoanLimitMultiplier(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">
                Members can borrow up to X times their total savings.
                E.g. 3 means a member with K1,000 saved can borrow up to K3,000.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button
                onClick={() => { if (treasurerName.trim()) { setError(''); setStep(3); } else setError('Please enter your name.'); }}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">Step 3: Fines</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Late payment fine</label>
              <input type="number" min="0" value={lateFineAmount}
                onChange={e => setLateFineAmount(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-500 mt-1">
                {lateFineType === 'fixed'
                  ? `A flat K${lateFineAmount} fine for late payments.`
                  : `${lateFineAmount}% of the overdue amount as a fine.`}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fine type</label>
              <select value={lateFineType} onChange={e => setLateFineType(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="fixed">Fixed amount (e.g. K500)</option>
                <option value="percentage">Percentage of overdue amount</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button onClick={() => { setError(''); setStep(4); }}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">Step 4: Confirm & create</h2>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm text-gray-700">
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
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep(3)} className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        )}

        {error && step !== 4 && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </div>
  );
}
