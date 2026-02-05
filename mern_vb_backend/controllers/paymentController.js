const { updateBankBalance } = require('./bankBalanceController');
const { logTransaction } = require('./transactionController');
const User = require('../models/User');
const Fine = require('../models/Fine');
const Loan = require('../models/Loans');
const mongoose = require('mongoose');

// exports.repayment = async (req, res) => {
//   const { userId, amount, note } = req.body;
//   try {
//     await updateBankBalance(amount); // Credit
//     await logTransaction({ userId, type: 'repayment', amount, note });
//     res.json({ message: 'Repayment recorded', amount });
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to record repayment', details: err.message });
//   }
// };

exports.repayment = async (req, res) => {
  const { username, amount, note } = req.body;

  // Use MongoDB session for atomic transactions
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validate inputs
    if (!username || !amount || amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Invalid username or amount' });
    }

    const paymentAmount = Number(amount);
    if (isNaN(paymentAmount)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Invalid payment amount' });
    }

    // 2. Find user by username (with session)
    const user = await User.findOne({ username }).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ error: `User '${username}' not found` });
    }
    const userId = user._id;

    // 3. Find active loan (with session)
    const loan = await Loan.findOne({ userId, fullyPaid: false }).session(session);
    if (!loan) {
      await session.abortTransaction();
      return res.status(404).json({ error: `No active loan found for user '${username}'` });
    }

    // 4. Find next unpaid or partially paid installment
    const nextInstallment = loan.installments.find(inst => !inst.paid);
    if (!nextInstallment) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'All loan installments are already paid' });
    }

    // 5. Calculate payment effects (validation only - no database changes yet)
    let installmentsToUpdate = [];
    let currentInstallment = nextInstallment;
    let remainingPayment = paymentAmount;
    
    // Calculate which installments will be affected
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

    // 6. ATOMIC OPERATIONS - All database changes in single transaction
    
    // Update loan installments first (most likely to fail)
    installmentsToUpdate.forEach(update => {
      const installment = loan.installments[update.index];
      installment.paidAmount = update.newPaidAmount;
      if (update.willBePaid) {
        installment.paid = true;
        installment.paymentDate = new Date();
      }
    });

    // Update loan fullyPaid status
    const allPaid = loan.installments.every(inst => inst.paid);
    if (allPaid) {
      loan.fullyPaid = true;
    }

    // Save loan (with session)
    await loan.save({ session });

    // Update bank balance (with session)
    await updateBankBalance(paymentAmount, session);

    // Log transaction (with session) 
    await logTransaction({ 
      userId, 
      type: 'loan_payment', 
      amount: paymentAmount, 
      note: note || `Payment for ${installmentsToUpdate.length} installment(s)`,
      referenceId: loan._id 
    }, session);

    // Commit the transaction - all or nothing
    await session.commitTransaction();

    // Build success response
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
    // Abort transaction on any error
    await session.abortTransaction();
    console.error('Payment processing error:', err);
    
    // Return specific error message
    res.status(500).json({ 
      error: 'Failed to process loan payment', 
      details: err.message,
      username,
      amount: paymentAmount 
    });
  } finally {
    // Always end the session
    await session.endSession();
  }
};

exports.payout = async (req, res) => {
  const { userId, amount, note } = req.body;
  try {
    await updateBankBalance(-amount); // Debit
    await logTransaction({ userId, type: 'payout', amount, note });
    res.json({ message: 'Payout recorded', amount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record payout', details: err.message });
  }
};

exports.fine = async (req, res) => {
  const { username, amount, note } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });
    const fine = await Fine.create({
      userId: user._id,
      username,
      amount,
      note,
      issuedBy: req.user.id,
    });
    res.json({ message: 'Fine/Penalty issued', fine });
  } catch (err) {
    res.status(500).json({ error: 'Failed to issue fine/penalty', details: err.message });
  }
};

exports.payFine = async (req, res) => {
  const { fineId } = req.body;
  try {
    const fine = await Fine.findById(fineId);
    if (!fine) return res.status(404).json({ error: 'Fine not found' });
    if (fine.paid) return res.status(400).json({ error: 'Fine already paid' });
    fine.paid = true;
    fine.paidAt = new Date();
    // Log transaction and update bank balance
    const transaction = await logTransaction({
      userId: fine.userId,
      type: 'fine',
      amount: fine.amount,
      note: fine.note || 'Fine payment',
    });
    fine.paymentTransactionId = transaction?._id;
    await fine.save();
    await updateBankBalance(fine.amount);
    res.json({ message: 'Fine paid successfully', fine });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pay fine', details: err.message });
  }
};

exports.getUnpaidFines = async (req, res) => {
  try {
    const fines = await Fine.find({ paid: false }).populate('userId', 'username name');
    res.json(fines);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unpaid fines' });
  }
};

exports.deleteAllFines = async (req, res) => {
  try {
    await require('../models/Fine').deleteMany({});
    res.json({ message: 'All fines deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete fines' });
  }
}; 