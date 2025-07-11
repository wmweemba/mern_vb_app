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