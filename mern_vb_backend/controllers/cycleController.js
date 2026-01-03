const { Parser } = require('json2csv');
const Loan = require('../models/Loans');
const Saving = require('../models/Savings');
const Fine = require('../models/Fine');
const Transaction = require('../models/Transaction');
const BankBalance = require('../models/BankBalance');
const User = require('../models/User');

// Begin new cycle - Reset all balances and generate backup reports
exports.beginNewCycle = async (req, res) => {
  // Check permissions - admin, treasurer, and loan_officer can initiate new cycle
  const allowedRoles = ['admin', 'treasurer', 'loan_officer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }

  try {
    // Step 1: Generate backup reports before resetting
    const backupReports = await generateBackupReports();

    // Step 2: Archive current cycle data (add cycle metadata to existing records)
    const cycleEndDate = new Date();
    const cycleNumber = await getCurrentCycleNumber() + 1;
    
    await archiveCurrentCycleData(cycleEndDate, cycleNumber - 1);

    // Step 3: Reset all balances and data for new cycle
    await resetForNewCycle();

    // Step 4: Log the cycle reset transaction
    await logCycleResetTransaction(req.user._id, cycleNumber);

    res.json({
      message: `New cycle ${cycleNumber} has been successfully initiated`,
      cycleNumber,
      cycleStartDate: new Date(),
      backupReports,
      resetData: {
        loansReset: true,
        savingsReset: true,
        finesCleared: true,
        bankBalanceReset: true
      }
    });

  } catch (error) {
    console.error('New Cycle Error:', error);
    res.status(500).json({ 
      error: 'Failed to begin new cycle', 
      details: error.message 
    });
  }
};

// Generate backup reports before reset
async function generateBackupReports() {
  try {
    // Generate Loans Report
    const loans = await Loan.find().populate('userId', 'username name');
    const loansData = [];
    
    loans.forEach(loan => {
      loan.installments.forEach(installment => {
        loansData.push({
          Username: loan.userId?.username || '',
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

    // Generate Savings Report  
    const savings = await Saving.find().populate('userId', 'username name');
    const savingsData = savings.map(s => ({
      Username: s.userId?.username || '',
      Name: s.userId?.name || '',
      Month: s.month,
      Amount: s.amount,
      Fine: s.fine,
      InterestEarned: s.interestEarned,
      Date: s.date.toISOString().split('T')[0]
    }));

    // Generate Transactions Report
    const transactions = await Transaction.find().populate('userId', 'username name').sort({ createdAt: 1 });
    const transactionsData = transactions.map(t => ({
      Username: t.userId?.username || '',
      Name: t.userId?.name || '',
      Type: t.type,
      Amount: t.amount,
      Note: t.note,
      Date: t.createdAt ? t.createdAt.toISOString().split('T')[0] : ''
    }));

    // Generate Fines Report
    const fines = await Fine.find().populate('userId', 'username name').populate('issuedBy', 'username name');
    const finesData = fines.map(f => ({
      Username: f.userId?.username || '',
      Name: f.userId?.name || '',
      Amount: f.amount,
      Note: f.note || '',
      IssuedBy: f.issuedBy?.username || '',
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

// Archive current cycle data by adding cycle metadata
async function archiveCurrentCycleData(cycleEndDate, cycleNumber) {
  try {
    // Add cycle metadata to existing records
    await Loan.updateMany({}, { 
      $set: { 
        cycleNumber, 
        cycleEndDate,
        archived: true 
      } 
    });
    
    await Saving.updateMany({}, { 
      $set: { 
        cycleNumber, 
        cycleEndDate,
        archived: true 
      } 
    });
    
    await Fine.updateMany({}, { 
      $set: { 
        cycleNumber, 
        cycleEndDate,
        archived: true 
      } 
    });
    
    await Transaction.updateMany({}, { 
      $set: { 
        cycleNumber, 
        cycleEndDate,
        archived: true 
      } 
    });

  } catch (error) {
    throw new Error(`Failed to archive cycle data: ${error.message}`);
  }
}

// Reset all data for new cycle
async function resetForNewCycle() {
  try {
    // Clear all current cycle data (archived data remains for reports)
    await Loan.deleteMany({ archived: { $ne: true } });
    await Saving.deleteMany({ archived: { $ne: true } });
    await Fine.deleteMany({ archived: { $ne: true } });
    
    // Keep transaction history but mark as archived
    // Don't delete transactions as they're needed for complete audit trail
    
    // Reset bank balance to 0
    await BankBalance.findOneAndUpdate(
      {}, 
      { balance: 0 }, 
      { upsert: true }
    );

  } catch (error) {
    throw new Error(`Failed to reset data for new cycle: ${error.message}`);
  }
}

// Get current cycle number
async function getCurrentCycleNumber() {
  try {
    const lastTransaction = await Transaction.findOne({ 
      note: { $regex: /^New cycle \d+ initiated/ } 
    }).sort({ createdAt: -1 });
    
    if (!lastTransaction) return 1; // First cycle
    
    const match = lastTransaction.note.match(/New cycle (\d+) initiated/);
    return match ? parseInt(match[1]) : 1;
  } catch (error) {
    return 1; // Default to cycle 1 if error
  }
}

// Log cycle reset transaction
async function logCycleResetTransaction(userId, cycleNumber) {
  try {
    const transaction = new Transaction({
      userId,
      type: 'cycle_reset',
      amount: 0,
      note: `New cycle ${cycleNumber} initiated - All balances reset to zero`,
      cycleNumber,
      archived: false
    });
    
    await transaction.save();
  } catch (error) {
    console.error('Failed to log cycle reset transaction:', error);
    // Don't throw here as the main operation succeeded
  }
}

// Get historical reports (archived data)
exports.getHistoricalReports = async (req, res) => {
  const allowedRoles = ['admin', 'treasurer', 'loan_officer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }

  try {
    const { cycleNumber, type } = req.query;
    let query = { archived: true };
    
    if (cycleNumber) {
      query.cycleNumber = parseInt(cycleNumber);
    }

    let data = [];
    let filename = 'historical_report.csv';

    switch (type) {
      case 'loans':
        const loans = await Loan.find(query).populate('userId', 'username name');
        loans.forEach(loan => {
          loan.installments.forEach(installment => {
            data.push({
              CycleNumber: loan.cycleNumber || 'N/A',
              Username: loan.userId?.username || '',
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
        const savings = await Saving.find(query).populate('userId', 'username name');
        data = savings.map(s => ({
          CycleNumber: s.cycleNumber || 'N/A',
          Username: s.userId?.username || '',
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
        const transactions = await Transaction.find(query).populate('userId', 'username name').sort({ createdAt: 1 });
        data = transactions.map(t => ({
          CycleNumber: t.cycleNumber || 'N/A',
          Username: t.userId?.username || '',
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
    console.error('Historical Reports Error:', error);
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

    const currentCycle = await getCurrentCycleNumber();
    
    res.json({
      availableCycles: cycles,
      currentCycle: currentCycle
    });

  } catch (error) {
    console.error('Get Available Cycles Error:', error);
    res.status(500).json({ 
      error: 'Failed to get available cycles', 
      details: error.message 
    });
  }
};