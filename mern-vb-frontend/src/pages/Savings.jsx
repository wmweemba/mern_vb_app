import React from 'react';
import AddSavingsForm from '../features/savings/AddSavingsForm';

const Savings = () => (
  <div className="p-4">
    <h1 className="text-2xl font-bold mb-4">Savings</h1>
    <AddSavingsForm />
    {/* Savings history table/list */}
    <div>[Savings History Here]</div>
  </div>
);

export default Savings; 