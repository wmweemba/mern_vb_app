const Loan = require('../models/Loans');
const User = require('../models/User');
const calculateLoanSchedule = require('../utils/loanCalculator');
const { Parser } = require('json2csv');
const { logTransaction } = require('./transactionController');
const { updateBankBalance } = require('./bankBalanceController');
const PdfPrinter = require('pdfmake');
const fonts = {
  Roboto: {
    normal: 'node_modules/pdfmake/build/vfs_fonts.js',
    bold: 'node_modules/pdfmake/build/vfs_fonts.js',
    italics: 'node_modules/pdfmake/build/vfs_fonts.js',
    bolditalics: 'node_modules/pdfmake/build/vfs_fonts.js',
  },
};

exports.createLoan = async (req, res) => {
  const { username, amount } = req.body;
  if (!username || !amount) return res.status(400).json({ error: 'Missing fields' });

  try {
    // Look up user by username
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    const userId = user._id;

    const { duration, schedule } = calculateLoanSchedule(amount);

    const loan = new Loan({
      userId,
      amount,
      durationMonths: duration,
      installments: schedule
    });

    await loan.save();
    await logTransaction({
      userId,
      type: 'loan',
      amount,
      referenceId: loan._id,
      note: `Loan of K${amount} created.`
    });
    await updateBankBalance(-amount); // Debit the bank balance
    res.status(201).json(loan);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create loan', details: err.message });
  }
};

exports.getLoansByUser = async (req, res) => {
  try {
    let userId = req.params.id;
    if (req.query.username) {
      const user = await User.findOne({ username: req.query.username });
      if (!user) return res.status(404).json({ error: 'User not found' });
      userId = user._id;
    }
    const loans = await Loan.find({ userId });
    res.json(loans);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
};

exports.repayInstallment = async (req, res) => {
  const { username, loanId, month, paymentDate } = req.body;
  try {
    // Look up user by username
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    const userId = user._id;

    const loan = await Loan.findOne({ _id: loanId, userId });
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    const installment = loan.installments.find(inst => inst.month === month);
    if (!installment) return res.status(400).json({ error: 'Invalid installment month' });
    if (installment.paid) return res.status(400).json({ error: 'Installment already paid' });

    const now = new Date(paymentDate);
    const dueDate = new Date(loan.createdAt);
    dueDate.setMonth(dueDate.getMonth() + month);

    // Late payment check
    if (now > dueDate) {
      installment.penalties.lateInterest = +(installment.total * 0.15).toFixed(2);
    }

    // Overdue fine (after full term)
    const termEnd = new Date(loan.createdAt);
    termEnd.setMonth(termEnd.getMonth() + loan.durationMonths);
    if (now > termEnd) {
      installment.penalties.overdueFine = 1000;
    }

    // Early payment check
    if (month === 1 && now < dueDate) {
      const allUnpaid = loan.installments.every(inst => !inst.paid);
      if (allUnpaid) {
        installment.penalties.earlyPaymentCharge = 200;
      }
    }

    installment.paid = true;
    installment.paymentDate = now;

    // Check if all paid
    loan.fullyPaid = loan.installments.every(inst => inst.paid);
    await loan.save();

    res.json({ message: 'Installment marked as paid', loan });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record payment', details: err.message });
  }
};

exports.exportLoansReport = async (req, res) => {
  try {
    const loans = await Loan.find().populate('userId', 'username name email');
    const flatData = [];

    loans.forEach(loan => {
      loan.installments.forEach(installment => {
        flatData.push({
          Username: loan.userId.username,
          Name: loan.userId.name,
          Email: loan.userId.email,
          LoanAmount: loan.amount,
          DurationMonths: loan.durationMonths,
          Month: installment.month,
          Principal: installment.principal,
          Interest: installment.interest,
          TotalDue: installment.total,
          Paid: installment.paid,
          PaymentDate: installment.paymentDate || '',
          LateInterest: installment.penalties.lateInterest,
          OverdueFine: installment.penalties.overdueFine,
          EarlyPaymentCharge: installment.penalties.earlyPaymentCharge
        });
      });
    });

    const parser = new Parser();
    const csv = parser.parse(flatData);

    res.header('Content-Type', 'text/csv');
    res.attachment('loan_report.csv');
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export report', details: err.message });
  }
};

exports.exportLoansReportPDF = async (req, res) => {
  try {
    const loans = await Loan.find().populate('userId', 'username name email');
    const flatData = [];
    loans.forEach(loan => {
      loan.installments.forEach(installment => {
        flatData.push([
          loan.userId.username,
          loan.userId.name,
          loan.amount,
          loan.durationMonths,
          installment.month,
          installment.principal,
          installment.interest,
          installment.total,
          installment.paid ? 'Yes' : 'No',
          installment.paymentDate ? installment.paymentDate.toISOString().split('T')[0] : ''
        ]);
      });
    });
    const printer = new PdfPrinter(fonts);
    const docDefinition = {
      content: [
        { text: 'Loan Report', style: 'header', alignment: 'center', margin: [0, 0, 0, 10] },
        {
          table: {
            headerRows: 1,
            widths: ['*', '*', '*', '*', '*', '*', '*', '*', '*', '*'],
            body: [
              ['Username', 'Name', 'Loan Amount', 'Duration', 'Month', 'Principal', 'Interest', 'Total Due', 'Paid', 'Payment Date'],
              ...flatData
            ]
          },
          layout: 'lightHorizontalLines',
        }
      ],
      styles: {
        header: { fontSize: 16, bold: true }
      },
      defaultStyle: { font: 'Roboto', fontSize: 9 }
    };
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="loan_report.pdf"');
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to export PDF report', details: err.message });
  }
};

exports.getAllLoans = async (req, res) => {
  try {
    const loans = await Loan.find().populate('userId', 'username name email');
    res.json(loans);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all loans' });
  }
};
