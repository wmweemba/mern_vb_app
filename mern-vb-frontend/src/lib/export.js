import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ✅ Export array of objects to Excel
export function exportToExcel(data, filename = 'report.xlsx') {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, filename);
}

// ✅ Specialized PDF Export: Loans
export function exportLoansToPDF(loansData, filename = 'loans_report.pdf') {
  const doc = new jsPDF();
  const headers = ['Username', 'Name', 'Amount', 'Duration (months)', 'Status'];

  const body = loansData.map(loan => [
    loan.userId?.username || '',
    loan.userId?.name || '',
    `K${Number(loan.amount || 0).toLocaleString()}`,
    loan.durationMonths || '',
    loan.fullyPaid ? 'Paid' : 'Active'
  ]);

  doc.setFontSize(14);
  doc.text('Loans Report', 105, 15, { align: 'center' });
  doc.autoTable({
    head: [headers],
    body,
    startY: 25,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [76, 175, 80] }
  });

  doc.save(filename);
}

// ✅ Specialized PDF Export: Savings
export function exportSavingsToPDF(savingsData, filename = 'savings_report.pdf') {
  const doc = new jsPDF();
  const headers = ['Username', 'Name', 'Amount', 'Month', 'Date', 'Fine', 'Interest Earned'];

  const body = savingsData.map(s => [
    s.userId?.username || '',
    s.userId?.name || '',
    `K${Number(s.amount || 0).toLocaleString()}`,
    s.month || '',
    s.date ? new Date(s.date).toISOString().split('T')[0] : '',
    s.fine || 0,
    s.interestEarned || 0
  ]);

  doc.setFontSize(14);
  doc.text('Savings Report', 105, 15, { align: 'center' });
  doc.autoTable({
    head: [headers],
    body,
    startY: 25,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 121, 255] }
  });

  doc.save(filename);
}

// ✅ Unified PDF Export Dispatcher
export function exportToPDF(data, filename = 'report.pdf') {
  if (filename.includes('loans')) {
    return exportLoansToPDF(data, filename);
  } else if (filename.includes('savings')) {
    return exportSavingsToPDF(data, filename);
  } else {
    const doc = new jsPDF();
    const keys = data.length ? Object.keys(data[0]) : [];
    const columns = keys.map(k => ({ title: k, dataKey: k }));
    doc.autoTable({ columns, body: data });
    doc.save(filename);
  }
}



// import * as XLSX from 'xlsx';
// import jsPDF from 'jspdf';
// import 'jspdf-autotable';

// // Export array of objects to Excel
// export function exportToExcel(data, filename = 'report.xlsx') {
//   const worksheet = XLSX.utils.json_to_sheet(data);
//   const workbook = XLSX.utils.book_new();
//   XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
//   XLSX.writeFile(workbook, filename);
// }

// // Export array of objects to PDF (columns: [{title, dataKey}])
// export function exportToPDF(data, filename = 'report.pdf', columns = null) {
//   const doc = new jsPDF();
//   if (columns) {
//     doc.autoTable({ columns, body: data });
//   } else {
//     // If no columns provided, use keys from first object
//     const keys = data.length ? Object.keys(data[0]) : [];
//     const cols = keys.map(k => ({ title: k, dataKey: k }));
//     doc.autoTable({ columns: cols, body: data });
//   }
//   doc.save(filename);
// }

