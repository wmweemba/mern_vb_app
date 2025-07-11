import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Export array of objects to Excel
export function exportToExcel(data, filename = 'report.xlsx') {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, filename);
}

// Export array of objects to PDF (columns: [{title, dataKey}])
export function exportToPDF(data, filename = 'report.pdf', columns = null) {
  const doc = new jsPDF();
  if (columns) {
    doc.autoTable({ columns, body: data });
  } else {
    // If no columns provided, use keys from first object
    const keys = data.length ? Object.keys(data[0]) : [];
    const cols = keys.map(k => ({ title: k, dataKey: k }));
    doc.autoTable({ columns: cols, body: data });
  }
  doc.save(filename);
}

// Usage:
// import { exportToExcel, exportToPDF } from '../lib/export';
// exportToExcel(data, 'loans.xlsx');
// exportToPDF(data, 'loans.pdf', columns); 