const { updateBankBalance } = require('./bankBalanceController');
const { logTransaction } = require('./transactionController');
const User = require('../models/User');
const Fine = require('../models/Fine');
const Loan = require('../models/Loans');

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

  try {
    // 1. Find user by username
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const userId = user._id;

    // 2. Update bank balance
    await updateBankBalance(amount);

    // 3. Log transaction
    await logTransaction({ userId, type: 'repayment', amount, note });

    // 4. Find active loan
    const loan = await Loan.findOne({ userId, fullyPaid: false });
    if (!loan) return res.status(404).json({ error: 'No active loan found for this user' });

    // 5. Find next unpaid installment
    const nextInstallment = loan.installments.find(inst => !inst.paid);
    if (!nextInstallment) {
      loan.fullyPaid = true;
      await loan.save();
      return res.status(400).json({ error: 'All installments already paid' });
    }

    const expectedTotal = nextInstallment.total;

    if (amount >= expectedTotal) {
      nextInstallment.paid = true;
      nextInstallment.paymentDate = new Date();
    } else {
      return res.status(400).json({ error: `Insufficient amount. Expected at least K${expectedTotal}` });
    }

    // 6. Mark loan as fully paid if all done
    if (loan.installments.every(inst => inst.paid)) {
      loan.fullyPaid = true;
    }

    await loan.save();

    res.json({ message: 'Repayment recorded and loan updated', loan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record repayment', details: err.message });
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