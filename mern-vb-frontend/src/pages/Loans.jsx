import React, { useEffect, useState } from 'react';
import AddLoanForm from '../features/loans/AddLoanForm';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';

const Loans = () => {
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => { fetchLoans(); }, []);

  const canAddLoan = ['admin', 'treasurer', 'loan_officer'].includes(user?.role);

  return (
    <div className="p-2 sm:p-4 w-full max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center sm:text-left">Loans</h1>
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
            <div className="w-full overflow-x-auto rounded shadow border bg-white">
              <table className="min-w-[700px] w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-1 sm:p-2 text-gray-700 dark:text-gray-200">Username</th>
                    <th className="p-1 sm:p-2 text-gray-700 dark:text-gray-200">Name</th>
                    <th className="p-1 sm:p-2 text-gray-700 dark:text-gray-200">Amount</th>
                    <th className="p-1 sm:p-2 text-gray-700 dark:text-gray-200">Duration</th>
                    <th className="p-1 sm:p-2 text-gray-700 dark:text-gray-200">Status</th>
                    <th className="p-1 sm:p-2 text-gray-700 dark:text-gray-200">Repayments</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map(loan => (
                    <tr key={loan._id} className="border-t align-top">
                      <td className="p-1 sm:p-2 whitespace-nowrap text-gray-900 dark:text-gray-100">{loan.userId?.username}</td>
                      <td className="p-1 sm:p-2 whitespace-nowrap text-gray-900 dark:text-gray-100">{loan.userId?.name}</td>
                      <td className="p-1 sm:p-2 text-right text-gray-900 dark:text-gray-100">K{Number(loan.amount).toLocaleString()}</td>
                      <td className="p-1 sm:p-2 text-center text-gray-900 dark:text-gray-100">{loan.durationMonths}</td>
                      <td className="p-1 sm:p-2 text-center text-gray-900 dark:text-gray-100">{loan.fullyPaid ? 'Paid' : 'Active'}</td>
                      <td className="p-1 sm:p-2">
                        <div className="overflow-x-auto">
                          <table className="min-w-[350px] w-full text-[11px] sm:text-xs border">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="p-1 text-gray-700 dark:text-gray-200">Month</th>
                                <th className="p-1 text-gray-700 dark:text-gray-200">Principal</th>
                                <th className="p-1 text-gray-700 dark:text-gray-200">Interest</th>
                                <th className="p-1 text-gray-700 dark:text-gray-200">Total</th>
                                <th className="p-1 text-gray-700 dark:text-gray-200">Paid</th>
                                <th className="p-1 text-gray-700 dark:text-gray-200">Payment Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {loan.installments.map(inst => (
                                <tr key={inst.month} className="border-t">
                                  <td className="p-1 text-center text-gray-900 dark:text-gray-100">{inst.month}</td>
                                  <td className="p-1 text-right text-gray-900 dark:text-gray-100">K{Number(inst.principal).toLocaleString()}</td>
                                  <td className="p-1 text-right text-gray-900 dark:text-gray-100">K{Number(inst.interest).toLocaleString()}</td>
                                  <td className="p-1 text-right text-gray-900 dark:text-gray-100">K{Number(inst.total).toLocaleString()}</td>
                                  <td className="p-1 text-center text-gray-900 dark:text-gray-100">{inst.paid ? 'Yes' : 'No'}</td>
                                  <td className="p-1 text-center text-gray-900 dark:text-gray-100">{inst.paymentDate ? new Date(inst.paymentDate).toLocaleDateString() : ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Loans; 