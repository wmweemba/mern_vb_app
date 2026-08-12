const mongoose = require('mongoose');
const { Parser } = require('json2csv');
const Loan = require('../models/Loans');
const Saving = require('../models/Savings');
const Fine = require('../models/Fine');
const Transaction = require('../models/Transaction');
const Contribution = require('../models/Contribution');
const SocialFundExpense = require('../models/SocialFundExpense');
const BankBalance = require('../models/BankBalance');
const SocialFundBalance = require('../models/SocialFundBalance');
const GroupMember = require('../models/GroupMember');
const GroupSettings = require('../models/GroupSettings');
const Cycle = require('../models/Cycle');
const { openCycle } = require('../utils/cycleHelpers');

// Begin new cycle - Reset all balances and generate backup reports
exports.beginNewCycle = async (req, res) => {
  const allowedRoles = ['admin', 'treasurer', 'loan_officer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }

  const session = await mongoose.startSession();
  try {
    // Read-only — safe to run ahead of the transaction.
    const backupReports = await generateBackupReports(req.groupId);

    let responsePayload;
    await session.withTransaction(async () => {
      const cycleEndDate = new Date();
      const openCycleDoc = await Cycle.findOne({ groupId: req.groupId, status: 'open' }).session(session);
      // Groups that predate Phase 5 have no Cycle document yet — fall back to the
      // transaction-note count they've always used, so their first reset under
      // this code still numbers correctly instead of restarting at 2.
      const previousCycleNumber = openCycleDoc ? openCycleDoc.cycleNumber : await getCurrentCycleNumber(req.groupId, session);
      const cycleNumber = previousCycleNumber + 1;

      await archiveCurrentCycleData(cycleEndDate, previousCycleNumber, req.groupId, session);
      await resetForNewCycle(req.groupId, session);
      await logCycleResetTransaction(req.memberId, cycleNumber, req.groupId, session);

      if (openCycleDoc) {
        openCycleDoc.status = 'closed';
        openCycleDoc.closedAt = cycleEndDate;
        openCycleDoc.endDate = cycleEndDate;
        await openCycleDoc.save({ session });
      }

      const settings = await GroupSettings.findOne({ groupId: req.groupId }).session(session);
      await openCycle({
        groupId: req.groupId,
        cycleNumber,
        startDate: cycleEndDate,
        cycleLengthMonths: settings.cycleLengthMonths,
        settings,
        session,
      });

      responsePayload = {
        message: `New cycle ${cycleNumber} has been successfully initiated`,
        cycleNumber,
        cycleStartDate: cycleEndDate,
        backupReports,
        resetData: {
          loansReset: true,
          savingsReset: true,
          finesCleared: true,
          contributionsReset: true,
          bankBalanceReset: true,
          socialFundBalanceReset: true,
        }
      };
    });

    res.json(responsePayload);

  } catch (error) {
    res.status(error.status || 500).json({
      error: 'Failed to begin new cycle',
      details: error.message
    });
  } finally {
    session.endSession();
  }
};

// Generate backup reports before reset
async function generateBackupReports(groupId) {
  try {
    const loans = await Loan.find({ groupId }).populate('userId', 'name');
    const loansData = [];

    loans.forEach(loan => {
      loan.installments.forEach(installment => {
        loansData.push({
          Name: loan.userId?.name || '',
          LoanAmount: loan.amount,
          Month: installment.month,
          Principal: installment.principal,
          Interest: installment.interest,
          Total: installment.total,
          PaidAmount: installment.paidAmount,
          Paid: installment.paid,
          PaymentDate: installment.paymentDate ? installment.paymentDate.toISOString().split('T')[0] : '',
          LateInterest: installment.penalties?.lateInterest || 0,
          OverdueFine: installment.penalties?.overdueFine || 0,
          EarlyPaymentCharge: installment.penalties?.earlyPaymentCharge || 0,
          LoanCreatedAt: loan.createdAt.toISOString().split('T')[0],
          FullyPaid: loan.fullyPaid
        });
      });
    });

    const savings = await Saving.find({ groupId }).populate('userId', 'name');
    const savingsData = savings.map(s => ({
      Name: s.userId?.name || '',
      Month: s.month,
      Amount: s.amount,
      Fine: s.fine,
      InterestEarned: s.interestEarned,
      Date: s.date.toISOString().split('T')[0]
    }));

    const transactions = await Transaction.find({ groupId }).populate('userId', 'name').sort({ createdAt: 1 });
    const transactionsData = transactions.map(t => ({
      Name: t.userId?.name || '',
      Type: t.type,
      Amount: t.amount,
      Note: t.note,
      Date: t.createdAt ? t.createdAt.toISOString().split('T')[0] : ''
    }));

    const fines = await Fine.find({ groupId }).populate('userId', 'name').populate('issuedBy', 'name');
    const finesData = fines.map(f => ({
      Name: f.userId?.name || '',
      Amount: f.amount,
      Note: f.note || '',
      IssuedBy: f.issuedBy?.name || '',
      IssuedAt: f.issuedAt.toISOString().split('T')[0],
      Paid: f.paid,
      PaidAt: f.paidAt ? f.paidAt.toISOString().split('T')[0] : ''
    }));

    const parser = new Parser();

    return {
      loansCSV: parser.parse(loansData),
      savingsCSV: parser.parse(savingsData),
      transactionsCSV: parser.parse(transactionsData),
      finesCSV: parser.parse(finesData),
      reportGeneratedAt: new Date().toISOString()
    };

  } catch (error) {
    throw new Error(`Failed to generate backup reports: ${error.message}`);
  }
}

// Archive current cycle data by adding cycle metadata. Scoped to
// `archived: { $ne: true }` (audit finding #3) — without it, a second reset
// re-stamps every already-archived record from cycle 1 with cycle 2's
// cycleNumber/cycleEndDate, silently rewriting history each time a new cycle
// begins. Contribution and SocialFundExpense (audit finding #4) previously
// weren't touched at all here, so their records never left the "current cycle"
// query scope after a reset.
async function archiveCurrentCycleData(cycleEndDate, cycleNumber, groupId, session) {
  try {
    const filter = { groupId, archived: { $ne: true } };
    const update = { $set: { cycleNumber, cycleEndDate, archived: true } };
    await Loan.updateMany(filter, update, { session });
    await Saving.updateMany(filter, update, { session });
    await Fine.updateMany(filter, update, { session });
    await Transaction.updateMany(filter, update, { session });
    await Contribution.updateMany(filter, update, { session });
    await SocialFundExpense.updateMany(filter, update, { session });
  } catch (error) {
    throw new Error(`Failed to archive cycle data: ${error.message}`);
  }
}

// Reset all data for new cycle
async function resetForNewCycle(groupId, session) {
  try {
    const filter = { groupId, archived: { $ne: true } };
    await Loan.deleteMany(filter, { session });
    await Saving.deleteMany(filter, { session });
    await Fine.deleteMany(filter, { session });
    await Contribution.deleteMany(filter, { session });
    await SocialFundExpense.deleteMany(filter, { session });
    await BankBalance.findOneAndUpdate(
      { groupId },
      { balance: 0 },
      { upsert: true, session }
    );
    await SocialFundBalance.findOneAndUpdate(
      { groupId },
      { balance: 0 },
      { upsert: true, session }
    );
  } catch (error) {
    throw new Error(`Failed to reset data for new cycle: ${error.message}`);
  }
}

// Get current cycle number for a group — legacy fallback for groups with no
// Cycle document yet (see beginNewCycle). New groups resolve this from Cycle
// directly and never call this function.
async function getCurrentCycleNumber(groupId, session) {
  try {
    const lastTransaction = await Transaction.findOne({
      groupId,
      note: { $regex: /^New cycle \d+ initiated/ }
    }).session(session).sort({ createdAt: -1 });

    if (!lastTransaction) return 1;

    const match = lastTransaction.note.match(/New cycle (\d+) initiated/);
    return match ? parseInt(match[1]) : 1;
  } catch (error) {
    return 1;
  }
}

// Log cycle reset transaction
async function logCycleResetTransaction(userId, cycleNumber, groupId, session) {
  const transaction = new Transaction({
    userId,
    groupId,
    type: 'cycle_reset',
    amount: 0,
    note: `New cycle ${cycleNumber} initiated - All balances reset to zero`,
    cycleNumber,
    archived: false
  });
  await transaction.save({ session });
}

// Get historical reports (archived data)
exports.getHistoricalReports = async (req, res) => {
  const allowedRoles = ['admin', 'treasurer', 'loan_officer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }

  try {
    const { cycleNumber, type } = req.query;
    let query = { ...req.groupScope, archived: true };

    if (cycleNumber) {
      query.cycleNumber = parseInt(cycleNumber);
    }

    let data = [];
    let filename = 'historical_report.csv';

    switch (type) {
      case 'loans':
        const loans = await Loan.find(query).populate('userId', 'name');
        loans.forEach(loan => {
          loan.installments.forEach(installment => {
            data.push({
              CycleNumber: loan.cycleNumber || 'N/A',
              Name: loan.userId?.name || '',
              LoanAmount: loan.amount,
              Month: installment.month,
              Principal: installment.principal,
              Interest: installment.interest,
              Total: installment.total,
              PaidAmount: installment.paidAmount,
              Paid: installment.paid,
              PaymentDate: installment.paymentDate ? installment.paymentDate.toISOString().split('T')[0] : '',
              CycleEndDate: loan.cycleEndDate ? loan.cycleEndDate.toISOString().split('T')[0] : ''
            });
          });
        });
        filename = `historical_loans_cycle_${cycleNumber || 'all'}.csv`;
        break;

      case 'savings':
        const savings = await Saving.find(query).populate('userId', 'name');
        data = savings.map(s => ({
          CycleNumber: s.cycleNumber || 'N/A',
          Name: s.userId?.name || '',
          Month: s.month,
          Amount: s.amount,
          Fine: s.fine,
          InterestEarned: s.interestEarned,
          Date: s.date.toISOString().split('T')[0],
          CycleEndDate: s.cycleEndDate ? s.cycleEndDate.toISOString().split('T')[0] : ''
        }));
        filename = `historical_savings_cycle_${cycleNumber || 'all'}.csv`;
        break;

      case 'transactions':
        const transactions = await Transaction.find(query).populate('userId', 'name').sort({ createdAt: 1 });
        data = transactions.map(t => ({
          CycleNumber: t.cycleNumber || 'N/A',
          Name: t.userId?.name || '',
          Type: t.type,
          Amount: t.amount,
          Note: t.note,
          Date: t.createdAt ? t.createdAt.toISOString().split('T')[0] : '',
          CycleEndDate: t.cycleEndDate ? t.cycleEndDate.toISOString().split('T')[0] : ''
        }));
        filename = `historical_transactions_cycle_${cycleNumber || 'all'}.csv`;
        break;

      default:
        return res.status(400).json({ error: 'Invalid report type. Use: loans, savings, or transactions' });
    }

    const parser = new Parser();
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);

  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate historical report',
      details: error.message
    });
  }
};

// Get available cycles for historical reports
exports.getAvailableCycles = async (req, res) => {
  const allowedRoles = ['admin', 'treasurer', 'loan_officer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }

  try {
    const cycles = await Transaction.aggregate([
      {
        $match: {
          groupId: req.groupId,
          note: { $regex: /^New cycle \d+ initiated/ },
          archived: true
        }
      },
      {
        $project: {
          cycleNumber: {
            $toInt: {
              $arrayElemAt: [
                {
                  $split: [
                    { $arrayElemAt: [{ $split: ["$note", "cycle "] }, 1] },
                    " initiated"
                  ]
                },
                0
              ]
            }
          },
          createdAt: 1
        }
      },
      { $sort: { cycleNumber: -1 } }
    ]);

    const currentCycle = await getCurrentCycleNumber(req.groupId);

    res.json({
      availableCycles: cycles,
      currentCycle: currentCycle
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get available cycles',
      details: error.message
    });
  }
};

// Get the group's currently open cycle — the authoritative start/end dates and
// the settings snapshot they were opened with. Used by the migration scripts
// (Phase 7) and by anything that needs to validate a date falls within the
// current cycle rather than approximating via `archived: { $ne: true }`.
exports.getCurrentCycle = async (req, res) => {
  try {
    const cycle = await Cycle.findOne({ groupId: req.groupId, status: 'open' });
    if (!cycle) {
      return res.status(404).json({ error: 'No open cycle found for this group' });
    }
    res.json(cycle);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch current cycle', details: error.message });
  }
};
