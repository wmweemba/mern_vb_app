const mongoose = require('mongoose');
const GroupMember = require('../models/GroupMember');
const SocialFundBalance = require('../models/SocialFundBalance');
const SocialFundExpense = require('../models/SocialFundExpense');
const { logTransaction } = require('./transactionController');

// Internal helper — mirrors updateBankBalance but targets SocialFundBalance.
// Creates the document if missing (same defensive pattern as bankBalanceController).
exports.updateSocialFundBalance = async (amount, groupId, session = null) => {
  let doc = await SocialFundBalance.findOne({ groupId }).session(session);
  if (!doc) {
    const created = await SocialFundBalance.create([{ balance: 0, groupId }], { session });
    doc = created[0];
  }
  amount = Number(amount);
  if (isNaN(amount)) amount = 0;
  doc.balance += amount;
  await doc.save({ session });
  return doc.balance;
};

exports.getBalance = async (req, res) => {
  try {
    let doc = await SocialFundBalance.findOne({ groupId: req.groupId });
    if (!doc) {
      doc = await SocialFundBalance.create({ balance: 0, groupId: req.groupId });
    }
    res.json({ balance: doc.balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch social fund balance', details: err.message });
  }
};

exports.recordExpense = async (req, res) => {
  const { amount, description, category, beneficiaryMemberId, beneficiaryName } = req.body;

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw Object.assign(new Error('Invalid amount'), { status: 400 });
      if (!description || !description.trim()) throw Object.assign(new Error('Description is required'), { status: 400 });

      let beneficiary = null;
      if (beneficiaryMemberId) {
        beneficiary = await GroupMember.findOne({ _id: beneficiaryMemberId, ...req.groupScope, deletedAt: null }).session(session);
        if (!beneficiary) throw Object.assign(new Error('Beneficiary member not found'), { status: 404 });
      }

      // Guard against overspend — social fund balance cannot go negative
      const sf = await SocialFundBalance.findOne({ groupId: req.groupId }).session(session);
      const currentBalance = sf ? sf.balance : 0;
      if (amt > currentBalance) {
        throw Object.assign(
          new Error(`Insufficient social fund balance (available K${currentBalance})`),
          { status: 400 }
        );
      }

      const [expense] = await SocialFundExpense.create([{
        ...req.groupScope,
        amount: amt,
        category: category || 'other',
        description: description.trim(),
        beneficiaryMemberId: beneficiary ? beneficiary._id : null,
        beneficiaryName: beneficiary ? null : (beneficiaryName || null),
        recordedBy: req.memberId,
      }], { session });

      // Transaction.userId must be set — use beneficiary if present, otherwise recorder
      const tx = await logTransaction({
        userId: beneficiary ? beneficiary._id : req.memberId,
        type: 'social_fund_debit',
        amount: amt,
        referenceId: expense._id,
        note: `Social fund expense: ${description.trim()}`,
        groupId: req.groupId,
      }, session);

      await exports.updateSocialFundBalance(-amt, req.groupId, session);

      expense.transactionId = tx._id;
      await expense.save({ session });

      result = expense;
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.message });
  } finally {
    await session.endSession();
  }
};

exports.listExpenses = async (req, res) => {
  try {
    const expenses = await SocialFundExpense.find({ ...req.groupScope, archived: { $ne: true } })
      .populate('beneficiaryMemberId', 'name')
      .populate('recordedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list social fund expenses', details: err.message });
  }
};
