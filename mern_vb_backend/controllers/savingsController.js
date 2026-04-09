const Saving = require('../models/Savings');
const Loan = require('../models/Loans');
const GroupMember = require('../models/GroupMember');
const { logTransaction } = require('./transactionController');
const { updateBankBalance } = require('./bankBalanceController');
const { getSettings } = require('./groupSettingsController');
const { Parser } = require('json2csv');

exports.createSaving = async (req, res) => {
  const { username, month, amount, date } = req.body;
  try {
    const settings = await getSettings(req.groupId);

    const member = await GroupMember.findOne({ name: username, ...req.groupScope });
    if (!member) return res.status(400).json({ error: 'Member not found' });
    const userId = member._id;

    const savingDate = date ? new Date(date) : new Date();

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
      groupId: req.groupId
    });
    await updateBankBalance(amount, req.groupId);
    res.status(201).json(saving);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save contribution', details: err.message });
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
      const member = await GroupMember.findOne({ name: updates.username, ...req.groupScope });
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

exports.getDashboardStats = async (req, res) => {
  try {
    const savingsAgg = await Saving.aggregate([
      { $match: { groupId: req.groupId, archived: { $ne: true } } },
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
      totalLoaned += loan.amount;
      if (Array.isArray(loan.installments)) {
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
