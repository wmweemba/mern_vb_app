import { useNavigate } from 'react-router-dom';

export default function Welcome() {
  const navigate = useNavigate();

  const handleStartTrial = () => {
    sessionStorage.setItem('trialAccepted', '1');
    navigate('/onboarding');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
        <span className="text-xl font-bold text-blue-700">Chama360</span>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center max-w-3xl mx-auto w-full">
        <h1 className="text-4xl font-extrabold text-gray-900 leading-tight">
          Run your savings group<br />without the spreadsheets
        </h1>
        <p className="mt-4 text-lg text-gray-600 max-w-xl">
          Chama360 helps village banking groups in Zambia track savings, manage loans,
          collect fines, and share reports — all from one place.
        </p>

        <button
          onClick={handleStartTrial}
          className="mt-8 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold px-8 py-4 rounded-xl shadow-md transition-colors"
        >
          Start my 15-day free trial
        </button>
        <p className="mt-3 text-sm text-gray-400">No payment required to start. Cancel anytime.</p>

        {/* Features */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 gap-6 text-left w-full">
          {[
            { title: 'Savings tracking', desc: 'Record monthly contributions per member and see totals at a glance.' },
            { title: 'Loan management', desc: 'Issue loans, generate repayment schedules, and track installments automatically.' },
            { title: 'Reports & exports', desc: 'Download PDF and Excel reports for meetings or audits in seconds.' },
            { title: 'Member self-service', desc: 'Members can view their own savings and loan balances with read-only access.' },
          ].map(f => (
            <div key={f.title} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="font-semibold text-gray-800">{f.title}</p>
              <p className="mt-1 text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="mt-16 w-full">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Simple, affordable pricing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-left">
              <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide">Starter</p>
              <p className="mt-2 text-3xl font-extrabold text-gray-900">ZMW 150<span className="text-base font-medium text-gray-500">/month</span></p>
              <p className="mt-3 text-sm text-gray-600">Up to 15 members. All core features included.</p>
            </div>
            <div className="bg-blue-600 rounded-xl shadow-sm p-6 text-left text-white">
              <p className="text-sm font-semibold text-blue-200 uppercase tracking-wide">Standard</p>
              <p className="mt-2 text-3xl font-extrabold">ZMW 250<span className="text-base font-medium text-blue-200">/month</span></p>
              <p className="mt-3 text-sm text-blue-100">Up to 40 members. All core features included.</p>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <button
          onClick={handleStartTrial}
          className="mt-12 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold px-8 py-4 rounded-xl shadow-md transition-colors"
        >
          Start my 15-day free trial
        </button>
        <p className="mt-3 text-sm text-gray-400 pb-12">Your first 15 days are completely free.</p>
      </main>
    </div>
  );
}
