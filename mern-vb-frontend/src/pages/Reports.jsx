import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportToExcel } from '../lib/export';
import axios from 'axios';
import { API_BASE_URL } from '../lib/utils';
import ReportSelectionModal from '../components/ui/ReportSelectionModal';
import FinesModal from '../components/ui/FinesModal';
import { useAuth } from '../store/auth';

// Helper to download Excel from backend — uses axios so Clerk token is auto-attached
async function downloadExcelReport(endpoint, filename) {
  try {
    const res = await axios.get(endpoint, { responseType: 'blob' });
    const url = window.URL.createObjectURL(res.data);
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
    const res = await axios.get(`${API_BASE_URL}/transactions`);
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

const generateLoansPDF = async (filename) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/loans`);
    const loans = res.data;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Loans Report', 105, 15, { align: 'center' });

    // Flatten loan data for table display - using same pattern as transactions
    const tableData = [];
    loans.forEach(loan => {
      loan.installments.forEach(installment => {
        tableData.push([
          loan.userId?.username || '',
          loan.userId?.name || '',
          `K${Number(loan.amount).toLocaleString()}`,
          loan.durationMonths,
          installment.month,
          `K${Number(installment.principal).toLocaleString()}`,
          `K${Number(installment.interest).toLocaleString()}`,
          `K${Number(installment.total).toLocaleString()}`,
          installment.paid ? 'Yes' : 'No',
          new Date(loan.createdAt).toLocaleDateString(),
        ]);
      });
    });

    autoTable(doc, {
      startY: 25,
      head: [['Username', 'Name', 'Loan Amount', 'Duration', 'Month', 'Principal', 'Interest', 'Total', 'Paid', 'Date']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [33, 150, 243] },
    });

    doc.save(filename);
  } catch (err) {
    alert('Error generating PDF: ' + err.message);
  }
};

const generateSavingsPDF = async (filename) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/savings`);
    const savings = res.data;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Savings Report', 105, 15, { align: 'center' });

    const tableData = savings.map(saving => ([
      saving.userId?.username || '',
      saving.userId?.name || '',
      `K${Number(saving.amount).toLocaleString()}`,
      saving.month,
      `K${Number(saving.interestEarned || 0).toLocaleString()}`,
      `K${Number(saving.fine || 0).toLocaleString()}`,
      new Date(saving.createdAt).toLocaleDateString(),
    ]));

    autoTable(doc, {
      startY: 25,
      head: [['Username', 'Name', 'Amount', 'Month', 'Interest Earned', 'Fine', 'Date']],
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
      { key: 'Username', label: 'Username' },
      { key: 'Name', label: 'Name' },
      { key: 'LoanAmount', label: 'Loan Amount' },
      { key: 'DurationMonths', label: 'Duration (Months)' },
      { key: 'Month', label: 'Installment Month' },
      { key: 'Principal', label: 'Principal' },
      { key: 'Interest', label: 'Interest' },
      { key: 'Total', label: 'Total' },
      { key: 'Paid', label: 'Paid' },
      { key: 'LoanCreatedAt', label: 'Loan Date' },
    ],
  },
  {
    label: 'Savings',
    endpoint: `${API_BASE_URL}/savings/export`,
    excelName: 'savings.xlsx',
    pdfName: 'savings_report.pdf',
    viewEndpoint: `${API_BASE_URL}/savings`,
    columns: [
      { key: 'Username', label: 'Username' },
      { key: 'Name', label: 'Name' },
      { key: 'Amount', label: 'Amount' },
      { key: 'Month', label: 'Month' },
      { key: 'InterestEarned', label: 'Interest Earned' },
      { key: 'Fine', label: 'Fine' },
      { key: 'Date', label: 'Date' },
    ],
  },
  {
    label: 'Transactions',
    endpoint: `${API_BASE_URL}/transactions/export`,
    excelName: 'transactions_report.csv',
    pdfName: 'transactions_report.pdf',
    viewEndpoint: `${API_BASE_URL}/transactions`,
    columns: [
      { key: 'Username', label: 'Username' },
      { key: 'Name', label: 'Name' },
      { key: 'Type', label: 'Type' },
      { key: 'Amount', label: 'Amount' },
      { key: 'Note', label: 'Note' },
      { key: 'Date', label: 'Date' },
    ],
    transform: (data) => data.map(t => ({
      ...t,
      Date: t.Date ? t.Date.split('T')[0] : t.Date,
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
            className="border border-border-default text-text-primary font-medium rounded-full px-4 py-1.5 hover:bg-surface-page transition-colors disabled:opacity-50"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >Previous</button>
          <span className="text-xs text-text-secondary">Page {page + 1} of {pageCount}</span>
          <button
            className="border border-border-default text-text-primary font-medium rounded-full px-4 py-1.5 hover:bg-surface-page transition-colors disabled:opacity-50"
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >Next</button>
        </div>
      </div>
    </div>
  );
};

const Reports = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [modalColumns, setModalColumns] = useState([]);
  const [modalTitle, setModalTitle] = useState('');
  const [reportSelectionOpen, setReportSelectionOpen] = useState(false);
  const [pendingReportConfig, setPendingReportConfig] = useState(null);
  const [showFinesModal, setShowFinesModal] = useState(false);

  const handleViewReport = async (config) => {
    setPendingReportConfig(config);
    setReportSelectionOpen(true);
  };

  const handleCycleSelected = async (cycleType, cycleNumber, reportConfig) => {
    setLoading(`${reportConfig.label}-view`);
    setError('');
    setReportSelectionOpen(false);
    
    try {
      // Use enhanced endpoint for cycle-based reporting
      let url = `${API_BASE_URL}/reports/enhanced`;
      const params = new URLSearchParams({
        reportType: reportConfig.label.toLowerCase(),
        cycleType: cycleType,
        format: 'json'
      });

      if (cycleNumber) {
        params.append('cycleNumber', cycleNumber);
      }

      url += `?${params.toString()}`;

      const res = await axios.get(url);
      const result = res.data;
      let data = result.data || [];
      
      // Apply existing transformation if needed
      if (reportConfig.transform) {
        data = reportConfig.transform(data);
      }
      
      setModalData(data);
      setModalColumns(reportConfig.columns);
      setModalTitle(`${reportConfig.label} - ${result.reportTitle}`);
      setModalOpen(true);
      
    } catch (err) {
      setError(`Failed to load ${reportConfig.label} report: ${err.message}`);
    } finally {
      setLoading('');
      setPendingReportConfig(null);
    }
  };

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

      if (config.label === 'Loans') {
        if (type === 'excel') {
          await downloadExcelReport(config.endpoint, config.excelName);
        } else if (type === 'pdf') {
          await generateLoansPDF(config.pdfName);
        }
        return;
      }

      if (config.label === 'Savings') {
        if (type === 'excel') {
          await downloadExcelReport(config.endpoint, config.excelName);
        } else if (type === 'pdf') {
          await generateSavingsPDF(config.pdfName);
        }
        return;
      }

      // Fallback for any other report types
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
    } catch (err) {
      setError(`Failed to export ${config.label}`);
    } finally {
      setLoading('');
    }
  };

  const isOfficer = ['admin', 'loan_officer', 'treasurer'].includes(user?.role);

  return (
    <div className="p-4 w-full max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center">Reports</h1>

      {/* Fines & Penalties section — visible to all roles */}
      <div className="mb-8 border rounded-lg p-4 bg-orange-50">
        <div className="font-semibold mb-1 text-center text-orange-800">Fines &amp; Penalties</div>
        <p className="text-sm text-center text-orange-700 mb-3">
          {isOfficer
            ? 'View and manage all member fines and penalties.'
            : 'View any fines or penalties issued to your account.'}
        </p>
        <div className="flex justify-center">
          <button
            className="bg-brand-primary hover:bg-brand-hover text-white font-semibold rounded-full px-7 py-3.5 transition-colors"
            onClick={() => setShowFinesModal(true)}
          >
            View Fines &amp; Penalties
          </button>
        </div>
      </div>

      {exportConfigs.map(config => (
        <div key={config.label} className="mb-8">
          <div className="font-semibold mb-2 text-center">{config.label}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mx-auto w-[90%] sm:w-[80%]">
            <button
              className="border border-border-default text-text-primary font-medium rounded-full px-6 py-3 hover:bg-surface-page transition-colors w-full disabled:opacity-50"
              onClick={() => handleExport(config, 'excel')}
              disabled={loading}
            >
              Export Excel
            </button>
            <button
              className="border border-border-default text-text-primary font-medium rounded-full px-6 py-3 hover:bg-surface-page transition-colors w-full disabled:opacity-50"
              onClick={() => handleExport(config, 'pdf')}
              disabled={loading}
            >
              Download PDF
            </button>
            <button
              className="bg-brand-primary hover:bg-brand-hover text-white font-semibold rounded-full px-7 py-3.5 transition-colors w-full disabled:opacity-50"
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
      
      <ReportModal 
        open={modalOpen} 
        onClose={() => setModalOpen(false)} 
        data={modalData} 
        columns={modalColumns} 
        title={modalTitle} 
      />
      
      <ReportSelectionModal
        open={reportSelectionOpen}
        onClose={() => {
          setReportSelectionOpen(false);
          setPendingReportConfig(null);
        }}
        onSelect={(cycleType, cycleNumber) => handleCycleSelected(cycleType, cycleNumber, pendingReportConfig)}
      />

      <FinesModal open={showFinesModal} onClose={() => setShowFinesModal(false)} />
    </div>
  );
};

export default Reports;




