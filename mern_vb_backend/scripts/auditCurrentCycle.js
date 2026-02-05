const mongoose = require('mongoose');
require('dotenv').config();

const auditCurrentCycleBankBalance = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    console.log('='.repeat(60));
    console.log('CURRENT CYCLE BANK BALANCE AUDIT (January 2026 - Present)');
    console.log('='.repeat(60));

    // Define current cycle start date (January 2026)
    const cycleStartDate = new Date('2026-01-01T00:00:00.000Z');
    console.log(`Analyzing transactions from: ${cycleStartDate.toISOString()}`);
    console.log(`Current date: ${new Date().toISOString()}`);
    console.log('');

    const Transaction = require('../models/Transaction');
    const BankBalance = require('../models/BankBalance');
    const Savings = require('../models/Savings');
    const Loan = require('../models/Loans');

    // Get current bank balance
    const currentBalance = await BankBalance.findOne();
    console.log(`💰 CURRENT RECORDED BANK BALANCE: K${currentBalance ? currentBalance.balance.toFixed(2) : '0.00'}`);
    console.log('');

    // Get all current cycle transactions
    const transactions = await Transaction.find({ 
      createdAt: { $gte: cycleStartDate },
      // Exclude archived transactions if there's an archived field
    }).sort({ createdAt: 1 });

    console.log(`📊 CURRENT CYCLE TRANSACTIONS: ${transactions.length} total`);
    console.log('');

    let runningBalance = 0;
    let savingsDeposits = 0;
    let loanPayments = 0;
    let loanDisbursements = 0;
    let finePayments = 0;
    let otherTransactions = 0;
    let payouts = 0;
    let cycleResets = 0;

    // Get unique transaction types first to understand what we're dealing with
    const transactionTypes = [...new Set(transactions.map(t => t.type))];
    console.log('🏷️ TRANSACTION TYPES FOUND:', transactionTypes);
    console.log('');

    console.log('📋 TRANSACTION BREAKDOWN:');
    console.log('-'.repeat(80));
    console.log('DATE       | TYPE           | AMOUNT     | NOTE');
    console.log('-'.repeat(80));

    // Analyze each transaction
    transactions.forEach(txn => {
      const amount = txn.amount || 0;
      const type = txn.type?.toLowerCase();
      const date = txn.createdAt.toISOString().split('T')[0];
      const note = (txn.note || '').substring(0, 40);
      
      console.log(`${date} | ${(type?.toUpperCase() || 'UNKNOWN').padEnd(14)} | K${amount.toFixed(2).padStart(8)} | ${note}`);
      
      switch (type) {
        case 'saving':
          savingsDeposits += amount;
          runningBalance += amount; // Savings deposits increase bank balance
          break;
        case 'loan':
          loanDisbursements += Math.abs(amount);
          runningBalance -= Math.abs(amount); // Loan disbursements decrease bank balance
          break;
        case 'loan_payment':
          loanPayments += Math.abs(amount);
          runningBalance += Math.abs(amount); // Loan payments increase bank balance
          break;
        case 'payment':
          // This could be loan payments recorded under 'payment' type
          if (amount > 0) {
            loanPayments += amount;
            runningBalance += amount;
          } else {
            payouts += Math.abs(amount);
            runningBalance += amount; // Negative amounts for payouts
          }
          break;
        case 'fine':
          finePayments += Math.abs(amount);
          runningBalance += Math.abs(amount); // Fine payments increase bank balance
          break;
        case 'payout':
          payouts += Math.abs(amount);
          runningBalance -= Math.abs(amount); // Payouts decrease bank balance
          break;
        case 'cycle_reset':
          cycleResets += Math.abs(amount);
          runningBalance += amount; // Starting balance for new cycle
          break;
        default:
          otherTransactions += amount;
          runningBalance += amount;
          console.log(`  ⚠️  Unknown transaction type: ${type}`);
      }
    });

    console.log('');
    console.log('💰 FINANCIAL SUMMARY:');
    console.log('='.repeat(50));
    console.log(`💚 Savings Deposits:     +K${savingsDeposits.toFixed(2)}`);
    console.log(`💙 Loan Payments:        +K${loanPayments.toFixed(2)}`);
    console.log(`💛 Fine Payments:        +K${finePayments.toFixed(2)}`);
    console.log(`🔄 Cycle Reset Balance:  +K${cycleResets.toFixed(2)}`);
    console.log(`❤️ Loan Disbursements:   -K${loanDisbursements.toFixed(2)}`);
    console.log(`🧡 Payouts:              -K${payouts.toFixed(2)}`);
    console.log(`⚪ Other Transactions:   +K${otherTransactions.toFixed(2)}`);
    console.log('');
    
    console.log('🧮 BALANCE CALCULATION:');
    console.log('='.repeat(50));
    console.log(`Starting Balance (cycle reset): K${cycleResets.toFixed(2)}`);
    console.log(`+ Savings Deposits:             K${savingsDeposits.toFixed(2)}`);
    console.log(`+ Loan Payments:                K${loanPayments.toFixed(2)}`);
    console.log(`+ Fine Payments:                K${finePayments.toFixed(2)}`);
    console.log(`- Loan Disbursements:           K${loanDisbursements.toFixed(2)}`);
    console.log(`- Payouts:                      K${payouts.toFixed(2)}`);
    console.log(`+ Other:                        K${otherTransactions.toFixed(2)}`);
    console.log('-'.repeat(30));
    console.log(`CALCULATED BALANCE:             K${runningBalance.toFixed(2)}`);
    console.log(`RECORDED BALANCE:               K${currentBalance?.balance.toFixed(2) || '0.00'}`);
    
    const discrepancy = runningBalance - (currentBalance?.balance || 0);
    console.log(`DISCREPANCY:                    K${discrepancy.toFixed(2)}`);
    
    if (Math.abs(discrepancy) > 0.01) {
      console.log(`\n❌ DISCREPANCY DETECTED: K${discrepancy.toFixed(2)}`);
      if (discrepancy > 0) {
        console.log('💡 Bank balance should be HIGHER');
      } else {
        console.log('💡 Bank balance should be LOWER');
      }
    } else {
      console.log('\n✅ BANK BALANCE IS ACCURATE');
    }

    // Cross-verify with actual savings and loan data
    console.log('\n🔍 CROSS-VERIFICATION:');
    console.log('='.repeat(50));
    
    // Check current cycle savings
    const currentSavings = await Savings.find({ 
      createdAt: { $gte: cycleStartDate },
      archived: { $ne: true }
    });
    const totalSavingsFromRecords = currentSavings.reduce((sum, saving) => sum + (saving.amount || 0), 0);
    console.log(`Savings from Savings collection:   K${totalSavingsFromRecords.toFixed(2)}`);
    console.log(`Savings from Transaction logs:     K${savingsDeposits.toFixed(2)}`);
    
    // Check current cycle loans
    const currentLoans = await Loan.find({
      createdAt: { $gte: cycleStartDate },
      archived: { $ne: true }
    });
    
    const totalLoansDisbursed = currentLoans.reduce((sum, loan) => sum + (loan.amount || 0), 0);
    const totalLoanPayments = currentLoans.reduce((sum, loan) => {
      return sum + loan.installments.reduce((paySum, inst) => paySum + (inst.paidAmount || 0), 0);
    }, 0);
    
    console.log(`Loans disbursed (from Loans):      K${totalLoansDisbursed.toFixed(2)}`);
    console.log(`Loan payments (from Loans):        K${totalLoanPayments.toFixed(2)}`);
    console.log(`Loans from Transaction logs:       -K${loanDisbursements.toFixed(2)}`);
    console.log(`Payments from Transaction logs:    +K${loanPayments.toFixed(2)}`);

    console.log('\n📋 RECOMMENDED ACTION:');
    console.log('='.repeat(50));
    if (Math.abs(discrepancy) > 0.01) {
      console.log(`Update bank balance from K${(currentBalance?.balance || 0).toFixed(2)} to K${runningBalance.toFixed(2)}`);
      console.log(`Adjustment needed: ${discrepancy > 0 ? '+' : ''}K${discrepancy.toFixed(2)}`);
      
      console.log('\nTo fix this, run:');
      console.log(`curl -X PUT http://localhost:5000/api/bank-balance \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -H "Authorization: Bearer YOUR_TOKEN" \\`);
      console.log(`  -d '{"newBalance": ${runningBalance.toFixed(2)}, "reason": "Audit correction"}'`);
    } else {
      console.log('No adjustment needed - bank balance is accurate');
    }

  } catch (error) {
    console.error('Error during audit:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

auditCurrentCycleBankBalance();