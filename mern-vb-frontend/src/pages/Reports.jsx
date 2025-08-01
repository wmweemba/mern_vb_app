import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportToExcel } from '../lib/export';
import axios from 'axios';
import { API_BASE_URL } from '../lib/utils';

// Helper to download Excel/CSV from backend
async function downloadExcelReport(endpoint, filename) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) throw new Error('Failed to download Excel');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error downloading Excel: ' + err.message);
  }
}

// Frontend PDF generator for transactions
const generateTransactionPDF = async (filename) => {
  try {
    const token = localStorage.getItem('token');
    const res = await axios.get(`${API_BASE_URL}/transactions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const transactions = res.data;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Transactions Report', 105, 15, { align: 'center' });

    const tableData = transactions.map(t => ([
      t.userId?.username || '',
      t.userId?.name || '',
      t.type,
      `K${Number(t.amount).toLocaleString()}`,
      t.note || '',
      new Date(t.createdAt).toLocaleDateString(),
    ]));

    autoTable(doc, {
      startY: 25,
      head: [['Username', 'Name', 'Type', 'Amount', 'Note', 'Date']],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [33, 150, 243] },
    });

    doc.save(filename);
  } catch (err) {
    alert('Error generating PDF: ' + err.message);
  }
};

const exportConfigs = [
  {
    label: 'Loans',
    endpoint: `${API_BASE_URL}/loans/export`,
    excelName: 'loans.xlsx',
    pdfName: 'loans_report.pdf',
    viewEndpoint: `${API_BASE_URL}/loans`,
    columns: [
      { key: 'userId.username', label: 'Username' },
      { key: 'userId.name', label: 'Name' },
      { key: 'amount', label: 'Amount' },
      { key: 'durationMonths', label: 'Duration' },
      { key: 'fullyPaid', label: 'Status' },
    ],
  },
  {
    label: 'Savings',
    endpoint: `${API_BASE_URL}/savings/export`,
    excelName: 'savings.xlsx',
    pdfName: 'savings_report.pdf',
    viewEndpoint: `${API_BASE_URL}/savings`,
    columns: [
      { key: 'userId.username', label: 'Username' },
      { key: 'userId.name', label: 'Name' },
      { key: 'amount', label: 'Amount' },
      { key: 'month', label: 'Month' },
      { key: 'date', label: 'Date' },
    ],
  },
  {
    label: 'Transactions',
    endpoint: `${API_BASE_URL}/transactions/export`,
    excelName: 'transactions_report.csv',
    pdfName: 'transactions_report.pdf',
    viewEndpoint: `${API_BASE_URL}/transactions`,
    columns: [
      { key: 'userId.username', label: 'Username' },
      { key: 'userId.name', label: 'Name' },
      { key: 'type', label: 'Type' },
      { key: 'amount', label: 'Amount' },
      { key: 'note', label: 'Note' },
      { key: 'createdAt', label: 'Date' },
    ],
    transform: (data) => data.map(t => ({
      ...t,
      createdAt: t.createdAt ? t.createdAt.split('T')[0] : '',
    })),
  },
];

function getValue(obj, path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : ''), obj);
}

const ReportModal = ({ open, onClose, data, columns, title }) => {
  const [page, setPage] = React.useState(0);
  const pageSize = 15;
  React.useEffect(() => { setPage(0); }, [data, open]);
  const pageCount = Math.ceil(data.length / pageSize);
  const pagedData = data.slice(page * pageSize, (page + 1) * pageSize);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded shadow-lg p-6 w-full max-w-2xl relative">
        <button className="absolute top-2 right-2 text-gray-500" onClick={onClose}>&times;</button>
        <h2 className="text-lg font-bold mb-4">{title} Report</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border rounded text-xs sm:text-sm">
            <thead>
              <tr className="bg-gray-100">
                {columns.map(col => (
                  <th key={col.key} className="p-2">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedData.map((row, i) => (
                <tr key={i} className="border-t">
                  {columns.map(col => (
                    <td key={col.key} className="p-2 whitespace-nowrap">{getValue(row, col.key)}</td>
                  ))}
                </tr>
              ))}
              {pagedData.length === 0 && (
                <tr><td colSpan={columns.length} className="text-center p-4">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mt-4">
          <button
            className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >Previous</button>
          <span className="text-xs">Page {page + 1} of {pageCount}</span>
          <button
            className="px-3 py-1 rounded bg-gray-200 disabled:opacity-50"
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >Next</button>
        </div>
      </div>
    </div>
  );
};

const Reports = () => {
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [modalColumns, setModalColumns] = useState([]);
  const [modalTitle, setModalTitle] = useState('');

  const handleExport = async (config, type) => {
    setLoading(`${config.label}-${type}`);
    setError('');
    try {
      if (config.label === 'Transactions') {
        if (type === 'excel') {
          await downloadExcelReport(config.endpoint, config.excelName);
        } else if (type === 'pdf') {
          await generateTransactionPDF(config.pdfName);
        }
        return;
      }
      const res = await axios.get(config.endpoint);
      let data = res.data;
      if (typeof data === 'string' && data.includes(',')) {
        const [header, ...rows] = data.trim().split('\n');
        const keys = header.split(',');
        data = rows.map(row => {
          const values = row.split(',');
          return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
        });
      }
      if (type === 'excel') exportToExcel(data, config.excelName);
      // You can add PDF logic for Loans and Savings here if needed
    } catch (err) {
      setError(`Failed to export ${config.label}`);
    } finally {
      setLoading('');
    }
  };

  const handleViewReport = async (config) => {
    setLoading(`${config.label}-view`);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(config.viewEndpoint, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load report');
      let data = await res.json();
      if (config.transform) data = config.transform(data);
      setModalData(data);
      setModalColumns(config.columns);
      setModalTitle(config.label);
      setModalOpen(true);
    } catch (err) {
      setError(`Failed to load ${config.label} report`);
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="p-4 w-full max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center">Reports</h1>
      {exportConfigs.map(config => (
        <div key={config.label} className="mb-8">
          <div className="font-semibold mb-2 text-center">{config.label}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mx-auto w-[90%] sm:w-[80%]">
            <button
              className="bg-[#2979FF] text-white rounded px-4 py-2 font-medium shadow w-full"
              onClick={() => handleExport(config, 'excel')}
              disabled={loading}
            >
              Export Excel
            </button>
            <button
              className="bg-[#4CAF50] text-white rounded px-4 py-2 font-medium shadow w-full"
              onClick={() => handleExport(config, 'pdf')}
              disabled={loading}
            >
              Download PDF
            </button>
            <button
              className="bg-[#6C63FF] text-white rounded px-4 py-2 font-medium shadow w-full"
              onClick={() => handleViewReport(config)}
              disabled={loading}
            >
              Generate & View Report
            </button>
          </div>
          <div className="mt-1 min-h-[20px] text-center">
            {loading === `${config.label}-excel` && <span className="text-xs">Exporting Excel...</span>}
            {loading === `${config.label}-pdf` && <span className="text-xs">Downloading PDF...</span>}
            {loading === `${config.label}-view` && <span className="text-xs">Loading...</span>}
          </div>
        </div>
      ))}
      {error && <div className="text-red-500 mt-2 text-center">{error}</div>}
      <ReportModal open={modalOpen} onClose={() => setModalOpen(false)} data={modalData} columns={modalColumns} title={modalTitle} />
    </div>
  );
};

export default Reports;




