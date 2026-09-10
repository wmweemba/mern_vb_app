const mongoose = require('mongoose');
const GroupMember = require('../models/GroupMember');
const GroupFund = require('../models/GroupFund');
const FundExpense = require('../models/FundExpense');
const { logTransaction } = require('./transactionController');

// Reserved fund keys. `app_subscription` is seeded for every group regardless of
// template — paying for Chama360 is a platform fact, not a group-model variation.
const SOCIAL_FUND_KEY = 'social_fund';
const APP_SUBSCRIPTION_KEY = 'app_subscription';

/**
 * Idempotent fund seeding. Safe to call on every group creation and from backfills.
 * Never resets an existing fund's balance or active flag.
 */
async function ensureFund(groupId, key, name, { active = true, isDefault = false, balance = 0, resetsOnCycle = true } = {}, session = null) {
  const existing = await GroupFund.findOne({ groupId, key }).session(session);
  if (existing) return existing;
  const [created] = await GroupFund.create([{ groupId, key, name, balance, active, isDefault, resetsOnCycle }], { session, ordered: true });
  return created;
}

/**
 * Adjust a fund's balance. Mirrors updateBankBalance, but targets a named pot.
 * BankBalance is never touched here — a null fundId means the main pool, and
 * callers route to updateBankBalance themselves in that case.
 */
async function updateFundBalance(fundId, amount, session = null) {
  const fund = await GroupFund.findById(fundId).session(session);
  if (!fund) throw Object.assign(new Error('Fund not found'), { status: 404 });
  let amt = Number(amount);
  if (isNaN(amt)) amt = 0;
  fund.balance += amt;
  await fund.save({ session });
  return fund.balance;
}

/** Resolve the group's social fund, for the deprecated /social-fund routes. */
async function getSocialFund(groupId, session = null) {
  return ensureFund(groupId, SOCIAL_FUND_KEY, 'Social Fund', {}, session);
}

exports.ensureFund = ensureFund;
exports.updateFundBalance = updateFundBalance;
exports.getSocialFund = getSocialFund;
exports.SOCIAL_FUND_KEY = SOCIAL_FUND_KEY;
exports.APP_SUBSCRIPTION_KEY = APP_SUBSCRIPTION_KEY;

exports.listFunds = async (req, res) => {
  try {
    const filter = { ...req.groupScope };
    if (req.query.active === 'true') filter.active = true;
    const funds = await GroupFund.find(filter).sort({ createdAt: 1 });
    res.json(funds);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list funds', details: err.message });
  }
};

exports.updateFund = async (req, res) => {
  const { name, active } = req.body;
  try {
    const fund = await GroupFund.findOne({ _id: req.params.id, ...req.groupScope });
    if (!fund) return res.status(404).json({ error: 'Fund not found' });
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
      fund.name = name.trim();
    }
    if (typeof active === 'boolean') fund.active = active;
    await fund.save();
    res.json(fund);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update fund', details: err.message });
  }
};

/**
 * Record a debit against a named fund. `fundId` in the body selects the pot;
 * omitting it falls back to the group's social fund so the deprecated
 * /social-fund/expense route keeps working unchanged.
 */
exports.recordExpense = async (req, res) => {
  const { amount, description, category, beneficiaryMemberId, beneficiaryName, fundId } = req.body;

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw Object.assign(new Error('Invalid amount'), { status: 400 });
      if (!description || !description.trim()) throw Object.assign(new Error('Description is required'), { status: 400 });

      const fund = fundId
        ? await GroupFund.findOne({ _id: fundId, ...req.groupScope }).session(session)
        : await getSocialFund(req.groupId, session);
      if (!fund) throw Object.assign(new Error('Fund not found'), { status: 404 });

      let beneficiary = null;
      if (beneficiaryMemberId) {
        beneficiary = await GroupMember.findOne({ _id: beneficiaryMemberId, ...req.groupScope, deletedAt: null }).session(session);
        if (!beneficiary) throw Object.assign(new Error('Beneficiary member not found'), { status: 404 });
      }

      // A pot cannot go negative — same guard the social fund always had.
      if (amt > fund.balance) {
        throw Object.assign(
          new Error(`Insufficient ${fund.name} balance (available K${fund.balance})`),
          { status: 400 }
        );
      }

      const [expense] = await FundExpense.create([{
        ...req.groupScope,
        fundId: fund._id,
        amount: amt,
        category: category || 'other',
        description: description.trim(),
        beneficiaryMemberId: beneficiary ? beneficiary._id : null,
        beneficiaryName: beneficiary ? null : (beneficiaryName || null),
        recordedBy: req.memberId,
      }], { session, ordered: true });

      // Transaction.userId is required — beneficiary if present, else the recorder.
      // Uses the generic fund_debit type; pre-existing social_fund_debit rows are
      // deliberately never rewritten.
      const tx = await logTransaction({
        userId: beneficiary ? beneficiary._id : req.memberId,
        type: 'fund_debit',
        amount: amt,
        referenceId: expense._id,
        note: `${fund.name} expense: ${description.trim()}`,
        groupId: req.groupId,
      }, session);

      await updateFundBalance(fund._id, -amt, session);

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
    const filter = { ...req.groupScope, archived: { $ne: true } };
    if (req.query.fundId) filter.fundId = req.query.fundId;
    const expenses = await FundExpense.find(filter)
      .populate('beneficiaryMemberId', 'name')
      .populate('recordedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list fund expenses', details: err.message });
  }
};
