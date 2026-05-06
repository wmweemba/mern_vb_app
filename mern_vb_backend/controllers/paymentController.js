const { updateBankBalance } = require('./bankBalanceController');
const { logTransaction } = require('./transactionController');
const GroupMember = require('../models/GroupMember');
const Fine = require('../models/Fine');
const Loan = require('../models/Loans');
const mongoose = require('mongoose');

exports.repayment = async (req, res) => {
  const { username, amount, note, loanId } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!username || !amount || amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Invalid username or amount' });
    }

    const paymentAmount = Number(amount);
    if (isNaN(paymentAmount)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Invalid payment amount' });
    }

    const member = await GroupMember.findOne({ name: username, ...req.groupScope, active: true, deletedAt: null }).session(session);
    if (!member) {
      await session.abortTransaction();
      return res.status(404).json({ error: `Member '${username}' not found` });
    }
    const userId = member._id;

    let loan;
    if (loanId) {
      loan = await Loan.findOne({ _id: loanId, userId, ...req.groupScope, archived: { $ne: true } }).session(session);
    } else {
      loan = await Loan.findOne({ userId, ...req.groupScope, fullyPaid: false, archived: { $ne: true } })
        .sort({ createdAt: -1 })
        .session(session);
    }
    if (!loan) {
      await session.abortTransaction();
      return res.status(404).json({ error: `No active loan found for member '${username}'` });
    }

    const nextInstallment = loan.installments.find(inst => !inst.paid);
    if (!nextInstallment) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'All loan installments are already paid' });
    }

    let installmentsToUpdate = [];
    let currentInstallment = nextInstallment;
    let remainingPayment = paymentAmount;

    let idx = loan.installments.findIndex(inst => inst.month === currentInstallment.month);
    while (remainingPayment > 0 && idx < loan.installments.length) {
      const inst = loan.installments[idx];
      if (!inst.paid) {
        const currentPaid = inst.paidAmount || 0;
        const amountNeeded = inst.total - currentPaid;
        const paymentForThis = Math.min(remainingPayment, amountNeeded);

        installmentsToUpdate.push({
          index: idx,
          newPaidAmount: currentPaid + paymentForThis,
          willBePaid: (currentPaid + paymentForThis) >= inst.total,
          paymentApplied: paymentForThis
        });

        remainingPayment -= paymentForThis;
        if (remainingPayment <= 0) break;
      }
      idx++;
    }

    if (installmentsToUpdate.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'No installments available for payment' });
    }

    installmentsToUpdate.forEach(update => {
      const installment = loan.installments[update.index];
      installment.paidAmount = update.newPaidAmount;
      if (update.willBePaid) {
        installment.paid = true;
        installment.paymentDate = new Date();
      }
    });

    const allPaid = loan.installments.every(inst => inst.paid);
    if (allPaid) {
      loan.fullyPaid = true;
    }

    await loan.save({ session });
    await updateBankBalance(paymentAmount, req.groupId, session);
    await logTransaction({
      userId,
      type: 'loan_payment',
      amount: paymentAmount,
      note: note || `Payment for ${installmentsToUpdate.length} installment(s)`,
      referenceId: loan._id,
      groupId: req.groupId
    }, session);

    await session.commitTransaction();

    const paidInstallments = installmentsToUpdate.map(update => ({
      month: loan.installments[update.index].month,
      amount: update.paymentApplied,
      paid: update.willBePaid
    }));

    res.json({
      message: 'Loan payment recorded successfully',
      paymentAmount,
      installmentsPaid: paidInstallments,
      loanFullyPaid: allPaid,
      loan
    });

  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({
      error: 'Failed to process loan payment',
      details: err.message,
      username,
      amount
    });
  } finally {
    await session.endSession();
  }
};

exports.payout = async (req, res) => {
  const { userId, amount, note } = req.body;
  try {
    await updateBankBalance(-amount, req.groupId);
    await logTransaction({ userId, type: 'payout', amount, note, groupId: req.groupId });
    res.json({ message: 'Payout recorded', amount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record payout', details: err.message });
  }
};

exports.fine = async (req, res) => {
  const { username, amount, note } = req.body;
  try {
    const member = await GroupMember.findOne({ name: username, ...req.groupScope, active: true, deletedAt: null });
    if (!member) return res.status(400).json({ error: 'Member not found' });
    const fine = await Fine.create({
      ...req.groupScope,
      userId: member._id,
      username,
      amount,
      note,
      issuedBy: req.memberId,
    });
    res.json({ message: 'Fine/Penalty issued', fine });
  } catch (err) {
    res.status(500).json({ error: 'Failed to issue fine/penalty', details: err.message });
  }
};

exports.payFine = async (req, res) => {
  const { fineId } = req.body;
  try {
    const fine = await Fine.findOne({ _id: fineId, ...req.groupScope });
    if (!fine) return res.status(404).json({ error: 'Fine not found' });
    if (fine.paid) return res.status(400).json({ error: 'Fine already paid' });
    fine.paid = true;
    fine.paidAt = new Date();
    const transaction = await logTransaction({
      userId: fine.userId,
      type: 'fine',
      amount: fine.amount,
      note: fine.note || 'Fine payment',
      groupId: req.groupId
    });
    fine.paymentTransactionId = transaction?._id;
    await fine.save();
    await updateBankBalance(fine.amount, req.groupId);
    res.json({ message: 'Fine paid successfully', fine });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pay fine', details: err.message });
  }
};

exports.getUnpaidFines = async (req, res) => {
  try {
    const fines = await Fine.find({ ...req.groupScope, paid: false })
      .populate('userId', 'name');
    res.json(fines);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unpaid fines' });
  }
};

exports.deleteAllFines = async (req, res) => {
  try {
    await Fine.deleteMany({ ...req.groupScope });
    res.json({ message: 'All fines deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete fines' });
  }
};

// Get all fines — officers/admin see all; members see only their own
exports.getAllFines = async (req, res) => {
  try {
    let query = { ...req.groupScope, archived: { $ne: true } };
    if (req.role === 'member') {
      query.userId = req.memberId;
    }
    const fines = await Fine.find(query)
      .populate('userId', 'name')
      .populate('issuedBy', 'name')
      .sort({ issuedAt: -1 });
    res.json(fines);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fines', details: err.message });
  }
};

// Edit a fine — only allowed when unpaid and not cancelled
exports.editFine = async (req, res) => {
  const { fineId } = req.params;
  const { amount, note } = req.body;
  try {
    const fine = await Fine.findOne({ _id: fineId, ...req.groupScope });
    if (!fine) return res.status(404).json({ error: 'Fine not found' });
    if (fine.paid) return res.status(400).json({ error: 'Cannot edit a paid fine' });
    if (fine.cancelled) return res.status(400).json({ error: 'Cannot edit a cancelled fine' });
    if (amount !== undefined) fine.amount = Number(amount);
    if (note !== undefined) fine.note = note;
    await fine.save();
    res.json({ message: 'Fine updated successfully', fine });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update fine', details: err.message });
  }
};

// Void/cancel a fine — keeps audit trail; reverses bank balance if fine was already paid
exports.voidFine = async (req, res) => {
  const { fineId } = req.params;
  const { cancelReason } = req.body;
  if (!cancelReason || !cancelReason.trim()) {
    return res.status(400).json({ error: 'A cancel reason is required to void a fine' });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const fine = await Fine.findOne({ _id: fineId, ...req.groupScope }).session(session);
      if (!fine) throw Object.assign(new Error('Fine not found'), { status: 404 });
      if (fine.cancelled) throw Object.assign(new Error('Fine is already cancelled'), { status: 400 });

      if (fine.paid) {
        await updateBankBalance(-fine.amount, req.groupId, session);
        await logTransaction({
          userId: fine.userId,
          type: 'fine',
          amount: -fine.amount,
          referenceId: fine._id,
          note: `Fine voided: ${cancelReason}. Original amount K${fine.amount} reversed.`,
          groupId: req.groupId
        }, session);
      }

      fine.cancelled = true;
      fine.cancelledAt = new Date();
      fine.cancelReason = cancelReason.trim();
      await fine.save({ session });

      res.json({ message: 'Fine voided successfully', fine });
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to void fine', details: err.message });
  } finally {
    await session.endSession();
  }
};

// Permanently delete a fine — reverses bank balance if fine was paid
exports.deleteFine = async (req, res) => {
  const { fineId } = req.params;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const fine = await Fine.findOne({ _id: fineId, ...req.groupScope }).session(session);
      if (!fine) throw Object.assign(new Error('Fine not found'), { status: 404 });

      if (fine.paid && !fine.cancelled) {
        await updateBankBalance(-fine.amount, req.groupId, session);
        await logTransaction({
          userId: fine.userId,
          type: 'fine',
          amount: -fine.amount,
          referenceId: fine._id,
          note: `Fine permanently deleted - payment of K${fine.amount} reversed.`,
          groupId: req.groupId
        }, session);
      }

      await Fine.findByIdAndDelete(fineId).session(session);
      res.json({ message: 'Fine deleted successfully' });
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to delete fine', details: err.message });
  } finally {
    await session.endSession();
  }
};
