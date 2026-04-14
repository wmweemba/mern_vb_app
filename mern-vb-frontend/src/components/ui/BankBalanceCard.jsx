import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';

const BankBalanceCard = () => {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBalance = async () => {
      setLoading(true); setError(null);
      try {
        const res = await axios.get(`${API_BASE_URL}/bank-balance`);
        setBalance(res.data.balance);
      } catch {
        setError('Failed to load bank balance');
      } finally {
        setLoading(false);
      }
    };
    fetchBalance();
  }, []);

  return (
    <div className="bg-surface-dark rounded-xl p-5 mb-4">
      <p className="text-xs font-medium uppercase tracking-widest text-text-on-dark-muted mb-2">
        Total Group Balance
      </p>
      {loading && <p className="text-white text-sm">Loading...</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
      {balance !== null && !loading && !error && (
        <p className="text-4xl font-bold text-white leading-tight">
          K{balance.toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default BankBalanceCard;
