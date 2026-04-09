const { Parser } = require('json2csv');
require('jspdf-autotable');
const GroupMember = require('../models/GroupMember');
const BankBalance = require('../models/BankBalance');
const Transaction = require('../models/Transaction');

exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ ...req.groupScope, archived: { $ne: true } })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve transactions', details: err.message });
  }
};

exports.getTransactionsByUser = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      userId: req.params.userId,
      ...req.groupScope,
      archived: { $ne: true }
    }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user transactions', details: err.message });
  }
};

exports.logTransaction = async ({ userId, type, amount, referenceId, note, groupId }, session = null) => {
  try {
    const transaction = new Transaction({ userId, type, amount, referenceId, note, groupId });
    await transaction.save({ session });
    return transaction;
  } catch (err) {
    console.error('Transaction log failed:', err.message);
    throw err; // Re-throw to ensure transaction fails if logging fails
  }
};

exports.exportTransactionsReport = async (req, res) => {
  try {
    const transactions = await Transaction.find({ ...req.groupScope, archived: { $ne: true } })
      .populate('userId', 'name')
      .sort({ createdAt: 1 });
    const data = transactions.map(t => ({
      Name: t.userId?.name || '',
      Type: t.type,
      Amount: t.amount,
      Note: t.note,
      Date: t.createdAt ? t.createdAt.toISOString().split('T')[0] : ''
    }));
    // Get closing balance
    let closingBalance = 0;
    const bankDoc = await BankBalance.findOne({ groupId: req.groupId });
    if (bankDoc) closingBalance = bankDoc.balance;
    const parser = new Parser();
    const csv = parser.parse(data);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions_report.csv"');
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export transactions report', details: err.message });
  }
};
