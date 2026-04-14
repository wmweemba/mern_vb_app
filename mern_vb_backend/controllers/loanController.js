// Reverse a paid installment (admin, loan_officer, treasurer only)
const mongoose = require('mongoose');

exports.reverseInstallmentPayment = async (req, res) => {
  const { loanId, month } = req.params;
  const allowedRoles = ['admin', 'loan_officer', 'treasurer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const loan = await Loan.findOne({ _id: loanId, ...req.groupScope }).session(session);
      if (!loan) {
        throw new Error('Loan not found');
      }

      const installment = loan.installments.find(inst => inst.month === Number(month));
      if (!installment) {
        throw new Error('Installment not found');
      }
      if (!installment.paid) {
        throw new Error('Installment is not marked as paid');
      }

      // Get the amount that was paid for this installment
      const paidAmount = installment.paidAmount || installment.total;

      // Validate that paidAmount is reasonable (not corrupted data)
      if (paidAmount > installment.total * 2) {
        throw new Error(`Cannot reverse: paidAmount (${paidAmount}) appears corrupted for installment total (${installment.total})`);
      }

      // Reverse the payment
      installment.paid = false;
      installment.paymentDate = undefined;
      installment.paidAmount = 0;
      installment.penalties = { lateInterest: 0, overdueFine: 0, earlyPaymentCharge: 0 };

      await updateBankBalance(-paidAmount, req.groupId, session);

      await logTransaction({
        userId: loan.userId,
        type: 'loan_payment',
        amount: -paidAmount,
        note: `Reversed payment for Month ${month} - Amount: K${paidAmount}`,
        referenceId: loanId,
        groupId: req.groupId
      }, session);

      loan.fullyPaid = false;

      await loan.save({ session });

      res.json({
        message: `Installment payment reversed successfully - K${paidAmount} refunded`,
        loan,
        reversedAmount: paidAmount
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reverse payment', details: err.message });
  } finally {
    await session.endSession();
  }
};

const Loan = require('../models/Loans');
const GroupMember = require('../models/GroupMember');
const Savings = require('../models/Savings');
const calculateLoanSchedule = require('../utils/loanCalculator');
const { logTransaction } = require('./transactionController');
const { updateBankBalance } = require('./bankBalanceController');
const { getSettings } = require('./groupSettingsController');
const { Parser } = require('json2csv');
const PdfPrinter = require('pdfmake');
const fonts = {
  Roboto: {
    normal: 'node_modules/pdfmake/build/vfs_fonts.js',
    bold: 'node_modules/pdfmake/build/vfs_fonts.js',
    italics: 'node_modules/pdfmake/build/vfs_fonts.js',
    bolditalics: 'node_modules/pdfmake/build/vfs_fonts.js',
  },
};

// Update loan details (admin, loan_officer, treasurer only)
exports.updateLoan = async (req, res) => {
  const { loanId } = req.params;
  const updates = req.body;
  const allowedRoles = ['admin', 'loan_officer', 'treasurer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  try {
    const loan = await Loan.findOne({ _id: loanId, ...req.groupScope });
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const repaymentsStarted = loan.installments.some(inst => inst.paid);
    const restrictedFields = ['amount', 'interestRate'];

    if (repaymentsStarted) {
      for (const field of restrictedFields) {
        if (updates[field] !== undefined && updates[field] !== loan[field]) {
          return res.status(400).json({ error: `Cannot edit ${field} after repayments have started.` });
        }
      }
    }

    const originalAmount = loan.amount;
    const originalDuration = loan.durationMonths;
    let amountChanged = false;
    let durationChanged = false;

    const allowedFields = ['amount', 'interestRate', 'durationMonths', 'notes'];

    for (const key in updates) {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        if (repaymentsStarted && restrictedFields.includes(key)) {
          continue;
        }
        if (key === 'amount' && updates[key] !== loan[key]) {
          amountChanged = true;
        }
        if (key === 'durationMonths' && updates[key] !== loan[key]) {
          durationChanged = true;
        }
        loan[key] = updates[key];
      }
    }

    if (amountChanged || durationChanged) {
      const finalAmount = loan.amount;
      const finalDuration = loan.durationMonths;

      if (repaymentsStarted && durationChanged) {
        const paidInstallments = loan.installments.filter(inst => inst.paid);
        const totalPaidPrincipal = paidInstallments.reduce((sum, inst) => sum + inst.principal, 0);
        const remainingPrincipal = finalAmount - totalPaidPrincipal;
        const remainingDuration = finalDuration - paidInstallments.length;

        if (remainingDuration > 0 && remainingPrincipal > 0) {
          const unpaidInstallments = loan.installments.filter(inst => !inst.paid);
          const newInstallmentPrincipal = +(remainingPrincipal / remainingDuration).toFixed(2);

          let principalBalance = remainingPrincipal;
          unpaidInstallments.forEach((inst, index) => {
            const currentPrincipal = index === unpaidInstallments.length - 1 ?
              principalBalance : newInstallmentPrincipal;
            const interest = +(principalBalance * (loan.interestRate / 100)).toFixed(2);

            inst.principal = currentPrincipal;
            inst.interest = interest;
            inst.total = +(currentPrincipal + interest).toFixed(2);
            principalBalance -= currentPrincipal;
          });

          const currentInstallmentCount = loan.installments.length;
          if (finalDuration > currentInstallmentCount) {
            for (let month = currentInstallmentCount + 1; month <= finalDuration; month++) {
              loan.installments.push({
                month,
                principal: 0,
                interest: 0,
                total: 0,
                paid: false,
                penalties: {
                  lateInterest: 0,
                  overdueFine: 0,
                  earlyPaymentCharge: 0
                }
              });
            }
          } else if (finalDuration < currentInstallmentCount) {
            loan.installments = loan.installments.slice(0, finalDuration);
          }
        }
      } else if (!repaymentsStarted) {
        const { schedule } = calculateLoanSchedule(finalAmount, finalDuration, loan.interestRate, loan.interestMethod || 'reducing');
        loan.installments = schedule;
      }
    }

    if (amountChanged && !repaymentsStarted) {
      const amountDifference = updates.amount - originalAmount;
      await updateBankBalance(-amountDifference, req.groupId);
      await logTransaction({
        userId: loan.userId,
        type: 'loan',
        amount: amountDifference,
        referenceId: loan._id,
        note: `Loan amount adjusted from K${originalAmount} to K${updates.amount} (difference: K${amountDifference})`,
        groupId: req.groupId
      });
    }

    await loan.save();
    res.json({ message: 'Loan updated successfully', loan });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update loan', details: err.message });
  }
};

exports.createLoan = async (req, res) => {
  const { username, amount, duration: customDuration, interestRate: customRate } = req.body;
  if (!username || !amount) return res.status(400).json({ error: 'Missing fields' });

  try {
    // Look up member by name within the group
    const member = await GroupMember.findOne({ name: username, ...req.groupScope });
    if (!member) return res.status(400).json({ error: 'Member not found' });
    const userId = member._id;

    const settings = await getSettings(req.groupId);

    const duration = customDuration ? Number(customDuration) : settings.defaultLoanDuration;
    const appliedInterestRate = customRate !== undefined ? Number(customRate) : settings.interestRate;

    // Enforce loan limit: amount cannot exceed savings × multiplier
    const totalSavings = await Savings.aggregate([
      { $match: { userId, groupId: req.groupId, archived: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const memberSavings = totalSavings[0]?.total || 0;
    const maxLoan = memberSavings * settings.loanLimitMultiplier;
    if (amount > maxLoan) {
      return res.status(400).json({
        error: `Loan amount K${amount} exceeds limit of K${maxLoan} (${settings.loanLimitMultiplier}× savings of K${memberSavings})`
      });
    }

    const { schedule } = calculateLoanSchedule(amount, duration, appliedInterestRate, settings.interestMethod);

    const loan = new Loan({
      ...req.groupScope,
      userId,
      amount,
      durationMonths: duration,
      interestRate: appliedInterestRate,
      interestMethod: settings.interestMethod,
      installments: schedule
    });

    await loan.save();
    await logTransaction({
      userId,
      type: 'loan',
      amount,
      referenceId: loan._id,
      note: `Loan of K${amount} created for ${duration} month(s).`,
      groupId: req.groupId
    });
    await updateBankBalance(-amount, req.groupId);
    res.status(201).json(loan);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create loan', details: err.message });
  }
};

exports.deleteLoan = async (req, res) => {
  const { loanId } = req.params;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const loan = await Loan.findOne({ _id: loanId, ...req.groupScope }).session(session);
      if (!loan) {
        throw Object.assign(new Error('Loan not found'), { status: 404 });
      }

      const hasPayments = loan.installments.some(inst => inst.paid || (inst.paidAmount && inst.paidAmount > 0));
      if (hasPayments || loan.fullyPaid) {
        throw Object.assign(
          new Error('Cannot delete a loan that has existing payments. Please reverse all payments first.'),
          { status: 400 }
        );
      }

      await updateBankBalance(loan.amount, req.groupId, session);

      await logTransaction({
        userId: loan.userId,
        type: 'loan',
        amount: -loan.amount,
        referenceId: loan._id,
        note: `Loan of K${loan.amount} deleted - disbursement reversed.`,
        groupId: req.groupId
      }, session);

      await Loan.findByIdAndDelete(loanId).session(session);

      res.json({ message: `Loan deleted successfully. K${loan.amount} restored to bank balance.` });
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to delete loan', details: err.message });
  } finally {
    await session.endSession();
  }
};

exports.getLoansByUser = async (req, res) => {
  try {
    let userId = req.params.id;
    if (req.query.username) {
      const member = await GroupMember.findOne({ name: req.query.username, ...req.groupScope });
      if (!member) return res.status(404).json({ error: 'Member not found' });
      userId = member._id;
    }
    const loans = await Loan.find({ userId, ...req.groupScope, archived: { $ne: true } });
    res.json(loans);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
};

exports.repayInstallment = async (req, res) => {
  const { username, loanId, month, paymentDate } = req.body;
  try {
    const settings = await getSettings(req.groupId);

    const member = await GroupMember.findOne({ name: username, ...req.groupScope });
    if (!member) return res.status(400).json({ error: 'Member not found' });
    const userId = member._id;

    const loan = await Loan.findOne({ _id: loanId, userId, ...req.groupScope });
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    const installment = loan.installments.find(inst => inst.month === month);
    if (!installment) return res.status(400).json({ error: 'Invalid installment month' });
    if (installment.paid) return res.status(400).json({ error: 'Installment already paid' });

    const now = new Date(paymentDate);
    const dueDate = new Date(loan.createdAt);
    dueDate.setMonth(dueDate.getMonth() + month);

    if (now > dueDate) {
      installment.penalties.lateInterest = +(installment.total * (settings.latePenaltyRate / 100)).toFixed(2);
    }

    const termEnd = new Date(loan.createdAt);
    termEnd.setMonth(termEnd.getMonth() + loan.durationMonths);
    if (now > termEnd) {
      installment.penalties.overdueFine = settings.overdueFineAmount;
    }

    if (month === 1 && now < dueDate) {
      const allUnpaid = loan.installments.every(inst => !inst.paid);
      if (allUnpaid) {
        installment.penalties.earlyPaymentCharge = settings.earlyPaymentCharge;
      }
    }

    installment.paid = true;
    installment.paymentDate = now;

    loan.fullyPaid = loan.installments.every(inst => inst.paid);
    await loan.save();

    res.json({ message: 'Installment marked as paid', loan });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record payment', details: err.message });
  }
};

exports.exportLoansReport = async (req, res) => {
  try {
    const loans = await Loan.find({ ...req.groupScope, archived: { $ne: true } })
      .populate('userId', 'name email');
    const flatData = [];

    loans.forEach(loan => {
      loan.installments.forEach(installment => {
        flatData.push({
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
    const loans = await Loan.find({ ...req.groupScope }).populate('userId', 'name email');
    const flatData = [];
    loans.forEach(loan => {
      loan.installments.forEach(installment => {
        flatData.push([
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
            widths: ['*', '*', '*', '*', '*', '*', '*', '*', '*'],
            body: [
              ['Name', 'Loan Amount', 'Duration', 'Month', 'Principal', 'Interest', 'Total Due', 'Paid', 'Payment Date'],
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
    const loans = await Loan.find({ ...req.groupScope, archived: { $ne: true } })
      .populate('userId', 'name email');
    res.json(loans);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all loans' });
  }
};
