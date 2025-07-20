const Saving = require('../models/Savings');
const Loan = require('../models/Loans');
const User = require('../models/User');
const { logTransaction } = require('./transactionController');
const { updateBankBalance } = require('./bankBalanceController');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

exports.createSaving = async (req, res) => {
  const { username, month, amount, date } = req.body;
  try {
    // Look up user by username
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    const userId = user._id;

    const savingDate = date ? new Date(date) : new Date();

    let fine = 0;
    let interest = +(amount * 0.10).toFixed(2);

    // Required savings check
    if (month === 1 && amount < 3000) fine = 500;
    else if (month > 1 && amount < 1000) fine = 500;
    else if (month <= 3 && amount > 5000) return res.status(400).json({ error: 'Cannot save more than K5,000 in the first 3 months' });

    const saving = new Saving({
      userId,
      month,
      amount,
      date: savingDate,
      fine,
      interestEarned: interest
    });

    await saving.save();
    await logTransaction({
      userId,
      type: 'saving',
      amount,
      referenceId: saving._id,
      note: `Savings of K${amount} for month ${month}.`
    });
    await updateBankBalance(amount); // Credit the bank balance
    res.status(201).json(saving);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save contribution', details: err.message });
  }
};

exports.getSavingsByUser = async (req, res) => {
  try {
    const savings = await Saving.find({ userId: req.params.id });
    res.json(savings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch savings' });
  }
};

exports.getAllSavings = async (req, res) => {
  try {
    const savings = await Saving.find().populate('userId', 'username name email');
    res.json(savings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all savings' });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    // Total Saved and Interest on Savings
    const savingsAgg = await Saving.aggregate([
      {
        $group: {
          _id: null,
          totalSaved: { $sum: '$amount' },
          totalInterestSavings: { $sum: '$interestEarned' }
        }
      }
    ]);
    const totalSaved = savingsAgg[0]?.totalSaved || 0;
    const totalInterestSavings = savingsAgg[0]?.totalInterestSavings || 0;

    // Total Loaned and Interest on Loans
    const loans = await Loan.find();
    let totalLoaned = 0;
    let totalInterestLoans = 0;
    loans.forEach(loan => {
      totalLoaned += loan.amount;
      if (Array.isArray(loan.installments)) {
        totalInterestLoans += loan.installments.reduce((sum, inst) => sum + (inst.interest || 0), 0);
      }
    });

    res.json({
      totalSaved,
      totalLoaned,
      totalInterestSavings,
      totalInterestLoans
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: err.message });
  }
};

exports.exportSavingsReport = async (req, res) => {
  try {
    const savings = await Saving.find().populate('userId', 'username name email');
    const data = savings.map(s => ({
      Username: s.userId.username,
      Name: s.userId.name,
      Email: s.userId.email,
      Amount: s.amount,
      Month: s.month,
      Date: s.date,
      Fine: s.fine,
      InterestEarned: s.interestEarned
    }));

    const parser = new Parser();
    const csv = parser.parse(data);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.header('Content-Type', 'text/csv');
    res.attachment('savings_report.csv');
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export savings report', details: err.message });
  }
};

exports.exportSavingsReportPDF = async (req, res) => {
  try {
    const savings = await Saving.find().populate('userId', 'username name email');
    const data = savings.map(s => ({
      Username: s.userId.username,
      Name: s.userId.name,
      Amount: s.amount,
      Month: s.month,
      Date: s.date ? s.date.toISOString().split('T')[0] : '',
      Fine: s.fine,
      InterestEarned: s.interestEarned
    }));
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="savings_report.pdf"');
    doc.pipe(res);
    doc.fontSize(16).text('Savings Report', { align: 'center' });
    doc.moveDown();
    const headers = [
      'Username', 'Name', 'Amount', 'Month', 'Date', 'Fine', 'Interest Earned'
    ];
    const colWidths = [70, 80, 60, 50, 70, 50, 70];
    let y = doc.y;
    let x = doc.x;
    headers.forEach((header, i) => {
      doc.font('Helvetica-Bold').fontSize(9).text(header, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });
    y += 18;
    data.forEach(row => {
      x = doc.x;
      headers.forEach((header, i) => {
        let key = header.replace(/ /g, '');
        if (key === 'InterestEarned') key = 'InterestEarned';
        doc.font('Helvetica').fontSize(8).text(row[header] || row[key] || '', x, y, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });
      y += 14;
      if (y > doc.page.height - 50) {
        doc.addPage();
        y = doc.y;
      }
    });
    doc.end();
  } catch (err) {
    console.error('PDF export error:', err.stack || err);
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No user info found in request.' });
    }
    res.status(500).json({ error: 'Failed to export PDF report', details: err.message, user: req.user });
  }
};