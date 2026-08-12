const mongoose = require('mongoose');
const GroupMember = require('../models/GroupMember');
const Contribution = require('../models/Contribution');
const ContributionType = require('../models/ContributionType');
const { logTransaction } = require('./transactionController');
const { updateBankBalance } = require('./bankBalanceController');
const { updateSocialFundBalance } = require('./socialFundController');
const { resolveEntryDate } = require('../utils/cycleHelpers');

exports.recordContribution = async (req, res) => {
  const { username, userId, contributionTypeId, amount, note, affectsMainBalance, date } = req.body;

  // Backdating (a caller-supplied `date`) is restricted to admin/treasurer and
  // must fall within the currently open cycle — see
  // docs/plan_configurable_group_rules.md Phase 5.
  if (date && !['admin', 'treasurer'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admin or treasurer may backdate a contribution' });
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw Object.assign(new Error('Invalid amount'), { status: 400 });

      const contributionDate = await resolveEntryDate(req.groupId, date, session);

      // Resolve contributing member (accept either name or direct _id)
      let member;
      if (userId) {
        member = await GroupMember.findOne({ _id: userId, ...req.groupScope, active: true, deletedAt: null }).session(session);
      } else if (username) {
        member = await GroupMember.findOne({ name: username, ...req.groupScope, active: true, deletedAt: null }).session(session);
      }
      if (!member) throw Object.assign(new Error('Member not found'), { status: 404 });

      const type = await ContributionType.findOne({ _id: contributionTypeId, ...req.groupScope, active: true }).session(session);
      if (!type) throw Object.assign(new Error('Contribution type not found or inactive'), { status: 400 });

      const effectiveAffectsMain = typeof affectsMainBalance === 'boolean' ? affectsMainBalance : type.affectsMainBalance;
      const overrodeDefault = effectiveAffectsMain !== type.affectsMainBalance;

      const [contribution] = await Contribution.create([{
        ...req.groupScope,
        userId: member._id,
        contributionTypeId: type._id,
        typeName: type.name,
        amount: amt,
        affectsMainBalance: effectiveAffectsMain,
        overrodeDefault,
        countsTowardInterestObligation: type.countsTowardInterestObligation,
        note: note || null,
        recordedBy: req.memberId,
        date: contributionDate,
      }], { session });

      const tx = await logTransaction({
        userId: member._id,
        type: effectiveAffectsMain ? 'contribution' : 'social_fund_credit',
        amount: amt,
        referenceId: contribution._id,
        note: note || `${type.name} contribution`,
        groupId: req.groupId,
        createdAt: contributionDate,
      }, session);

      if (effectiveAffectsMain) {
        await updateBankBalance(amt, req.groupId, session);
      } else {
        await updateSocialFundBalance(amt, req.groupId, session);
      }

      contribution.transactionId = tx._id;
      await contribution.save({ session });

      result = contribution;
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.message });
  } finally {
    await session.endSession();
  }
};

exports.listContributions = async (req, res) => {
  try {
    const query = { ...req.groupScope, archived: { $ne: true } };
    if (req.role === 'member') query.userId = req.memberId;
    const contributions = await Contribution.find(query)
      .populate('userId', 'name')
      .populate('contributionTypeId', 'name affectsMainBalance')
      .populate('recordedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(contributions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list contributions', details: err.message });
  }
};
