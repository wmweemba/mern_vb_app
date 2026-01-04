const { Parser } = require('json2csv');
const Loan = require('../models/Loans');
const Saving = require('../models/Savings');
const Fine = require('../models/Fine');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

// Enhanced report controller with cycle support
exports.generateEnhancedReport = async (req, res) => {
  const { reportType, cycleType, cycleNumber } = req.query;
  
  // Check permissions
  const allowedRoles = ['admin', 'treasurer', 'loan_officer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }

  try {
    let query = {};
    let reportTitle = '';
    
    // Build query based on cycle selection
    if (cycleType === 'current') {
      query = { 
        $or: [
          { archived: { $ne: true } },
          { archived: { $exists: false } }
        ]
      };
      reportTitle = 'Current Cycle';
    } else if (cycleType === 'historical' && cycleNumber) {
      const cycleNum = parseInt(cycleNumber);
      // Simplified query for historical data - try multiple strategies
      query = { 
        $or: [
          { cycleNumber: cycleNum }, // Explicit cycle number match
          { archived: true }, // All archived data (for dummy data without cycle numbers)
          { cycleNumber: { $exists: true, $ne: null } } // Any data with cycle numbers
        ]
      };
      reportTitle = `Historical Cycle ${cycleNumber}`;
    } else if (cycleType === 'historical' && !cycleNumber) {
      // Show all historical data if no specific cycle selected
      query = { 
        $or: [
          { archived: true },
          { cycleNumber: { $exists: true, $ne: null } }
        ]
      };
      reportTitle = 'All Historical Data';
    } else {
      return res.status(400).json({ error: 'Invalid cycle parameters' });
    }

    let data = [];
    let filename = '';

    switch (reportType) {
      case 'loans':
        data = await generateLoansReportData(query);
        filename = `${reportTitle.toLowerCase().replace(/ /g, '_')}_loans.csv`;
        break;
      
      case 'savings':
        data = await generateSavingsReportData(query);
        filename = `${reportTitle.toLowerCase().replace(/ /g, '_')}_savings.csv`;
        break;
      
      case 'transactions':
        data = await generateTransactionsReportData(query);
        filename = `${reportTitle.toLowerCase().replace(/ /g, '_')}_transactions.csv`;
        break;
      
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    // Return data for view or CSV for download based on request
    const format = req.query.format || 'json';
    
    if (format === 'csv') {
      const parser = new Parser();
      const csv = parser.parse(data);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    } else {
      // Return JSON for frontend display
      res.json({
        data,
        reportType,
        cycleType,
        cycleNumber: cycleNumber || null,
        reportTitle,
        recordCount: data.length
      });
    }

  } catch (error) {
    console.error('Enhanced Report Error:', error);
    res.status(500).json({ 
      error: 'Failed to generate report', 
      details: error.message 
    });
  }
};

// Generate loans report data
async function generateLoansReportData(query) {
  const loans = await Loan.find(query).populate('userId', 'username name email');
  const data = [];
  
  loans.forEach(loan => {
    // Handle loans without installments
    if (!loan.installments || loan.installments.length === 0) {
      data.push({
        Username: loan.userId?.username || 'N/A',
        Name: loan.userId?.name || 'N/A',
        Email: loan.userId?.email || 'N/A',
        LoanAmount: loan.amount || 0,
        DurationMonths: loan.durationMonths || 0,
        Month: 'N/A',
        Principal: 0,
        Interest: 0,
        Total: loan.amount || 0,
        PaidAmount: 0,
        Remaining: loan.amount || 0,
        Paid: false,
        PaymentDate: '',
        LateInterest: 0,
        OverdueFine: 0,
        EarlyPaymentCharge: 0,
        LoanCreatedAt: loan.createdAt ? loan.createdAt.toISOString().split('T')[0] : 'N/A',
        FullyPaid: loan.fullyPaid || false
      });
    } else {
      loan.installments.forEach(installment => {
        data.push({
          Username: loan.userId?.username || 'N/A',
          Name: loan.userId?.name || 'N/A',
          Email: loan.userId?.email || 'N/A',
          LoanAmount: loan.amount || 0,
          DurationMonths: loan.durationMonths || 0,
          Month: installment.month || 'N/A',
          Principal: installment.principal || 0,
          Interest: installment.interest || 0,
          Total: installment.total || 0,
          PaidAmount: installment.paidAmount || 0,
          Remaining: (installment.total || 0) - (installment.paidAmount || 0),
          Paid: installment.paid || false,
          PaymentDate: installment.paymentDate ? installment.paymentDate.toISOString().split('T')[0] : '',
          LateInterest: installment.penalties?.lateInterest || 0,
          OverdueFine: installment.penalties?.overdueFine || 0,
          EarlyPaymentCharge: installment.penalties?.earlyPaymentCharge || 0,
          LoanCreatedAt: loan.createdAt ? loan.createdAt.toISOString().split('T')[0] : 'N/A',
          FullyPaid: loan.fullyPaid || false
        });
      });
    }
  });
  
  return data;
}

// Generate savings report data  
async function generateSavingsReportData(query) {
  const savings = await Saving.find(query).populate('userId', 'username name email');
  
  return savings.map(s => ({
    Username: s.userId?.username || 'N/A',
    Name: s.userId?.name || 'N/A',
    Email: s.userId?.email || 'N/A',
    Month: s.month || 'N/A',
    Amount: s.amount || 0,
    Fine: s.fine || 0,
    InterestEarned: s.interestEarned || 0,
    Date: s.date ? s.date.toISOString().split('T')[0] : (s.createdAt ? s.createdAt.toISOString().split('T')[0] : 'N/A'),
    CycleNumber: s.cycleNumber || 'Historical'
  }));
}

// Generate transactions report data
async function generateTransactionsReportData(query) {
  const transactions = await Transaction.find(query)
    .populate('userId', 'username name')
    .sort({ createdAt: -1 });
  
  return transactions.map(t => ({
    Username: t.userId?.username || 'N/A',
    Name: t.userId?.name || 'N/A',
    Type: t.type || 'N/A',
    Amount: t.amount || 0,
    Note: t.note || '',
    Date: t.createdAt ? t.createdAt.toISOString().split('T')[0] : 'N/A',
    CycleNumber: t.cycleNumber || 'Historical'
  }));
}

// Get available cycles with better formatting
exports.getAvailableCyclesForReports = async (req, res) => {
  const allowedRoles = ['admin', 'treasurer', 'loan_officer'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }

  try {
    // Strategy 1: Get formal cycle reset transactions
    const cycleResetTransactions = await Transaction.find({ 
      type: 'cycle_reset'
    }).sort({ createdAt: -1 });

    // Strategy 2: Look for any archived data with cycle numbers
    const [archivedLoans, archivedSavings, archivedTransactions] = await Promise.all([
      Loan.find({ 
        $or: [
          { archived: true },
          { cycleNumber: { $exists: true, $ne: null } }
        ]
      }).sort({ createdAt: -1 }),
      
      Saving.find({ 
        $or: [
          { archived: true },
          { cycleNumber: { $exists: true, $ne: null } }
        ]
      }).sort({ createdAt: -1 }),
      
      Transaction.find({ 
        $or: [
          { archived: true },
          { cycleNumber: { $exists: true, $ne: null } }
        ]
      }).sort({ createdAt: -1 })
    ]);

    // Collect all cycle numbers from various sources
    const allCycleData = new Map();

    // Add from cycle reset transactions
    cycleResetTransactions.forEach(transaction => {
      if (transaction.cycleNumber) {
        allCycleData.set(transaction.cycleNumber, {
          cycleNumber: transaction.cycleNumber,
          createdAt: transaction.createdAt,
          note: transaction.note || `Cycle ${transaction.cycleNumber}`,
          source: 'cycle_reset',
          archived: transaction.archived || false
        });
      }
    });

    // Add from archived loans
    archivedLoans.forEach(loan => {
      if (loan.cycleNumber && !allCycleData.has(loan.cycleNumber)) {
        allCycleData.set(loan.cycleNumber, {
          cycleNumber: loan.cycleNumber,
          createdAt: loan.createdAt,
          note: `Cycle ${loan.cycleNumber} (from archived loans)`,
          source: 'archived_loans'
        });
      }
    });

    // Add from archived savings
    archivedSavings.forEach(saving => {
      if (saving.cycleNumber && !allCycleData.has(saving.cycleNumber)) {
        allCycleData.set(saving.cycleNumber, {
          cycleNumber: saving.cycleNumber,
          createdAt: saving.createdAt,
          note: `Cycle ${saving.cycleNumber} (from archived savings)`,
          source: 'archived_savings'
        });
      }
    });

    // Add from archived transactions
    archivedTransactions.forEach(transaction => {
      if (transaction.cycleNumber && !allCycleData.has(transaction.cycleNumber)) {
        allCycleData.set(transaction.cycleNumber, {
          cycleNumber: transaction.cycleNumber,
          createdAt: transaction.createdAt,
          note: `Cycle ${transaction.cycleNumber} (from archived transactions)`,
          source: 'archived_transactions'
        });
      }
    });

    // Strategy 3: If no cycle numbers found but there's archived data, 
    // create a generic "Historical Data" cycle
    if (allCycleData.size === 0 && (archivedLoans.length > 0 || archivedSavings.length > 0 || archivedTransactions.length > 0)) {
      // Find the oldest archived data
      const oldestDates = [];
      if (archivedLoans.length > 0) oldestDates.push(archivedLoans[archivedLoans.length - 1].createdAt);
      if (archivedSavings.length > 0) oldestDates.push(archivedSavings[archivedSavings.length - 1].createdAt);
      if (archivedTransactions.length > 0) oldestDates.push(archivedTransactions[archivedTransactions.length - 1].createdAt);
      
      const oldestDate = new Date(Math.min(...oldestDates.map(d => d.getTime())));
      
      allCycleData.set(1, {
        cycleNumber: 1,
        createdAt: oldestDate,
        note: `Historical Data (${archivedLoans.length + archivedSavings.length + archivedTransactions.length} records)`,
        source: 'auto_detected'
      });
    }

    // Convert to array and sort
    const availableCycles = Array.from(allCycleData.values())
      .filter(cycle => cycle.cycleNumber > 0)
      .sort((a, b) => b.cycleNumber - a.cycleNumber);

    const currentCycle = await getCurrentCycleNumber() + 1;
    
    res.json({
      availableCycles: availableCycles,
      currentCycle: currentCycle,
      totalHistoricalCycles: availableCycles.length,
      debug: {
        cycleResetCount: cycleResetTransactions.length,
        archivedLoansCount: archivedLoans.length,
        archivedSavingsCount: archivedSavings.length,
        archivedTransactionsCount: archivedTransactions.length
      }
    });

  } catch (error) {
    console.error('Get Available Cycles Error:', error);
    res.status(500).json({ 
      error: 'Failed to get available cycles', 
      details: error.message 
    });
  }
};

// Helper function to get current cycle number
async function getCurrentCycleNumber() {
  try {
    const lastTransaction = await Transaction.findOne({ 
      type: 'cycle_reset' 
    }).sort({ createdAt: -1 });
    
    if (!lastTransaction) return 0;
    
    const match = lastTransaction.note?.match(/New cycle (\d+) initiated/);
    return match ? parseInt(match[1]) : 0;
  } catch (error) {
    return 0;
  }
}