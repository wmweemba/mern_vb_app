import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardHeader, CardTitle, CardContent } from './card';

const BankBalanceCard = () => {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get('/api/transactions');
        // Compute balance: sum all credits - debits (assuming type and amount fields)
        // For this example, assume all 'amount' are positive and type is 'loan', 'saving', or 'fine'
        let total = 0;
        for (const tx of res.data) {
          if (tx.type === 'saving') total += tx.amount;
          if (tx.type === 'loan') total -= tx.amount;
          if (tx.type === 'fine') total += tx.amount;
        }
        setBalance(total);
      } catch (err) {
        setError('Failed to load bank balance');
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
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