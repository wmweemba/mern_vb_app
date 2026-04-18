const Threshold = require('../models/Threshold');
const Loan = require('../models/Loans');
const GroupMember = require('../models/GroupMember');
const { Parser } = require('json2csv');

exports.createThreshold = async (req, res) => {
  const { cycle, startMonth, totalBankBalance, retainedAmount, prepaidInterest, totalMembers } = req.body;
  try {
    const thresholdPerMember = +((totalBankBalance - retainedAmount - prepaidInterest) / totalMembers).toFixed(2);

    const threshold = new Threshold({
      ...req.groupScope,
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
    const latest = await Threshold.findOne({ ...req.groupScope }).sort({ createdAt: -1 });
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch threshold', details: err.message });
  }
};

exports.getThresholdDefaulters = async (req, res) => {
  try {
    const threshold = await Threshold.findOne({ ...req.groupScope }).sort({ createdAt: -1 });
    if (!threshold) return res.status(404).json({ error: 'No threshold found' });

    const members = await GroupMember.find({ ...req.groupScope, active: true, deletedAt: null }, '_id name email');
    const loans = await Loan.find({ ...req.groupScope });

    const result = members.map(member => {
      const memberLoans = loans.filter(l => l.userId.toString() === member._id.toString());
      const totalLoan = memberLoans.reduce((sum, l) => sum + l.amount, 0);
      const forcedLoan = +(threshold.thresholdPerMember - totalLoan).toFixed(2);

      return {
        userId: member._id,
        name: member.name,
        email: member.email,
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
    const threshold = await Threshold.findOne({ ...req.groupScope }).sort({ createdAt: -1 });
    const members = await GroupMember.find({ ...req.groupScope, active: true, deletedAt: null }, '_id name email');
    const loans = await Loan.find({ ...req.groupScope });

    const result = members.map(member => {
      const memberLoans = loans.filter(l => l.userId.toString() === member._id.toString());
      const totalLoan = memberLoans.reduce((sum, l) => sum + l.amount, 0);
      const forcedLoan = +(threshold.thresholdPerMember - totalLoan).toFixed(2);

      return {
        Name: member.name,
        Email: member.email,
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
