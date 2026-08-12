import React, { useEffect, useState, useRef } from 'react';
import AddLoanForm from '../features/loans/AddLoanForm';
import EditLoanForm from '../features/loans/EditLoanForm';
import SlideoverDrawer from '../components/ui/SlideoverDrawer';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { FaMoneyBillWave, FaCalendarAlt, FaCheckCircle, FaTimesCircle, FaInfoCircle } from 'react-icons/fa';

const btnPrimary = 'bg-brand-primary hover:bg-brand-hover text-white font-semibold rounded-md w-full py-3 text-sm transition-colors';

const StatusBadge = ({ fullyPaid }) => fullyPaid
  ? <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase bg-status-paid-bg text-status-paid-text">Paid</span>
  : <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase bg-status-pending-bg text-status-pending-text">Active</span>;

const ENTRY_LABEL = {
  disbursement: 'Disbursed',
  accrual: 'Interest accrued',
  capitalisation: 'Interest capitalised',
  interest_payment: 'Interest paid',
  principal_payment: 'Principal paid',
};

// Revolving loans have no installment schedule — a running ledger of entries is the
// single source of truth (docs/plan_configurable_group_rules.md Phase 2).
const RevolvingLedger = ({ loan }) => {
  const principalBalance = loan.principalBalance || 0;
  const interestOutstanding = loan.interestOutstanding || 0;
  const entries = [...(loan.entries || [])].sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">Ledger</p>
        <p className="text-xs text-text-secondary">
          Outstanding: <span className="font-semibold text-text-primary">K{(principalBalance + interestOutstanding).toLocaleString()}</span>
        </p>
      </div>
      <div className="flex gap-3 mb-2 text-xs">
        <span className="text-text-secondary">Principal: <span className="font-semibold text-text-primary">K{principalBalance.toLocaleString()}</span></span>
        <span className="text-text-secondary">Interest owed: <span className="font-semibold text-text-primary">K{interestOutstanding.toLocaleString()}</span></span>
      </div>
      <div className="rounded-md border border-border-default overflow-hidden">
        {entries.length === 0 && (
          <div className="px-3 py-2 text-xs text-text-secondary bg-surface-card">No entries yet</div>
        )}
        {entries.map((entry, idx) => (
          <div key={idx} className="flex flex-wrap justify-between px-3 py-2 border-b border-border-default last:border-b-0 text-xs items-center gap-x-3 gap-y-1 bg-surface-card">
            <span className="font-medium text-text-primary">{ENTRY_LABEL[entry.type] || entry.type}</span>
            {entry.periodLabel && <span className="text-text-secondary">{entry.periodLabel}</span>}
            <span className="text-text-secondary">{new Date(entry.date).toLocaleDateString()}</span>
            <span className="font-semibold text-text-primary">K{Number(entry.amount).toLocaleString()}</span>
            <span className="w-full text-text-secondary">
              Balance after — Principal: K{Number(entry.principalAfter || 0).toLocaleString()}, Interest: K{Number(entry.interestAfter || 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const Loans = () => {
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [editingLoan, setEditingLoan] = useState(null);
  const [reversing, setReversing] = useState({ loan: null, month: null });
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseError, setReverseError] = useState('');
  const [deletingLoan, setDeletingLoan] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [monthEndPreview, setMonthEndPreview] = useState(null);
  const [monthEndLoading, setMonthEndLoading] = useState(false);
  const [monthEndError, setMonthEndError] = useState('');
  const [monthEndResult, setMonthEndResult] = useState(null);
  const accordionRefs = useRef({});

  const fetchLoans = async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/loans`);
      setLoans(res.data);
    } catch (err) {
      setError('Failed to load loans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoans();
    const handleLoanDataChange = () => fetchLoans();
    window.addEventListener('loanDataChanged', handleLoanDataChange);
    return () => window.removeEventListener('loanDataChanged', handleLoanDataChange);
  }, []);

  const canAddLoan = ['admin', 'treasurer', 'loan_officer'].includes(user?.role);
  const canEditLoan = ['admin', 'treasurer', 'loan_officer'].includes(user?.role);
  const canRunMonthEnd = ['admin', 'treasurer'].includes(user?.role);
  const hasRevolvingLoans = loans.some(l => l.accrualMode === 'revolving');

  const handleAccordionChange = (value) => {
    if (value && accordionRefs.current[value]) {
      setTimeout(() => {
        accordionRefs.current[value].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  const openMonthEndPreview = async () => {
    setMonthEndError(''); setMonthEndResult(null); setMonthEndLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/loans/accrue-month-end/preview`);
      setMonthEndPreview(res.data);
    } catch (err) {
      setMonthEndError(err.response?.data?.error || 'Failed to load preview');
      setMonthEndPreview({ loans: [] });
    } finally {
      setMonthEndLoading(false);
    }
  };

  const confirmMonthEnd = async () => {
    setMonthEndLoading(true); setMonthEndError('');
    try {
      const res = await axios.post(`${API_BASE_URL}/loans/accrue-month-end`, { periodLabel: monthEndPreview?.periodLabel });
      setMonthEndResult(res.data);
      fetchLoans();
    } catch (err) {
      setMonthEndError(err.response?.data?.error || 'Failed to run month-end interest');
    } finally {
      setMonthEndLoading(false);
    }
  };

  return (
    <div className="py-4 w-full max-w-2xl mx-auto mobile-safe-bottom px-0">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-text-primary">Loans</h1>
        <div className="flex items-center gap-2">
          {canRunMonthEnd && hasRevolvingLoans && (
            <button
              onClick={openMonthEndPreview}
              className="border border-border-default text-text-primary text-sm font-medium rounded-full px-4 py-2 hover:bg-surface-page transition-colors"
            >
              Run Month-End Interest
            </button>
          )}
          {canAddLoan && (
            <button
              onClick={() => setShowAddLoan(true)}
              className="bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full px-4 py-2 transition-colors"
            >
              + Add Loan
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-text-secondary text-sm">Loading...</div>}
      {error && <div className="text-status-overdue-text text-sm">{error}</div>}

      {!loading && !error && (
        <Accordion type="single" collapsible onValueChange={handleAccordionChange}>
          {loans.map((loan) => (
            <AccordionItem
              key={loan._id}
              value={loan._id}
              ref={(el) => accordionRefs.current[loan._id] = el}
              className="scroll-mt-4 bg-surface-card rounded-lg mb-2 border border-border-default px-4"
            >
              <AccordionTrigger className="py-4">
                <div className="flex items-center gap-2 w-full">
                  <FaMoneyBillWave className="text-text-secondary flex-shrink-0" />
                  <span className="font-semibold text-text-primary">{loan.userId?.name}</span>
                  <span className="ml-auto font-bold text-text-primary">
                    K{Number(loan.accrualMode === 'revolving' ? (loan.principalBalance || 0) + (loan.interestOutstanding || 0) : loan.amount).toLocaleString()}
                  </span>
                  <StatusBadge fullyPaid={loan.fullyPaid} />
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-3 pb-3">
                  {loan.accrualMode !== 'revolving' && (
                    <div className="flex items-center gap-2 text-sm text-text-secondary">
                      <FaCalendarAlt />
                      <span>Duration: {loan.durationMonths} months</span>
                    </div>
                  )}
                  {loan.accrualMode === 'revolving' ? (
                    <RevolvingLedger loan={loan} />
                  ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">Repayment Schedule</p>
                      <p className="text-xs text-text-secondary">Loan Amount: <span className="font-semibold text-text-primary">K{Number(loan.amount).toLocaleString()}</span></p>
                    </div>
                    <div className="rounded-md border border-border-default overflow-hidden">
                      {(() => {
                        let runningBalance = loan.amount;
                        return loan.installments.map(inst => {
                          const paidAmount = inst.paidAmount || 0;
                          const isPartial = paidAmount > 0 && !inst.paid;
                          const interestPaid = isPartial && paidAmount >= inst.interest;
                          const principalRemaining = isPartial
                            ? Math.max(0, inst.principal - Math.max(0, paidAmount - inst.interest))
                            : 0;
                          runningBalance -= inst.principal;
                          const outstandingBalance = Math.max(0, runningBalance);
                          return (
                            <div key={inst.month} className="flex flex-wrap justify-between px-3 py-2 border-b border-border-default last:border-b-0 text-xs items-center gap-x-3 gap-y-1 bg-surface-card">
                              <span className="font-medium text-text-primary">Month {inst.month}</span>
                              <span className="text-text-secondary">P: K{Number(inst.principal).toLocaleString()}</span>
                              <span className="text-text-secondary">Int: K{Number(inst.interest).toLocaleString()}</span>
                              <span className="font-semibold text-text-primary">Total: K{Number(inst.total).toLocaleString()}</span>
                              <span className={inst.paid ? 'text-status-paid-text' : 'text-status-overdue-text'}>
                                {inst.paid ? <FaCheckCircle /> : <FaTimesCircle />}
                              </span>
                              <span className="text-amount-positive font-semibold">Paid: K{Number(paidAmount).toLocaleString()}</span>
                              <span className="font-semibold text-text-primary">Bal: K{outstandingBalance.toLocaleString()}</span>
                              {isPartial && (
                                <span className="w-full text-status-pending-text mt-0.5">
                                  Interest: {interestPaid ? 'Paid ✓' : `K${Number(paidAmount).toLocaleString()} paid`}
                                  {' | '}
                                  Principal: K{Number(principalRemaining).toLocaleString()} remaining
                                </span>
                              )}
                              {canEditLoan && inst.paid && (
                                <button
                                  className="px-2 py-1 bg-status-overdue-bg border border-status-overdue-text text-status-overdue-text rounded text-xs hover:opacity-80 transition-opacity"
                                  onClick={() => setReversing({ loan, month: inst.month })}
                                >Reverse</button>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {canEditLoan && (
                      <button
                        className="px-3 py-1.5 border border-border-default text-text-primary text-xs font-medium rounded-full hover:bg-surface-page transition-colors"
                        onClick={() => setEditingLoan(loan)}
                      >
                        Edit Loan
                      </button>
                    )}
                    {canEditLoan && !loan.fullyPaid && (
                      <button
                        className="px-3 py-1.5 bg-status-overdue-bg border border-status-overdue-text text-status-overdue-text text-xs font-medium rounded-full hover:opacity-80 transition-opacity"
                        onClick={() => { setDeletingLoan(loan); setDeleteError(''); }}
                      >
                        Delete Loan
                      </button>
                    )}
                    <Dialog>
                      <DialogTrigger asChild>
                        <button
                          className="px-3 py-1.5 border border-border-default text-text-secondary text-xs font-medium rounded-full hover:bg-surface-page transition-colors flex items-center gap-1"
                          onClick={() => setSelectedLoan(loan)}
                        >
                          <FaInfoCircle /> Details
                        </button>
                      </DialogTrigger>
                      {selectedLoan && selectedLoan._id === loan._id && (
                        <DialogContent>
                          <DialogHeader><DialogTitle>Loan Details</DialogTitle></DialogHeader>
                          <div className="flex flex-col gap-2 text-sm">
                            <div><strong>Member:</strong> {loan.userId?.name}</div>
                            {loan.accrualMode === 'revolving' ? (
                              <>
                                <div><strong>Outstanding:</strong> K{((loan.principalBalance || 0) + (loan.interestOutstanding || 0)).toLocaleString()}</div>
                                <div><strong>Principal:</strong> K{(loan.principalBalance || 0).toLocaleString()}</div>
                                <div><strong>Interest owed:</strong> K{(loan.interestOutstanding || 0).toLocaleString()}</div>
                              </>
                            ) : (
                              <>
                                <div><strong>Amount:</strong> K{Number(loan.amount).toLocaleString()}</div>
                                <div><strong>Duration:</strong> {loan.durationMonths} months</div>
                              </>
                            )}
                            <div><strong>Status:</strong> {loan.fullyPaid ? 'Paid' : 'Active'}</div>
                            <div><strong>Notes:</strong> {loan.notes || 'N/A'}</div>
                          </div>
                        </DialogContent>
                      )}
                    </Dialog>
                  </div>

                  {/* Edit Loan Dialog */}
                  {editingLoan && editingLoan._id === loan._id && (
                    <Dialog open={true} onOpenChange={() => setEditingLoan(null)}>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Edit Loan</DialogTitle></DialogHeader>
                        <EditLoanForm
                          loan={editingLoan}
                          onSuccess={() => { setEditingLoan(null); fetchLoans(); }}
                          onCancel={() => setEditingLoan(null)}
                        />
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Reverse Payment Dialog */}
      {reversing.loan && (
        <Dialog open={true} onOpenChange={() => setReversing({ loan: null, month: null })}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reverse Payment</DialogTitle></DialogHeader>
            <div className="mb-2 text-sm">Are you sure you want to reverse the payment for <strong>Month {reversing.month}</strong> on loan for <strong>{reversing.loan.userId?.name}</strong>?</div>
            {reverseError && <div className="text-status-overdue-text text-sm mb-2">{reverseError}</div>}
            <DialogFooter>
              <button
                className="bg-status-overdue-bg border border-status-overdue-text text-status-overdue-text rounded-full px-4 py-2 text-sm font-medium mr-2 disabled:opacity-50"
                disabled={reverseLoading}
                onClick={async () => {
                  setReverseLoading(true); setReverseError('');
                  try {
                    await axios.put(`${API_BASE_URL}/loans/${reversing.loan._id}/installments/${reversing.month}/reverse`);
                    setReversing({ loan: null, month: null });
                    fetchLoans();
                  } catch (err) {
                    setReverseError(err.response?.data?.error || 'Failed to reverse payment');
                  } finally { setReverseLoading(false); }
                }}
              >{reverseLoading ? 'Reversing...' : 'Confirm Reversal'}</button>
              <button
                className="border border-border-default text-text-primary rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50"
                onClick={() => setReversing({ loan: null, month: null })}
                disabled={reverseLoading}
              >Cancel</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Loan Dialog */}
      {deletingLoan && (
        <Dialog open={true} onOpenChange={() => { setDeletingLoan(null); setDeleteError(''); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Loan</DialogTitle></DialogHeader>
            <div className="mb-2 text-sm">Are you sure you want to <strong>permanently delete</strong> the loan for <strong>{deletingLoan.userId?.name}</strong> (K{Number(deletingLoan.amount).toLocaleString()})?</div>
            <div className="text-xs text-text-secondary mb-2">The disbursed amount will be restored to the bank balance. This cannot be undone.</div>
            {deleteError && <div className="text-status-overdue-text text-sm mb-2">{deleteError}</div>}
            <DialogFooter>
              <button
                className="bg-status-overdue-bg border border-status-overdue-text text-status-overdue-text rounded-full px-4 py-2 text-sm font-medium mr-2 disabled:opacity-50"
                disabled={deleteLoading}
                onClick={async () => {
                  setDeleteLoading(true); setDeleteError('');
                  try {
                    await axios.delete(`${API_BASE_URL}/loans/${deletingLoan._id}`);
                    setDeletingLoan(null);
                    fetchLoans();
                  } catch (err) {
                    setDeleteError(err.response?.data?.error || 'Failed to delete loan');
                  } finally { setDeleteLoading(false); }
                }}
              >{deleteLoading ? 'Deleting...' : 'Delete Loan'}</button>
              <button
                className="border border-border-default text-text-primary rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50"
                onClick={() => { setDeletingLoan(null); setDeleteError(''); }}
                disabled={deleteLoading}
              >Cancel</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Loan Drawer */}
      <SlideoverDrawer
        open={showAddLoan}
        onClose={() => setShowAddLoan(false)}
        title="Add Loan"
        footer={
          <button type="submit" form="add-loan-form" className={btnPrimary}>
            Add Loan
          </button>
        }
      >
        <AddLoanForm
          formId="add-loan-form"
          onSuccess={() => { setShowAddLoan(false); fetchLoans(); }}
        />
      </SlideoverDrawer>

      {/* Run Month-End Interest — confirmation modal (UI_SPEC.md §6.18) */}
      {monthEndPreview && (
        <Dialog open={true} onOpenChange={() => { setMonthEndPreview(null); setMonthEndResult(null); setMonthEndError(''); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Run Month-End Interest — {monthEndPreview.periodLabel}</DialogTitle></DialogHeader>
            {monthEndResult ? (
              <div className="text-sm text-text-primary">
                Done. Accrued {monthEndResult.accruedCount} loan(s), totalling K{Number(monthEndResult.totalInterest).toLocaleString()} in new interest.
                {monthEndResult.skippedCount > 0 && ` ${monthEndResult.skippedCount} loan(s) already accrued for this period were skipped.`}
              </div>
            ) : (
              <>
                <div className="text-sm text-text-secondary mb-2">
                  This will charge {monthEndPreview.rate}% interest on every open revolving loan not yet accrued for {monthEndPreview.periodLabel}. This cannot be undone.
                </div>
                <div className="rounded-md border border-border-default overflow-hidden max-h-64 overflow-y-auto">
                  {monthEndPreview.loans.length === 0 && (
                    <div className="px-3 py-2 text-xs text-text-secondary bg-surface-card">No open revolving loans.</div>
                  )}
                  {monthEndPreview.loans.map(row => (
                    <div key={row.loanId} className="flex justify-between px-3 py-2 border-b border-border-default last:border-b-0 text-xs bg-surface-card">
                      <span className="text-text-primary">{row.member}</span>
                      {row.alreadyAccrued ? (
                        <span className="text-text-secondary">Already accrued</span>
                      ) : (
                        <span className="font-semibold text-text-primary">
                          +K{Number(row.interestCharge).toLocaleString()}{row.willCapitalise ? ` (capitalises K${Number(row.capitalisedAmount).toLocaleString()})` : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="text-sm font-semibold text-text-primary mt-2">
                  Total: K{Number(monthEndPreview.totalInterest).toLocaleString()} across {monthEndPreview.count} loan(s)
                </div>
              </>
            )}
            {monthEndError && <div className="text-status-overdue-text text-sm mt-2">{monthEndError}</div>}
            <DialogFooter>
              {monthEndResult ? (
                <button
                  className="bg-brand-primary hover:bg-brand-hover text-white rounded-full px-4 py-2 text-sm font-semibold"
                  onClick={() => { setMonthEndPreview(null); setMonthEndResult(null); }}
                >Close</button>
              ) : (
                <>
                  <button
                    className="bg-brand-primary hover:bg-brand-hover text-white rounded-full px-4 py-2 text-sm font-semibold mr-2 disabled:opacity-50"
                    disabled={monthEndLoading || monthEndPreview.count === 0}
                    onClick={confirmMonthEnd}
                  >{monthEndLoading ? 'Running…' : `Charge Interest (${monthEndPreview.count})`}</button>
                  <button
                    className="border border-border-default text-text-primary rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50"
                    onClick={() => setMonthEndPreview(null)}
                    disabled={monthEndLoading}
                  >Cancel</button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Loans;
