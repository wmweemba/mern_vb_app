const Threshold = require('../models/Threshold');
const Loan = require('../models/Loan');
const User = require('../models/User');
const { Parser } = require('json2csv');

exports.createThreshold = async (req, res) => {
  const { cycle, startMonth, totalBankBalance, retainedAmount, prepaidInterest, totalMembers } = req.body;
  try {
    const thresholdPerMember = +((totalBankBalance - retainedAmount - prepaidInterest) / totalMembers).toFixed(2);

    const threshold = new Threshold({
      cycle,
      startMonth,
      totalBankBalance,
      retainedAmount,
      prepaidInterest,
      totalMembers,
      thresholdPerMember
    });

    await threshold.save();
    res.status(201).json(threshold);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create threshold', details: err.message });
  }
};

exports.getLatestThreshold = async (req, res) => {
  try {
    const latest = await Threshold.findOne().sort({ createdAt: -1 });
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch threshold', details: err.message });
  }
};

exports.getThresholdDefaulters = async (req, res) => {
  try {
    const threshold = await Threshold.findOne().sort({ createdAt: -1 });
    if (!threshold) return res.status(404).json({ error: 'No threshold found' });

    const users = await User.find({}, '_id name username email');
    const loans = await Loan.find();

    const result = users.map(user => {
      const userLoans = loans.filter(l => l.userId.toString() === user._id.toString());
      const totalLoan = userLoans.reduce((sum, l) => sum + l.amount, 0);
      const forcedLoan = +(threshold.thresholdPerMember - totalLoan).toFixed(2);

      return {
        userId: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        totalLoanObtained: totalLoan,
        threshold: threshold.thresholdPerMember,
        forcedLoan: forcedLoan > 0 ? forcedLoan : 0
      };
    }).filter(u => u.forcedLoan > 0);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate defaulter report', details: err.message });
  }
};

exports.exportThresholdDefaulters = async (req, res) => {
  try {
    const threshold = await Threshold.findOne().sort({ createdAt: -1 });
    const users = await User.find({}, '_id name username email');
    const loans = await Loan.find();

    const result = users.map(user => {
      const userLoans = loans.filter(l => l.userId.toString() === user._id.toString());
      const totalLoan = userLoans.reduce((sum, l) => sum + l.amount, 0);
      const forcedLoan = +(threshold.thresholdPerMember - totalLoan).toFixed(2);

      return {
        Name: user.name,
        Username: user.username,
        Email: user.email,
        TotalLoanObtained: totalLoan,
        Threshold: threshold.thresholdPerMember,
        ForcedLoan: forcedLoan > 0 ? forcedLoan : 0
      };
    }).filter(u => u.ForcedLoan > 0);

    const parser = new Parser();
    const csv = parser.parse(result);

    res.header('Content-Type', 'text/csv');
    res.attachment('threshold_defaulters_report.csv');
    return res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export defaulters', details: err.message });
  }
};