const mongoose = require('mongoose');
const Saving = require('../models/Savings');
const Loan = require('../models/Loans');
const GroupMember = require('../models/GroupMember');
const { logTransaction } = require('./transactionController');
const { updateBankBalance } = require('./bankBalanceController');
const { getSettings } = require('./groupSettingsController');
const { resolveEntryDate } = require('../utils/cycleHelpers');
const { Parser } = require('json2csv');

exports.createSaving = async (req, res) => {
  const { username, month, amount, date } = req.body;
  try {
    const settings = await getSettings(req.groupId);

    const member = await GroupMember.findOne({ name: username, ...req.groupScope, active: true, deletedAt: null });
    if (!member) return res.status(400).json({ error: 'Member not found' });
    const userId = member._id;

    // Backdating (a caller-supplied `date`) is restricted to admin/treasurer and
    // must fall within the currently open cycle — see
    // docs/plan_configurable_group_rules.md Phase 5. Any allowed role may still
    // record a savings entry dated "now".
    if (date && !['admin', 'treasurer'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admin or treasurer may backdate a savings entry' });
    }
    const savingDate = await resolveEntryDate(req.groupId, date);

    let fine = 0;
    let interest = +(amount * (settings.savingsInterestRate / 100)).toFixed(2);

    if (month === 1 && amount < settings.minimumSavingsMonth1) fine = settings.savingsShortfallFine;
    else if (month > 1 && amount < settings.minimumSavingsMonthly) fine = settings.savingsShortfallFine;
    else if (month <= 3 && amount > settings.maximumSavingsFirst3Months) return res.status(400).json({ error: `Cannot save more than K${settings.maximumSavingsFirst3Months.toLocaleString()} in the first 3 months` });

    const saving = new Saving({
      ...req.groupScope,
      userId,
      month,
      amount,
      date: savingDate,
      fine,
      interestEarned: interest
    });

    await saving.save();
    await logTransaction({
      userId,
      type: 'saving',
      amount,
      referenceId: saving._id,
      note: `Savings of K${amount} for month ${month}.`,
      groupId: req.groupId,
      createdAt: savingDate,
    });
    await updateBankBalance(amount, req.groupId);
    res.status(201).json(saving);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to save contribution', details: err.message });
  }
};

exports.getSavingsByUser = async (req, res) => {
  try {
    const savings = await Saving.find({ userId: req.params.id, ...req.groupScope, archived: { $ne: true } });
    res.json(savings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch savings' });
  }
};

exports.getAllSavings = async (req, res) => {
  try {
    const savings = await Saving.find({ ...req.groupScope, archived: { $ne: true } })
      .populate('userId', 'name email');
    res.json(savings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all savings' });
  }
};

// Update savings entry (admin, loan_officer, treasurer only)
exports.updateSaving = async (req, res) => {
  const { savingId } = req.params;
  const updates = req.body;
  const allowedRoles = ['admin', 'loan_officer', 'treasurer'];

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }

  try {
    const saving = await Saving.findOne({ _id: savingId, ...req.groupScope });
    if (!saving) return res.status(404).json({ error: 'Savings entry not found' });

    const originalAmount = saving.amount;
    const newAmount = updates.amount || originalAmount;
    const amountDifference = newAmount - originalAmount;

    if (updates.username) {
      const member = await GroupMember.findOne({ name: updates.username, ...req.groupScope, active: true, deletedAt: null });
      if (!member) return res.status(400).json({ error: 'Member not found' });
      updates.userId = member._id;
      delete updates.username;
    }

    if (updates.amount !== undefined || updates.month !== undefined) {
      const settings = await getSettings(req.groupId);
      const month = updates.month || saving.month;
      const amount = updates.amount || saving.amount;

      let fine = 0;
      let interest = +(amount * (settings.savingsInterestRate / 100)).toFixed(2);

      if (month === 1 && amount < settings.minimumSavingsMonth1) fine = settings.savingsShortfallFine;
      else if (month > 1 && amount < settings.minimumSavingsMonthly) fine = settings.savingsShortfallFine;
      else if (month <= 3 && amount > settings.maximumSavingsFirst3Months) {
        return res.status(400).json({ error: `Cannot save more than K${settings.maximumSavingsFirst3Months.toLocaleString()} in the first 3 months` });
      }

      updates.fine = fine;
      updates.interestEarned = interest;
    }

    Object.keys(updates).forEach(key => {
      if (saving[key] !== undefined) {
        saving[key] = updates[key];
      }
    });

    await saving.save();

    if (amountDifference !== 0) {
      await updateBankBalance(amountDifference, req.groupId);
      await logTransaction({
        userId: saving.userId,
        type: 'saving',
        amount: amountDifference,
        referenceId: saving._id,
        note: `Savings adjustment: ${amountDifference > 0 ? '+' : ''}K${Math.abs(amountDifference)} for month ${saving.month}.`,
        groupId: req.groupId
      });
    }

    const populatedSaving = await Saving.findById(savingId).populate('userId', 'name email');
    res.json({ message: 'Savings updated successfully', saving: populatedSaving });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update savings', details: err.message });
  }
};

// Reverse a wrong savings entry — keeps audit trail; reverses bank balance and
// logs an offsetting Transaction. Mirrors paymentController.voidFine.
exports.reverseSaving = async (req, res) => {
  const { savingId } = req.params;
  const { cancelReason } = req.body;
  if (!cancelReason || !cancelReason.trim()) {
    return res.status(400).json({ error: 'A cancel reason is required to reverse a savings entry' });
  }

  const session = await mongoose.startSession();
  try {
    let saving;
    await session.withTransaction(async () => {
      saving = await Saving.findOne({ _id: savingId, ...req.groupScope }).session(session);
      if (!saving) throw Object.assign(new Error('Savings entry not found'), { status: 404 });
      if (saving.cancelled) throw Object.assign(new Error('Savings entry is already reversed'), { status: 400 });
      if (saving.archived) throw Object.assign(new Error('Cannot reverse a savings entry from a closed cycle'), { status: 400 });

      // Only `amount` was ever added to the bank balance at creation/update time
      // (see createSaving/updateSaving) — `fine` is descriptive-only on this record
      // and must not be included in the reversal.
      await updateBankBalance(-saving.amount, req.groupId, session);
      await logTransaction({
        userId: saving.userId,
        type: 'saving',
        amount: -saving.amount,
        referenceId: saving._id,
        note: `Savings entry reversed: ${cancelReason}. Original amount K${saving.amount} reversed.`,
        groupId: req.groupId
      }, session);

      saving.cancelled = true;
      saving.cancelledAt = new Date();
      saving.cancelledBy = req.memberId;
      saving.cancelReason = cancelReason.trim();
      await saving.save({ session });
    });
    // Responding only after withTransaction resolves guarantees the commit has
    // actually landed — res.json() called from inside the callback can reach the
    // client before commitTransaction() finishes, letting an immediate re-fetch
    // race the write and see stale (pre-reversal) balances.
    res.json({ message: 'Savings entry reversed successfully', saving });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to reverse savings entry', details: err.message });
  } finally {
    await session.endSession();
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const savingsAgg = await Saving.aggregate([
      { $match: { groupId: req.groupId, archived: { $ne: true }, cancelled: { $ne: true } } },
      {
        $group: {
          _id: null,
          totalSaved: { $sum: '$amount' },
          totalInterestSavings: { $sum: '$interestEarned' }
        }
      }
    ]);
    const totalSaved = savingsAgg[0]?.totalSaved || 0;
    const totalInterestSavings = savingsAgg[0]?.totalInterestSavings || 0;

    const loans = await Loan.find({ groupId: req.groupId, archived: { $ne: true } });
    let totalLoaned = 0;
    let totalInterestLoans = 0;
    loans.forEach(loan => {
      // Revolving loans are topped up on their single Loan document rather than
      // getting a new one each time (loanController.createLoan) — loan.amount is
      // only ever the member's first disbursement and never reflects later top-ups.
      // principalBalance + interestOutstanding is the loan's real current total.
      totalLoaned += loan.accrualMode === 'revolving'
        ? (loan.principalBalance || 0) + (loan.interestOutstanding || 0)
        : loan.amount;
      // installments[].interest is charged across the whole schedule regardless of
      // paid status, so this is total interest charged, not total interest collected.
      // Revolving loans have no installments — the equivalent is each period's
      // 'accrual' entry (utils/strategies/loanAccrual/revolvingMonthly.js), which is
      // likewise charged whether or not it's later paid. In-month interest charges
      // (recorded at payment time, before Month-End runs) are also included; their
      // negated reversal entries net out automatically.
      if (loan.accrualMode === 'revolving') {
        if (Array.isArray(loan.entries)) {
          totalInterestLoans += loan.entries
            .filter(e => e.type === 'accrual' || e.type === 'interest_charge')
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        }
      } else if (Array.isArray(loan.installments)) {
        totalInterestLoans += loan.installments.reduce((sum, inst) => sum + (inst.interest || 0), 0);
      }
    });

    res.json({
      totalSaved,
      totalLoaned,
      totalInterestSavings,
      totalInterestLoans
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: err.message });
  }
};

exports.exportSavingsReport = async (req, res) => {
  try {
    const savings = await Saving.find({ ...req.groupScope, archived: { $ne: true } })
      .populate('userId', 'name email');
    const data = savings.map(s => ({
      Name: s.userId.name,
      Email: s.userId.email,
      Amount: s.amount,
      Month: s.month,
      Date: s.date,
      Fine: s.fine,
      InterestEarned: s.interestEarned
    }));

    const parser = new Parser();
    const csv = parser.parse(data);

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.header('Content-Type', 'text/csv');
    res.attachment('savings_report.csv');
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export savings report', details: err.message });
  }
};
