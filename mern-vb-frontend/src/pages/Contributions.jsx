import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';
import SlideoverDrawer from '../components/ui/SlideoverDrawer';
import Select from '../components/ui/Select';
import AddContributionForm from '../features/contributions/AddContributionForm';
import RecordSocialFundExpenseForm from '../features/contributions/RecordSocialFundExpenseForm';
import { Coins, Wallet, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { FaCoins } from 'react-icons/fa';

const btnPrimary = 'bg-brand-primary hover:bg-brand-hover text-white font-semibold rounded-md w-full py-3 text-sm transition-colors';
const fmt = (v) => `K${Number(v || 0).toLocaleString()}`;

// Names the actual pot the money landed in. fundName is the snapshot taken at
// record time; rows from before named funds existed carry none, and the only
// pot that existed then was the social fund.
function RoutingBadge({ affectsMainBalance, fundName, overrodeDefault }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0 ${
      affectsMainBalance
        ? 'bg-brand-light text-brand-primary'
        : 'bg-blue-50 text-blue-700'
    }`}>
      {affectsMainBalance ? 'Main' : (fundName || 'Social Fund')}
      {overrodeDefault && ' *'}
    </span>
  );
}

function CategoryBadge({ category }) {
  const labels = {
    birthday: 'Birthday',
    bereavement: 'Bereavement',
    stationery: 'Stationery',
    refreshments: 'Refreshments',
    app_subscription: 'App Subscription',
    other: 'Other',
  };
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-surface-page text-text-secondary border border-border-default capitalize">
      {labels[category] || category}
    </span>
  );
}

export default function Contributions() {
  const { user } = useAuth();
  const [tab, setTab] = useState('contributions');
  const [contributions, setContributions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [allTypes, setAllTypes] = useState([]);
  const [showAddContribution, setShowAddContribution] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  // Which pot the "+ Expense" button was pressed on, so the form opens on that
  // fund rather than defaulting to the first one.
  const [expenseFundId, setExpenseFundId] = useState(null);

  const canRecord = ['admin', 'treasurer', 'loan_officer'].includes(user?.role);
  const canRecordExpense = ['admin', 'treasurer'].includes(user?.role);

  const fetchAll = async () => {
    setLoading(true); setError('');
    try {
      const [cRes, eRes, sfRes, tRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/contributions`),
        axios.get(`${API_BASE_URL}/funds/expenses`),
        axios.get(`${API_BASE_URL}/funds?active=true`),
        axios.get(`${API_BASE_URL}/contribution-types`),
      ]);
      setContributions(cRes.data);
      setExpenses(eRes.data);
      setFunds(Array.isArray(sfRes.data) ? sfRes.data : []);
      setAllTypes(tRes.data);
    } catch {
      setError('Failed to load contributions data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const refresh = () => fetchAll();
    window.addEventListener('contributionsChanged', refresh);
    return () => window.removeEventListener('contributionsChanged', refresh);
  }, []);

  // Group contributions by member
  const filtered = typeFilter
    ? contributions.filter(c => c.contributionTypeId?._id === typeFilter || c.typeName === typeFilter)
    : contributions;

  const byMember = filtered.reduce((acc, c) => {
    const key = c.userId?._id || c.userId || 'unknown';
    if (!acc[key]) acc[key] = { user: c.userId, total: 0, entries: [] };
    acc[key].total += Number(c.amount);
    acc[key].entries.push(c);
    return acc;
  }, {});

  // Ledger is built PER FUND. Pooling every pot's credits and debits into one
  // running balance produced a number that matched no fund once a group ran more
  // than one — which the app subscription pot makes the normal case.
  const buildLedger = (fundId) => {
    const credits = contributions
      .filter(c => !c.affectsMainBalance && String(c.fundId) === String(fundId))
      .map(c => ({ ...c, _ledgerType: 'credit', _date: new Date(c.date || c.createdAt) }));
    const debits = expenses
      .filter(e => !e.cancelled && String(e.fundId) === String(fundId))
      .map(e => ({ ...e, _ledgerType: 'debit', _date: new Date(e.date || e.createdAt) }));
    let running = 0;
    return [...credits, ...debits]
      .sort((a, b) => a._date - b._date)
      .map(tx => {
        running += tx._ledgerType === 'credit' ? Number(tx.amount) : -Number(tx.amount);
        return { ...tx, _running: running };
      })
      .reverse(); // newest first for display
  };

  const totalContributions = contributions.reduce((s, c) => s + Number(c.amount), 0);
  const mainBalanceContributions = contributions.filter(c => c.affectsMainBalance).reduce((s, c) => s + Number(c.amount), 0);
  const fundContributions = contributions.filter(c => !c.affectsMainBalance).reduce((s, c) => s + Number(c.amount), 0);
  // Summed across every pot. Previously this page put a social-fund-only balance
  // directly above a ledger of every fund's expenses — two numbers that stopped
  // agreeing the moment a group ran a second pot.
  const fundsTotal = (funds || []).reduce((s, f) => s + Number(f.balance || 0), 0);
  const totalExpenses = expenses.filter(e => !e.cancelled).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="py-4 w-full max-w-2xl mx-auto mobile-safe-bottom">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-text-primary">Contributions</h1>
        <div className="flex gap-2">
          {canRecord && (
            <button
              onClick={() => setShowAddContribution(true)}
              className="bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full px-4 py-2 transition-colors"
            >
              + Record
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-surface-card rounded-lg p-4 border border-border-default">
            <div className="flex items-center gap-1.5 mb-1">
              <Coins size={14} className="text-brand-primary" />
              <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">Total Collected</p>
            </div>
            <p className="text-xl font-bold text-text-primary">{fmt(totalContributions)}</p>
            <p className="text-xs text-text-secondary mt-0.5">
              {fmt(mainBalanceContributions)} main · {fmt(fundContributions)} funds
            </p>
          </div>
          <div className="bg-surface-card rounded-lg p-4 border border-blue-100">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet size={14} className="text-blue-600" />
              <p className="text-xs font-medium uppercase tracking-widest text-blue-600">
                {funds.length === 1 ? funds[0].name : 'Funds'}
              </p>
            </div>
            <p className="text-xl font-bold text-text-primary">{fmt(fundsTotal)}</p>
            <p className="text-xs text-text-secondary mt-0.5">
              {funds.length > 1 ? `${funds.length} pots · ` : ''}{fmt(totalExpenses)} spent
            </p>
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 bg-surface-page rounded-lg p-1 mb-5 border border-border-default">
        <button
          onClick={() => setTab('contributions')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'contributions'
              ? 'bg-surface-card text-text-primary shadow-sm border border-border-default'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Member Contributions
        </button>
        <button
          onClick={() => setTab('social-fund')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'social-fund'
              ? 'bg-surface-card text-text-primary shadow-sm border border-border-default'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {funds.length === 1 ? funds[0].name : 'Funds'}
        </button>
      </div>

      {loading && <p className="text-sm text-text-secondary">Loading...</p>}
      {error && <p className="text-sm text-status-overdue-text">{error}</p>}

      {/* ── Contributions tab ── */}
      {!loading && !error && tab === 'contributions' && (
        <>
          {/* Type filter */}
          {allTypes.length > 0 && (
            <div className="mb-4">
              <Select
                className="w-64"
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
              >
                <option value="">All types</option>
                {allTypes.map(t => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </Select>
            </div>
          )}

          {Object.values(byMember).length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border-dashed rounded-md">
              <FaCoins className="mx-auto mb-2 text-text-muted" size={24} />
              <p className="text-sm text-text-secondary">No contributions recorded yet</p>
            </div>
          ) : (
            <Accordion type="single" collapsible>
              {Object.values(byMember).map(({ user: member, total, entries }) => {
                const key = member?._id || member?.username || member;
                return (
                  <AccordionItem
                    key={key}
                    value={key}
                    className="bg-surface-card rounded-lg mb-2 border border-border-default px-4"
                  >
                    <AccordionTrigger className="py-4">
                      <div className="flex items-center gap-2 w-full">
                        <Users size={15} className="text-text-secondary flex-shrink-0" />
                        <span className="font-semibold text-text-primary">{member?.name || member?.username || 'Unknown'}</span>
                        <span className="ml-auto font-bold text-amount-positive">{fmt(total)}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-2 pb-3">
                        {entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(c => (
                          <div key={c._id} className="rounded-md border border-border-default p-3 bg-surface-page">
                            <div className="flex items-center gap-2 justify-between">
                              <span className="text-sm font-medium text-text-primary">{c.typeName}</span>
                              <div className="flex items-center gap-2">
                                <RoutingBadge affectsMainBalance={c.affectsMainBalance} fundName={c.fundName} overrodeDefault={c.overrodeDefault} />
                                <span className="font-bold text-amount-positive text-sm">{fmt(c.amount)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                              <span>{c.date ? new Date(c.date).toLocaleDateString() : new Date(c.createdAt).toLocaleDateString()}</span>
                              {c.note && <span className="truncate">· {c.note}</span>}
                              {c.overrodeDefault && <span className="text-status-pending-text">· routing overridden</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </>
      )}

      {/* ── Funds tab — one card per active pot, each with only its own expenses.
             A group can hold several (welfare, app subscription, treasurer-added),
             so a single balance over a pooled expense ledger would not reconcile. ── */}
      {!loading && !error && tab === 'social-fund' && (
        <div className="space-y-6">
          {funds.length === 0 && (
            <p className="text-sm text-text-secondary">No funds configured for this group.</p>
          )}
          {funds.map(fund => {
            const fundExpenses = expenses.filter(e => String(e.fundId) === String(fund._id));
            const fundSpent = fundExpenses.filter(e => !e.cancelled).reduce((sum, e) => sum + Number(e.amount), 0);
            const ledgerDisplay = buildLedger(fund._id);
            return (
            <div key={fund._id} className="space-y-4">
          {/* Current balance + record expense button */}
          <div className="bg-surface-dark rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-text-on-dark-muted mb-1">
                {fund.name}
              </p>
              <p className="text-3xl font-bold text-white">{fmt(fund.balance)}</p>
              <p className="text-xs text-text-on-dark-muted mt-1">{fmt(fundSpent)} spent</p>
            </div>
            {canRecordExpense && (
              <button
                onClick={() => { setExpenseFundId(fund._id); setShowAddExpense(true); }}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-full px-4 py-2 transition-colors border border-white/20"
              >
                + Expense
              </button>
            )}
          </div>

          {/* Ledger */}
          {ledgerDisplay.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border-dashed rounded-md">
              <Wallet className="mx-auto mb-2 text-text-muted" size={24} />
              <p className="text-sm text-text-secondary">No {fund.name} activity yet</p>
            </div>
          ) : (
            <div className="border border-border-default rounded-md overflow-hidden">
              {ledgerDisplay.map((tx, idx) => {
                const isCredit = tx._ledgerType === 'credit';
                const dateStr = tx._date ? tx._date.toLocaleDateString() : '—';
                return (
                  <div
                    key={tx._id || idx}
                    className="flex items-start gap-3 px-4 py-3 border-b border-border-default last:border-b-0 bg-surface-card"
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isCredit ? 'bg-blue-50' : 'bg-status-overdue-bg'
                    }`}>
                      {isCredit
                        ? <TrendingUp size={13} className="text-blue-600" />
                        : <TrendingDown size={13} className="text-status-overdue-text" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {isCredit
                            ? (tx.userId?.name || 'Member') + ' — ' + tx.typeName
                            : tx.description
                          }
                        </span>
                        <span className={`text-sm font-bold flex-shrink-0 ${isCredit ? 'text-blue-600' : 'text-status-overdue-text'}`}>
                          {isCredit ? '+' : '−'}{fmt(tx.amount)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-text-secondary">
                        <span>{dateStr}</span>
                        {!isCredit && tx.category && <CategoryBadge category={tx.category} />}
                        {!isCredit && tx.beneficiaryName && <span>· {tx.beneficiaryName}</span>}
                      </div>
                    </div>
                    {/* Running balance */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-text-muted">balance</p>
                      <p className="text-xs font-semibold text-text-primary">{fmt(tx._running)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
            </div>
            );
          })}
        </div>
      )}

      {/* Add Contribution Drawer */}
      <SlideoverDrawer
        open={showAddContribution}
        onClose={() => setShowAddContribution(false)}
        title="Record Contribution"
        footer={
          <button type="submit" form="add-contribution-form-page" className={btnPrimary}>
            Record Contribution
          </button>
        }
      >
        <AddContributionForm
          formId="add-contribution-form-page"
          onSuccess={() => { setShowAddContribution(false); fetchAll(); }}
        />
      </SlideoverDrawer>

      {/* Record Expense Drawer */}
      <SlideoverDrawer
        open={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        title="Record Fund Expense"
        footer={
          <button type="submit" form="record-expense-form-page" className={btnPrimary}>
            Record Expense
          </button>
        }
      >
        <RecordSocialFundExpenseForm
          initialFundId={expenseFundId}
          formId="record-expense-form-page"
          onSuccess={() => { setShowAddExpense(false); fetchAll(); }}
        />
      </SlideoverDrawer>
    </div>
  );
}
