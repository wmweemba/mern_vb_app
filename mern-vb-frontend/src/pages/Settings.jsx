import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, ExternalLink, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';

function SectionCard({ title, children }) {
  return (
    <div className="bg-surface-card rounded-lg p-6">
      <div className="flex items-center justify-between border-b border-border-default pb-3 mb-5">
        <h2 className="text-xl font-bold text-text-primary">{title}</h2>
        <button className="flex items-center gap-1.5 text-xs font-medium text-text-secondary border border-border-default rounded-full px-3 py-1.5 hover:bg-surface-page transition-colors">
          <Pencil size={13} />
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-widest text-text-secondary mb-1">{label}</p>
      <p className="text-sm font-medium text-text-primary">{value || '—'}</p>
    </div>
  );
}

const fmtInterestMethod = (v) => v === 'reducing' ? 'Reducing Balance' : v === 'flat' ? 'Flat Rate' : v;
const fmtProfitSharing = (v) => v === 'proportional' ? 'Proportional (savings)' : v === 'equal' ? 'Equal split' : v;
const fmtFineType = (v) => v === 'fixed' ? 'Fixed amount' : v === 'percentage' ? 'Percentage of overdue' : v;

export default function Settings() {
  const { trialActive } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/group-settings`)
      .then(res => setSettings(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">Manage your group configuration</p>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading settings...</p>
      ) : (
        <>
          {/* Group Profile */}
          <SectionCard title="Group Profile">
            <div className="space-y-4">
              <Field label="Group Name" value={settings?.groupName} />
              <Field label="Meeting Day" value={settings?.meetingDay} />
              <Field label="Cycle Length" value={settings?.cycleLengthMonths ? `${settings.cycleLengthMonths} months` : null} />
              <Field label="Currency" value="ZMW (Zambian Kwacha)" />
            </div>
          </SectionCard>

          {/* Financial Rules */}
          <SectionCard title="Financial Rules">
            <div className="space-y-4">
              <Field label="Interest Rate" value={settings?.interestRate != null ? `${settings.interestRate}%` : null} />
              <Field label="Interest Method" value={fmtInterestMethod(settings?.interestMethod)} />
              <Field label="Loan Limit Multiplier" value={settings?.loanLimitMultiplier != null ? `${settings.loanLimitMultiplier}× savings` : null} />
              <Field label="Profit Sharing Method" value={fmtProfitSharing(settings?.profitSharingMethod)} />
            </div>
          </SectionCard>

          {/* Fine Rules */}
          <SectionCard title="Fine Rules">
            <div className="space-y-4">
              <Field label="Late Fine Amount" value={settings?.overdueFineAmount != null ? `K${settings.overdueFineAmount}` : null} />
              <Field label="Fine Type" value={fmtFineType(settings?.lateFineType)} />
            </div>
          </SectionCard>
        </>
      )}

      {/* Member Roles */}
      <div className="bg-surface-card rounded-lg p-6">
        <div className="flex items-center justify-between border-b border-border-default pb-3 mb-5">
          <h2 className="text-xl font-bold text-text-primary">Member Roles</h2>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Manage member roles and permissions from the Members page.
        </p>
        <Link
          to="/members"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-primary hover:underline"
        >
          Go to Members
          <ExternalLink size={14} />
        </Link>
      </div>

      {/* Billing */}
      <div className="bg-surface-card rounded-lg p-6">
        <div className="border-b border-border-default pb-3 mb-5">
          <h2 className="text-xl font-bold text-text-primary">Billing</h2>
        </div>
        {trialActive ? (
          <div className="bg-trial-bg border border-trial-border rounded-md p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-trial-text">Trial Active</p>
                <p className="text-xs text-text-secondary mt-0.5">15 days remaining on your free trial</p>
              </div>
              <button
                onClick={() => navigate('/upgrade')}
                className="bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full px-4 py-1.5 transition-colors"
              >
                Upgrade
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-text-secondary mb-4">Your trial has ended. Upgrade to continue recording new transactions.</p>
            <button
              onClick={() => navigate('/upgrade')}
              className="bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full px-5 py-2 transition-colors"
            >
              Upgrade Now
            </button>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="bg-surface-card rounded-lg p-6 border border-status-overdue-text/20">
        <div className="border-b border-status-overdue-text/20 pb-3 mb-5">
          <h2 className="text-xl font-bold text-status-overdue-text">Danger Zone</h2>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">Close Group</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Permanently close this group. All data will be archived. This cannot be undone.
            </p>
          </div>
          <button
            disabled
            className="flex-shrink-0 flex items-center gap-1.5 bg-status-overdue-bg border border-status-overdue-text text-status-overdue-text text-sm font-semibold rounded-full px-4 py-1.5 opacity-60 cursor-not-allowed"
          >
            <AlertTriangle size={14} />
            Close Group
          </button>
        </div>
      </div>
    </div>
  );
}
