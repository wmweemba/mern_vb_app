import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardHeader, CardTitle, CardContent } from './card';

const BankBalanceCard = () => {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBalance = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get('/api/bank-balance');
        setBalance(res.data.balance);
      } catch (err) {
        setError('Failed to load bank balance');
      } finally {
        setLoading(false);
      }
    };
    fetchBalance();
  }, []);

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Bank Balance</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <div>Loading...</div>}
        {error && <div className="text-red-500">{error}</div>}
        {balance !== null && !loading && !error && (
          <div className="text-3xl font-bold text-[#2979FF]">K{balance.toLocaleString()}</div>
        )}
      </CardContent>
    </Card>
  );
};

export default BankBalanceCard; 