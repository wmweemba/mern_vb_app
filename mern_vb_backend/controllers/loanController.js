const Loan = require('../models/Loan');
const calculateLoanSchedule = require('../utils/loanCalculator');
const { Parser } = require('json2csv');
const { logTransaction } = require('./transactionController');

exports.createLoan = async (req, res) => {
  const { userId, amount } = req.body;
  if (!userId || !amount) return res.status(400).json({ error: 'Missing fields' });

  try {
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
    
    res.status(201).json(loan);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create loan', details: err.message });
  }
};

exports.getLoansByUser = async (req, res) => {
  try {
    const loans = await Loan.find({ userId: req.params.id });
    res.json(loans);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
};

exports.repayInstallment = async (req, res) => {
  const { loanId, month, paymentDate } = req.body;
  try {
    const loan = await Loan.findById(loanId);
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
