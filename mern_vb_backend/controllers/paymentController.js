const { updateBankBalance } = require('./bankBalanceController');
const { logTransaction } = require('./transactionController');

exports.repayment = async (req, res) => {
  const { userId, amount, note } = req.body;
  try {
    await updateBankBalance(amount); // Credit
    await logTransaction({ userId, type: 'repayment', amount, note });
    res.json({ message: 'Repayment recorded', amount });
  } catch (err) {
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