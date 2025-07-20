import React, { useEffect, useState } from 'react';
import AddLoanForm from '../features/loans/AddLoanForm';
import axios from 'axios';

const Loans = () => {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLoans = async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get('/api/loans');
      setLoans(res.data);
    } catch (err) {
      setError('Failed to load loans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLoans(); }, []);

  return (
    <div className="p-2 sm:p-4 w-full max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center sm:text-left">Loans</h1>
      <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
        <div className="w-full md:max-w-md lg:mx-0 lg:w-1/3">
          <AddLoanForm onSuccess={fetchLoans} />
        </div>
        <div className="w-full lg:w-2/3">
          <h2 className="text-lg font-semibold mb-2">Loans List</h2>
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-500">{error}</div>}
          {!loading && !error && (
            <div className="w-full overflow-x-auto rounded shadow border bg-white">
              <table className="min-w-[700px] w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-1 sm:p-2">Username</th>
                    <th className="p-1 sm:p-2">Name</th>
                    <th className="p-1 sm:p-2">Amount</th>
                    <th className="p-1 sm:p-2">Duration</th>
                    <th className="p-1 sm:p-2">Status</th>
                    <th className="p-1 sm:p-2">Repayments</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map(loan => (
                    <tr key={loan._id} className="border-t align-top">
                      <td className="p-1 sm:p-2 whitespace-nowrap">{loan.userId?.username}</td>
                      <td className="p-1 sm:p-2 whitespace-nowrap">{loan.userId?.name}</td>
                      <td className="p-1 sm:p-2 text-right">K{Number(loan.amount).toLocaleString()}</td>
                      <td className="p-1 sm:p-2 text-center">{loan.durationMonths}</td>
                      <td className="p-1 sm:p-2 text-center">{loan.fullyPaid ? 'Paid' : 'Active'}</td>
                      <td className="p-1 sm:p-2">
                        <div className="overflow-x-auto">
                          <table className="min-w-[350px] w-full text-[11px] sm:text-xs border">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="p-1">Month</th>
                                <th className="p-1">Principal</th>
                                <th className="p-1">Interest</th>
                                <th className="p-1">Total</th>
                                <th className="p-1">Paid</th>
                                <th className="p-1">Payment Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {loan.installments.map(inst => (
                                <tr key={inst.month} className="border-t">
                                  <td className="p-1 text-center">{inst.month}</td>
                                  <td className="p-1 text-right">K{Number(inst.principal).toLocaleString()}</td>
                                  <td className="p-1 text-right">K{Number(inst.interest).toLocaleString()}</td>
                                  <td className="p-1 text-right">K{Number(inst.total).toLocaleString()}</td>
                                  <td className="p-1 text-center">{inst.paid ? 'Yes' : 'No'}</td>
                                  <td className="p-1 text-center">{inst.paymentDate ? new Date(inst.paymentDate).toLocaleDateString() : ''}</td>
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