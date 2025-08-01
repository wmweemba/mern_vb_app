const { Parser } = require('json2csv');
// const PdfPrinter = require('pdfmake');
// const fonts = {
//   Roboto: {
//     normal: 'node_modules/pdfmake/build/vfs_fonts.js',
//     bold: 'node_modules/pdfmake/build/vfs_fonts.js',
//     italics: 'node_modules/pdfmake/build/vfs_fonts.js',
//     bolditalics: 'node_modules/pdfmake/build/vfs_fonts.js',
//   },
// };
require('jspdf-autotable');
const User = require('../models/User');
const BankBalance = require('../models/BankBalance');
const Transaction = require('../models/Transaction');

exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find().populate('userId', 'username name email').sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve transactions', details: err.message });
  }
};

exports.getTransactionsByUser = async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user transactions', details: err.message });
  }
};

exports.logTransaction = async ({ userId, type, amount, referenceId, note }) => {
  try {
    const transaction = new Transaction({ userId, type, amount, referenceId, note });
    await transaction.save();
  } catch (err) {
    console.error('Transaction log failed:', err.message);
  }
};

exports.exportTransactionsReport = async (req, res) => {
  try {
    const transactions = await Transaction.find().populate('userId', 'username name').sort({ createdAt: 1 });
    const data = transactions.map(t => ({
      Username: t.userId?.username || '',
      Name: t.userId?.name || '',
      Type: t.type,
      Amount: t.amount,
      Note: t.note,
      Date: t.createdAt ? t.createdAt.toISOString().split('T')[0] : ''
    }));
    // Get closing balance
    let closingBalance = 0;
    const bankDoc = await BankBalance.findOne();
    if (bankDoc) closingBalance = bankDoc.balance;
    // Add closing balance row
    // data.push({ Username: '', Name: '', Type: '', Amount: '', Note: 'Closing Balance', Date: closingBalance });
    //data.push({ Username: '', Name: '', Type: '', Amount: closingBalance, Note: 'Closing Balance', Date: '' });
    const parser = new Parser();
    const csv = parser.parse(data);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions_report.csv"');
    return res.send(csv);

  } catch (err) {
    console.error('CSV Export Error:', err); // Additional error details for troubleshooting
    res.status(500).json({ error: 'Failed to export transactions report', details: err.message });
  }
};

// exports.exportTransactionsReportPDF = async (req, res) => {
//   try {
//     const transactions = await Transaction.find().populate('userId', 'username name').sort({ createdAt: 1 });
//     const data = transactions.map(t => ([
//       t.userId?.username || '',
//       t.userId?.name || '',
//       t.type,
//       t.amount,
//       t.note,
//       t.createdAt ? t.createdAt.toISOString().split('T')[0] : ''
//     ]));
//     // Get closing balance
//     let closingBalance = 0;
//     const bankDoc = await BankBalance.findOne();
//     if (bankDoc) closingBalance = bankDoc.balance;
//     data.push(['', '', '', '', 'Closing Balance', closingBalance]);
//     const printer = new PdfPrinter(fonts);
//     const docDefinition = {
//       content: [
//         { text: 'Transactions Report', style: 'header', alignment: 'center', margin: [0, 0, 0, 10] },
//         {
//           table: {
//             headerRows: 1,
//             widths: ['*', '*', '*', '*', '*', '*'],
//             body: [
//               ['Username', 'Name', 'Type', 'Amount', 'Note', 'Date'],
//               ...data
//             ]
//           },
//           layout: 'lightHorizontalLines',
//         }
//       ],
//       styles: {
//         header: { fontSize: 16, bold: true }
//       },
//       defaultStyle: { font: 'Roboto', fontSize: 9 }
//     };
//     const pdfDoc = printer.createPdfKitDocument(docDefinition);
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Disposition', 'attachment; filename="transactions_report.pdf"');
//     pdfDoc.pipe(res);
//     pdfDoc.end();
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to export PDF report', details: err.message });
//   }
// };