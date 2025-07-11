import React from 'react';
import BankBalanceCard from '../components/ui/BankBalanceCard';

const Dashboard = ({ title }) => (
  <div className="p-4">
    <h1 className="text-2xl font-bold mb-4">{title || 'Dashboard'}</h1>
    <div className="mb-4">
      <BankBalanceCard />
    </div>
    {/* Reports summary or quick links */}
    <div>[Reports Summary/Links Here]</div>
  </div>
);

export default Dashboard; 