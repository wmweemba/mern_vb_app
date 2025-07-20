import React, { useEffect, useState } from 'react';
import AddSavingsForm from '../features/savings/AddSavingsForm';
import axios from 'axios';

const Savings = () => {
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSavings = async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get('/api/savings');
      setSavings(res.data);
    } catch (err) {
      setError('Failed to load savings history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSavings(); }, []);

  return (
    <div className="p-2 sm:p-4 w-full max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center sm:text-left">Savings</h1>
      <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
        <div className="w-full md:max-w-md lg:mx-0 lg:w-1/3">
          <AddSavingsForm onSuccess={fetchSavings} />
        </div>
        <div className="w-full lg:w-2/3">
          <h2 className="text-lg font-semibold mb-2">Savings History</h2>
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-500">{error}</div>}
          {!loading && !error && (
            <div className="w-full overflow-x-auto rounded shadow border bg-white">
              <table className="min-w-[600px] w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-1 sm:p-2">Username</th>
                    <th className="p-1 sm:p-2">Name</th>
                    <th className="p-1 sm:p-2">Month</th>
                    <th className="p-1 sm:p-2">Amount</th>
                    <th className="p-1 sm:p-2">Date</th>
                    <th className="p-1 sm:p-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {savings.map(s => (
                    <tr key={s._id} className="border-t">
                      <td className="p-1 sm:p-2 whitespace-nowrap">{s.userId?.username}</td>
                      <td className="p-1 sm:p-2 whitespace-nowrap">{s.userId?.name}</td>
                      <td className="p-1 sm:p-2 text-center">{s.month}</td>
                      <td className="p-1 sm:p-2 text-right">K{Number(s.amount).toLocaleString()}</td>
                      <td className="p-1 sm:p-2 whitespace-nowrap">{s.date ? new Date(s.date).toLocaleDateString() : ''}</td>
                      <td className="p-1 sm:p-2">{s.notes || ''}</td>
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

export default Savings; 