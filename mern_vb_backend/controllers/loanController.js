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
const { resolveLoanAccrualStrategy, resolveLoanAccrualKey } = require('../utils/strategies/loanAccrual');
const { logTransaction } = require('./transactionController');
const { updateBankBalance } = require('./bankBalanceController');
const { getSettings } = require('./groupSettingsController');
const { resolveEntryDate } = require('../utils/cycleHelpers');
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

    // Revolving loans have no installment schedule to restate — amount/duration edits
    // are meaningless here; a member's balance changes only via a top-up disbursement
    // (createLoan) or a payment. Only notes are editable.
    if (loan.accrualMode === 'revolving') {
      if (updates.notes !== undefined) loan.notes = updates.notes;
      await loan.save();
      return res.json({ message: 'Loan updated successfully', loan });
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
        const strategy = resolveLoanAccrualStrategy({ interestMethod: loan.interestMethod || 'reducing' });
        const { schedule } = strategy.onDisburse(finalAmount, finalDuration, loan.interestRate);
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
  const { username, amount, duration: customDuration, interestRate: customRate, createdAt } = req.body;
  if (!username || !amount) return res.status(400).json({ error: 'Missing fields' });

  // Backdating (a caller-supplied `createdAt`) is restricted to admin/treasurer
  // and must fall within the currently open cycle — see
  // docs/plan_configurable_group_rules.md Phase 5.
  if (createdAt && !['admin', 'treasurer'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admin or treasurer may backdate a loan' });
  }

  try {
    // Look up member by name within the group
    const member = await GroupMember.findOne({ name: username, ...req.groupScope, active: true, deletedAt: null });
    if (!member) return res.status(400).json({ error: 'Member not found' });
    const userId = member._id;

    const loanCreatedAt = await resolveEntryDate(req.groupId, createdAt);
    const settings = await getSettings(req.groupId);

    const duration = customDuration ? Number(customDuration) : settings.defaultLoanDuration;
    const appliedInterestRate = customRate !== undefined ? Number(customRate) : settings.interestRate;

    // Enforce loan limit: amount cannot exceed savings × multiplier. Not every policy
    // uses this rule — grocery_chilimba's loanLimit is 'none' in Phase 2 (the
    // projected_cycle_contribution cap is a separate, later strategy — see
    // docs/plan_configurable_group_rules.md §2.6).
    if (settings.policies?.loanLimit !== 'none') {
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
    }

    const accrualKey = resolveLoanAccrualKey(settings);

    if (accrualKey === 'revolving_monthly') {
      const strategy = resolveLoanAccrualStrategy(settings);

      // Top up an existing open revolving loan rather than opening a second one for
      // the same member — mirrors the workbook's "New Loan total" column.
      let loan = await Loan.findOne({
        userId, ...req.groupScope, accrualMode: 'revolving', fullyPaid: false, archived: { $ne: true }
      });
      const isTopUp = !!loan;

      if (isTopUp) {
        strategy.onDisburse(loan, amount, { recordedBy: req.memberId, date: loanCreatedAt });
        loan.interestRate = appliedInterestRate; // rate can move cycle to cycle; the loan tracks the current one
      } else {
        const fields = strategy.onDisburse(null, amount, { recordedBy: req.memberId, date: loanCreatedAt });
        loan = new Loan({
          ...req.groupScope,
          userId,
          amount,
          durationMonths: duration,
          interestRate: appliedInterestRate,
          interestMethod: settings.interestMethod,
          installments: [],
          createdAt: loanCreatedAt,
          ...fields,
        });
      }

      await loan.save();
      await logTransaction({
        userId,
        type: 'loan',
        amount,
        referenceId: loan._id,
        note: isTopUp
          ? `Loan top-up of K${amount} — new balance K${strategy.outstanding(loan)}.`
          : `Revolving loan of K${amount} disbursed.`,
        groupId: req.groupId,
        createdAt: loanCreatedAt,
      });
      await updateBankBalance(-amount, req.groupId);
      return res.status(201).json(loan);
    }

    const strategy = resolveLoanAccrualStrategy(settings);
    const { schedule } = strategy.onDisburse(amount, duration, appliedInterestRate);

    const loan = new Loan({
      ...req.groupScope,
      userId,
      amount,
      durationMonths: duration,
      interestRate: appliedInterestRate,
      interestMethod: settings.interestMethod,
      installments: schedule,
      createdAt: loanCreatedAt,
    });

    await loan.save();
    await logTransaction({
      userId,
      type: 'loan',
      amount,
      referenceId: loan._id,
      note: `Loan of K${amount} created for ${duration} month(s).`,
      groupId: req.groupId,
      createdAt: loanCreatedAt,
    });
    await updateBankBalance(-amount, req.groupId);
    res.status(201).json(loan);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to create loan', details: err.message });
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

      // Revolving loans have no installments[] to check — a top-up, payment, accrual
      // or capitalisation all show up as entries beyond the single opening
      // disbursement. Deleting is only safe for a loan that's still exactly as
      // disbursed, same rule as the scheduled path.
      const hasPayments = loan.accrualMode === 'revolving'
        ? loan.entries.some(e => e.type !== 'disbursement') || loan.entries.filter(e => e.type === 'disbursement').length > 1
        : loan.installments.some(inst => inst.paid || (inst.paidAmount && inst.paidAmount > 0));
      if (hasPayments || loan.fullyPaid) {
        throw Object.assign(
          new Error('Cannot delete a loan that has existing payments. Please reverse all payments first.'),
          { status: 400 }
        );
      }

      // For a still-untouched revolving loan principalBalance equals the original
      // disbursement, but restoring from principalBalance (rather than loan.amount)
      // keeps this correct if that assumption is ever loosened.
      const restoreAmount = loan.accrualMode === 'revolving' ? loan.principalBalance : loan.amount;

      await updateBankBalance(restoreAmount, req.groupId, session);

      await logTransaction({
        userId: loan.userId,
        type: 'loan',
        amount: -restoreAmount,
        referenceId: loan._id,
        note: `Loan of K${restoreAmount} deleted - disbursement reversed.`,
        groupId: req.groupId
      }, session);

      await Loan.findByIdAndDelete(loanId).session(session);

      res.json({ message: `Loan deleted successfully. K${restoreAmount} restored to bank balance.` });
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
      const member = await GroupMember.findOne({ name: req.query.username, ...req.groupScope, active: true, deletedAt: null });
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

    const member = await GroupMember.findOne({ name: username, ...req.groupScope, active: true, deletedAt: null });
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

// --- Month-end interest run (revolving loans only) ---
// docs/plan_configurable_group_rules.md Phase 2. A treasurer-triggered batch action:
// accrue one period's interest on every open revolving loan in the group, inside a
// single session, idempotent per periodLabel (re-running the same month is a no-op
// for loans already accrued).

function round2(n) {
  return +Number(n).toFixed(2);
}

function currentPeriodLabel() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function hasAccruedForPeriod(loan, periodLabel) {
  return loan.entries.some(e => e.type === 'accrual' && e.periodLabel === periodLabel);
}

// GET — lists what a run would charge, without writing anything. Powers the
// confirmation screen (UI_SPEC.md §6.18) before the treasurer commits.
exports.previewMonthEndInterest = async (req, res) => {
  try {
    const settings = await getSettings(req.groupId);
    const periodLabel = req.query.periodLabel || currentPeriodLabel();
    const rate = settings.interestRate;
    const capitalise = settings.policies?.arrears === 'capitalise';

    const loans = await Loan.find({
      ...req.groupScope, accrualMode: 'revolving', fullyPaid: false, archived: { $ne: true }
    }).populate('userId', 'name');

    let totalInterest = 0;
    const rows = loans.map(loan => {
      const alreadyAccrued = hasAccruedForPeriod(loan, periodLabel);
      if (alreadyAccrued) {
        return { loanId: loan._id, member: loan.userId?.name, alreadyAccrued: true };
      }
      const principalBalance = loan.principalBalance || 0;
      const interestOutstanding = loan.interestOutstanding || 0;
      const willCapitalise = capitalise && interestOutstanding > 0;
      const principalAfterCapitalisation = willCapitalise ? round2(principalBalance + interestOutstanding) : principalBalance;
      const interestCharge = round2(principalAfterCapitalisation * (rate / 100));
      totalInterest += interestCharge;
      return {
        loanId: loan._id,
        member: loan.userId?.name,
        alreadyAccrued: false,
        currentPrincipal: principalBalance,
        currentInterestOutstanding: interestOutstanding,
        willCapitalise,
        capitalisedAmount: willCapitalise ? interestOutstanding : 0,
        interestCharge,
      };
    });

    res.json({
      periodLabel,
      rate,
      capitalise,
      count: rows.filter(r => !r.alreadyAccrued).length,
      totalInterest: round2(totalInterest),
      loans: rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to preview month-end interest', details: err.message });
  }
};

// POST — commits the run. Treasurer/admin only, matching other balance-moving actions.
exports.runMonthEndInterest = async (req, res) => {
  const allowedRoles = ['admin', 'treasurer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }

  const periodLabel = req.body.periodLabel || currentPeriodLabel();
  const session = await mongoose.startSession();

  try {
    let summary;
    await session.withTransaction(async () => {
      const settings = await getSettings(req.groupId);
      const strategy = resolveLoanAccrualStrategy(settings);
      const rate = settings.interestRate;
      const capitalise = settings.policies?.arrears === 'capitalise';

      const loans = await Loan.find({
        ...req.groupScope, accrualMode: 'revolving', fullyPaid: false, archived: { $ne: true }
      }).session(session);

      let accruedCount = 0;
      let skippedCount = 0;
      let totalInterest = 0;

      for (const loan of loans) {
        if (hasAccruedForPeriod(loan, periodLabel)) {
          skippedCount++;
          continue;
        }
        const { interestCharge } = strategy.accrue(loan, {
          periodLabel, rate, capitalise, recordedBy: req.memberId
        });
        totalInterest += interestCharge;
        accruedCount++;
        await loan.save({ session });
      }

      summary = { periodLabel, rate, accruedCount, skippedCount, totalInterest: round2(totalInterest) };
    });

    res.json({ message: 'Month-end interest run complete', ...summary });
  } catch (err) {
    res.status(500).json({ error: 'Failed to run month-end interest', details: err.message });
  } finally {
    await session.endSession();
  }
};
