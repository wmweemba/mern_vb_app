import React, { useState } from 'react';
import { exportToExcel, exportToPDF } from '../lib/export';
import axios from 'axios';

const exportConfigs = [
  {
    label: 'Loans',
    endpoint: '/api/loans/export',
    excelName: 'loans.xlsx',
    pdfName: 'loans.pdf',
  },
  {
    label: 'Savings',
    endpoint: '/api/savings/export',
    excelName: 'savings.xlsx',
    pdfName: 'savings.pdf',
  },
  {
    label: 'Threshold Defaulters',
    endpoint: '/api/thresholds/defaulters/export',
    excelName: 'threshold-defaulters.xlsx',
    pdfName: 'threshold-defaulters.pdf',
  },
];

const Reports = () => {
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const handleExport = async (config, type) => {
    setLoading(`${config.label}-${type}`);
    setError('');
    try {
      const res = await axios.get(config.endpoint);
      let data = res.data;
      // If backend returns CSV, parse to array of objects
      if (typeof data === 'string' && data.includes(',')) {
        const [header, ...rows] = data.trim().split('\n');
        const keys = header.split(',');
        data = rows.map(row => {
          const values = row.split(',');
          return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
        });
      }
      if (type === 'excel') exportToExcel(data, config.excelName);
      else exportToPDF(data, config.pdfName);
    } catch (err) {
      setError(`Failed to export ${config.label}`);
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Reports</h1>
      {exportConfigs.map(config => (
        <div key={config.label} className="mb-4 flex gap-2 items-center">
          <span className="font-semibold w-48">{config.label}</span>
          <button
            className="bg-[#2979FF] text-white px-3 py-1 rounded"
            onClick={() => handleExport(config, 'excel')}
            disabled={loading}
          >
            Export Excel
          </button>
          <button
            className="bg-[#4CAF50] text-white px-3 py-1 rounded"
            onClick={() => handleExport(config, 'pdf')}
            disabled={loading}
          >
            Export PDF
          </button>
          {loading === `${config.label}-excel` && <span className="ml-2 text-xs">Exporting Excel...</span>}
          {loading === `${config.label}-pdf` && <span className="ml-2 text-xs">Exporting PDF...</span>}
        </div>
      ))}
      {error && <div className="text-red-500 mt-2">{error}</div>}
    </div>
  );
};

export default Reports; 