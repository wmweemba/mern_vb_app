import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';

const EditLoanForm = ({ loan, onSuccess, onCancel }) => {
  const [form, setForm] = useState({
    amount: loan.amount,
    interestRate: loan.interestRate,
    durationMonths: loan.durationMonths,
    notes: loan.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      await axios.put(`${API_BASE_URL}/loans/${loan._id}`, form);
      setSuccess(true);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update loan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded shadow p-4 w-full max-w-md mx-auto flex flex-col gap-3">
      <h2 className="text-lg font-bold mb-2">Edit Loan</h2>
      
      <div className="flex flex-col gap-1">
        <label htmlFor="amount" className="text-sm font-medium text-gray-700">
          Loan Amount (K)
        </label>
        <input 
          id="amount"
          name="amount" 
          value={form.amount} 
          onChange={handleChange} 
          placeholder="Enter loan amount" 
          type="number" 
          min="0" 
          className="border rounded px-3 py-2" 
          required 
          disabled={loan.installments.some(inst => inst.paid)} 
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="interestRate" className="text-sm font-medium text-gray-700">
          Interest Rate (%)
        </label>
        <input 
          id="interestRate"
          name="interestRate" 
          value={form.interestRate} 
          onChange={handleChange} 
          placeholder="Enter interest rate" 
          type="number" 
          min="0" 
          step="0.01" 
          className="border rounded px-3 py-2" 
          required 
          disabled={loan.installments.some(inst => inst.paid)} 
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="durationMonths" className="text-sm font-medium text-gray-700">
          Duration (months)
        </label>
        <input 
          id="durationMonths"
          name="durationMonths" 
          value={form.durationMonths} 
          onChange={handleChange} 
          placeholder="Enter duration in months" 
          type="number" 
          min="1" 
          className="border rounded px-3 py-2" 
          required 
          disabled={loan.installments.some(inst => inst.paid)} 
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="notes" className="text-sm font-medium text-gray-700">
          Notes (optional)
        </label>
        <textarea 
          id="notes"
          name="notes" 
          value={form.notes} 
          onChange={handleChange} 
          placeholder="Add any additional notes..." 
          className="border rounded px-3 py-2 min-h-[80px]" 
        />
      </div>
      <div className="flex gap-2 mt-2">
        <button type="submit" className="bg-blue-600 text-white rounded py-2 px-4" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
        <button type="button" className="bg-gray-300 text-gray-700 rounded py-2 px-4" onClick={onCancel}>Cancel</button>
      </div>
      {success && <div className="text-green-600 text-sm mt-1">Loan updated successfully!</div>}
      {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
    </form>
  );
};

export default EditLoanForm;
