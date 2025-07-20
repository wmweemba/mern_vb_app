const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
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
    data.push({ Username: '', Name: '', Type: '', Amount: '', Note: 'Closing Balance', Date: closingBalance });
    const parser = new Parser();
    const csv = parser.parse(data);
    res.header('Content-Type', 'text/csv');
    res.attachment('transactions_report.csv');
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export transactions report', details: err.message });
  }
};

exports.exportTransactionsReportPDF = async (req, res) => {
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
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions_report.pdf"');
    doc.pipe(res);
    doc.fontSize(16).text('Transactions Report', { align: 'center' });
    doc.moveDown();
    // Table header
    const headers = ['Username', 'Name', 'Type', 'Amount', 'Note', 'Date'];
    const colWidths = [70, 80, 50, 60, 120, 60];
    let y = doc.y;
    let x = doc.x;
    headers.forEach((header, i) => {
      doc.font('Helvetica-Bold').fontSize(9).text(header, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });
    y += 18;
    // Table rows
    data.forEach(row => {
      x = doc.x;
      headers.forEach((header, i) => {
        doc.font('Helvetica').fontSize(8).text(row[header] || '', x, y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });
      y += 14;
      if (y > doc.page.height - 50) {
        doc.addPage();
        y = doc.y;
      }
    });
    // Closing balance row
    x = doc.x;
    doc.font('Helvetica-Bold').fontSize(9).text('Closing Balance', x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y, { width: colWidths[4], align: 'left' });
    doc.font('Helvetica-Bold').fontSize(9).text(closingBalance.toString(), x + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], y, { width: colWidths[5], align: 'left' });
    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to export PDF report', details: err.message });
  }
};