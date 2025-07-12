import React from 'react';
import AddLoanForm from '../features/loans/AddLoanForm';

const Loans = () => (
  <div className="p-4">
    <h1 className="text-2xl font-bold mb-4">Loans</h1>
    {/* List of loans for user/role */}
    <div className="mb-4">[Loans List Here]</div>
    {/* Repay loan form for eligible roles */}
    <div className="mb-4">[Repay Loan Form Here]</div>
    <AddLoanForm />
  </div>
);

export default Loans; 