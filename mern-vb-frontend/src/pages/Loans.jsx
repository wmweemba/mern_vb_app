import React, { useEffect, useState } from 'react';
import AddLoanForm from '../features/loans/AddLoanForm';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { FaMoneyBillWave, FaCalendarAlt, FaCheckCircle, FaTimesCircle, FaInfoCircle } from "react-icons/fa";

import EditLoanForm from '../features/loans/EditLoanForm';

const Loans = () => {
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [editingLoan, setEditingLoan] = useState(null);
  const [reversing, setReversing] = useState({ loan: null, month: null });
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseError, setReverseError] = useState('');

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
    
    // Listen for loan data changes from payment modal
    const handleLoanDataChange = () => {
      fetchLoans(); // Refresh loan data when payments are made
    };
    
    window.addEventListener('loanDataChanged', handleLoanDataChange);
    
    return () => {
      window.removeEventListener('loanDataChanged', handleLoanDataChange);
    };
  }, []);

  const canAddLoan = ['admin', 'treasurer', 'loan_officer'].includes(user?.role);
  const canEditLoan = ['admin', 'treasurer', 'loan_officer'].includes(user?.role);

  return (
    <div className="p-2 sm:p-4 w-full max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center">Loans</h1>
      <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
        {canAddLoan && (
          <div className="w-full md:max-w-md lg:mx-0 lg:w-1/3">
            <AddLoanForm onSuccess={fetchLoans} />
          </div>
        )}
        <div className="w-full lg:w-2/3">
          <h2 className="text-lg font-semibold mb-2">Loans List</h2>
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-500">{error}</div>}
          {!loading && !error && (
            <Accordion type="single" collapsible>
              {loans.map((loan) => (
                <AccordionItem key={loan._id} value={loan._id}>
                  <AccordionTrigger>
                    <div className="flex items-center gap-2 w-full">
                      <FaMoneyBillWave className="text-blue-500" />
                      <span className="font-semibold">{loan.userId?.username}</span>
                      <span className="ml-auto text-green-700 font-bold">K{Number(loan.amount).toLocaleString()}</span>
                      <span className={`ml-2 px-2 py-1 rounded text-xs ${loan.fullyPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{loan.fullyPaid ? 'Paid' : 'Active'}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <FaCalendarAlt className="text-gray-500" />
                        <span>Duration: {loan.durationMonths} months</span>
                      </div>
                      <div>
                        <span className="font-semibold">Repayment Schedule:</span>
                        <div className="rounded shadow bg-gray-50 mt-1">
                          {loan.installments.map(inst => {
                            const paidAmount = inst.paidAmount || 0;
                            const remainingAmount = Math.max(0, (inst.total || 0) - paidAmount);
                            return (
                              <div key={inst.month} className="flex flex-wrap justify-between px-2 py-1 border-b last:border-b-0 text-xs items-center gap-2">
                                <span>Month {inst.month}</span>
                                <span>Principal: K{Number(inst.principal).toLocaleString()}</span>
                                <span>Interest: K{Number(inst.interest).toLocaleString()}</span>
                                <span>Total: K{Number(inst.total).toLocaleString()}</span>
                                <span className={inst.paid ? "text-green-600" : "text-red-600"}>
                                  {inst.paid ? <FaCheckCircle /> : <FaTimesCircle />}
                                </span>
                                <span className="ml-2 text-blue-700">Paid: K{Number(paidAmount).toLocaleString()}</span>
                                <span className="ml-2 text-orange-700">Remaining: K{Number(remainingAmount).toLocaleString()}</span>
                                {canEditLoan && inst.paid && (
                                  <button
                                    className="ml-2 px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                                    onClick={() => setReversing({ loan, month: inst.month })}
                                  >Reverse Payment</button>
                                )}
                              </div>
                            );
                          })}
      {/* Reverse Payment Dialog */}
      {reversing.loan && (
        <Dialog open={true} onOpenChange={() => setReversing({ loan: null, month: null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reverse Payment</DialogTitle>
            </DialogHeader>
            <div className="mb-2">Are you sure you want to reverse the payment for <strong>Month {reversing.month}</strong> on loan for <strong>{reversing.loan.userId?.username}</strong>?</div>
            {reverseError && <div className="text-red-500 text-sm mb-2">{reverseError}</div>}
            <DialogFooter>
              <button
                className="bg-red-600 text-white rounded px-4 py-2 mr-2"
                disabled={reverseLoading}
                onClick={async () => {
                  setReverseLoading(true);
                  setReverseError('');
                  try {
                    await axios.put(`${API_BASE_URL}/loans/${reversing.loan._id}/installments/${reversing.month}/reverse`);
                    setReversing({ loan: null, month: null });
                    fetchLoans();
                  } catch (err) {
                    setReverseError(err.response?.data?.error || 'Failed to reverse payment');
                  } finally {
                    setReverseLoading(false);
                  }
                }}
              >{reverseLoading ? 'Reversing...' : 'Confirm'}</button>
              <button
                className="bg-gray-300 text-gray-700 rounded px-4 py-2"
                onClick={() => setReversing({ loan: null, month: null })}
                disabled={reverseLoading}
              >Cancel</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
                        </div>
                      </div>
                      {canEditLoan && (
                        <button
                          className="mt-2 px-4 py-2 bg-yellow-500 text-white rounded shadow hover:bg-yellow-600 flex items-center gap-2"
                          onClick={() => setEditingLoan(loan)}
                        >
                          Edit Loan
                        </button>
                      )}
                      <Dialog>
                        <DialogTrigger asChild>
                          <button
                            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 flex items-center gap-2"
                            onClick={() => setSelectedLoan(loan)}
                          >
                            <FaInfoCircle /> View Details
                          </button>
                        </DialogTrigger>
                        {selectedLoan && selectedLoan._id === loan._id && (
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Loan Details</DialogTitle>
                            </DialogHeader>
                            <div className="flex flex-col gap-2">
                              <div><strong>User:</strong> {loan.userId?.name} ({loan.userId?.username})</div>
                              <div><strong>Amount:</strong> K{Number(loan.amount).toLocaleString()}</div>
                              <div><strong>Duration:</strong> {loan.durationMonths} months</div>
                              <div><strong>Status:</strong> {loan.fullyPaid ? 'Paid' : 'Active'}</div>
                              <div><strong>Notes:</strong> {loan.notes || 'N/A'}</div>
                              {/* Add more details as needed */}
                            </div>
                          </DialogContent>
                        )}
                      </Dialog>
                      {editingLoan && editingLoan._id === loan._id && (
                        <Dialog open={true} onOpenChange={() => setEditingLoan(null)}>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Loan</DialogTitle>
                            </DialogHeader>
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
        </div>
      </div>
    </div>
  );
};

export default Loans; 