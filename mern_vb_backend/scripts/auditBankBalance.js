const mongoose = require('mongoose');
require('dotenv').config();

const auditBankBalance = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔍 Starting Bank Balance Audit...\n');

    const Transaction = require('../models/Transaction');
    const BankBalance = require('../models/BankBalance');
    const Savings = require('../models/Savings');
    const Loan = require('../models/Loans');

    // Get current recorded bank balance
    const currentBalance = await BankBalance.findOne();
    console.log(`📊 Current Recorded Bank Balance: K${currentBalance?.balance || 0}\n`);

    // Get all transactions in current cycle (non-archived)
    const transactions = await Transaction.find({ archived: { $ne: true } }).sort({ createdAt: 1 });
    console.log(`📝 Total Transactions Found: ${transactions.length}\n`);

    // Categorize transactions
    const transactionsByType = {
      saving: [],
      loan: [],
      loan_payment: [],
      payment: [],
      payout: [],
      fine: [],
      cycle_reset: [],
      other: []
    };

    let calculatedBalance = 0;
    
    console.log('💰 TRANSACTION ANALYSIS:\n');
    
    transactions.forEach((tx, index) => {
      const type = tx.type || 'unknown';
      const amount = tx.amount || 0;
      
      if (transactionsByType[type]) {
        transactionsByType[type].push(tx);
      } else {
        transactionsByType.other.push(tx);
      }
      
      // Calculate balance effect
      let balanceEffect = 0;
      switch(type) {
        case 'saving':
          balanceEffect = amount; // Savings deposits increase bank balance
          break;
        case 'loan':
          balanceEffect = -amount; // Loans decrease bank balance (money goes out)
          break;
        case 'loan_payment':
        case 'payment':
          balanceEffect = amount; // Payments increase bank balance (money comes in)
          break;
        case 'payout':
          balanceEffect = -amount; // Payouts decrease bank balance (money goes out)
          break;
        case 'fine':
          balanceEffect = amount; // Fine payments increase bank balance
          break;
        case 'cycle_reset':
          balanceEffect = 0; // No immediate effect, just tracking
          break;
        default:
          balanceEffect = amount; // Default to adding
      }
      
      calculatedBalance += balanceEffect;
      
      console.log(`${index + 1}. ${tx.createdAt.toISOString().split('T')[0]} | ${type.toUpperCase()} | K${amount} | Effect: ${balanceEffect >= 0 ? '+' : ''}K${balanceEffect} | Running: K${calculatedBalance.toFixed(2)}`);
    });

    console.log('\n📈 SUMMARY BY TRANSACTION TYPE:\n');
    
    Object.keys(transactionsByType).forEach(type => {
      const txs = transactionsByType[type];
      if (txs.length > 0) {
        const total = txs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
        console.log(`${type.toUpperCase()}: ${txs.length} transactions, Total: K${total}`);
      }
    });

    console.log('\n💡 DETAILED BREAKDOWN:\n');
    
    // Savings Analysis
    const savingsTransactions = transactionsByType.saving;
    const totalSavingsDeposits = savingsTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    console.log(`💰 Savings Deposits: ${savingsTransactions.length} transactions = K${totalSavingsDeposits}`);
    
    // Loan Analysis
    const loanTransactions = transactionsByType.loan;
    const totalLoansIssued = loanTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    console.log(`📤 Loans Issued: ${loanTransactions.length} transactions = K${totalLoansIssued} (decreases balance)`);
    
    // Loan Payment Analysis
    const loanPayments = [...transactionsByType.loan_payment, ...transactionsByType.payment];
    const totalLoanPayments = loanPayments.reduce((sum, tx) => sum + tx.amount, 0);
    console.log(`📥 Loan Payments: ${loanPayments.length} transactions = K${totalLoanPayments}`);
    
    // Payout Analysis
    const payoutTransactions = transactionsByType.payout;
    const totalPayouts = payoutTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    console.log(`📤 Payouts: ${payoutTransactions.length} transactions = K${totalPayouts} (decreases balance)`);
    
    // Fine Analysis
    const fineTransactions = transactionsByType.fine;
    const totalFinePayments = fineTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    console.log(`🚨 Fine Payments: ${fineTransactions.length} transactions = K${totalFinePayments}`);

    console.log('\n🧮 CALCULATION VERIFICATION:\n');
    
    const netEffect = totalSavingsDeposits + totalLoanPayments + totalFinePayments - totalLoansIssued - totalPayouts;
    console.log(`Net Bank Balance Effect:`);
    console.log(`  + Savings Deposits: K${totalSavingsDeposits}`);
    console.log(`  + Loan Payments: K${totalLoanPayments}`);
    console.log(`  + Fine Payments: K${totalFinePayments}`);
    console.log(`  - Loans Issued: K${totalLoansIssued}`);
    console.log(`  - Payouts: K${totalPayouts}`);
    console.log(`  = Net Effect: K${netEffect}`);
    
    console.log(`\n🎯 FINAL RESULTS:\n`);
    console.log(`📊 Current Recorded Balance: K${currentBalance?.balance || 0}`);
    console.log(`🧮 Calculated Expected Balance: K${calculatedBalance.toFixed(2)}`);
    console.log(`📏 Difference: K${((currentBalance?.balance || 0) - calculatedBalance).toFixed(2)}`);
    
    if (Math.abs((currentBalance?.balance || 0) - calculatedBalance) < 0.01) {
      console.log(`✅ Bank balance is ACCURATE!`);
    } else {
      console.log(`⚠️  Bank balance needs adjustment!`);
      console.log(`🔧 Recommended action: Update bank balance to K${calculatedBalance.toFixed(2)}`);
    }

    // Additional verification - check actual savings and loan data
    console.log('\n🔍 CROSS-VERIFICATION WITH ACTUAL DATA:\n');
    
    const allSavings = await Savings.find({ archived: { $ne: true } });
    const actualSavingsTotal = allSavings.reduce((sum, saving) => sum + saving.amount, 0);
    console.log(`💰 Actual Savings Records Total: K${actualSavingsTotal}`);
    
    const allLoans = await Loan.find({ archived: { $ne: true } });
    const actualLoansTotal = allLoans.reduce((sum, loan) => sum + loan.amount, 0);
    console.log(`📋 Actual Loan Records Total: K${actualLoansTotal}`);
    
    // Calculate total payments made on loans
    let totalPaidOnLoans = 0;
    allLoans.forEach(loan => {
      const loanTotal = loan.installments.reduce((sum, inst) => sum + inst.paidAmount, 0);
      totalPaidOnLoans += loanTotal;
    });
    console.log(`💸 Total Paid on Loans: K${totalPaidOnLoans}`);

    console.log('\n🎯 DATA CONSISTENCY CHECK:\n');
    console.log(`Transaction Savings vs Actual Savings: K${totalSavingsDeposits} vs K${actualSavingsTotal} (${totalSavingsDeposits === actualSavingsTotal ? '✅ Match' : '❌ Mismatch'})`);
    console.log(`Transaction Loan Payments vs Actual Payments: K${totalLoanPayments} vs K${totalPaidOnLoans} (${Math.abs(totalLoanPayments - totalPaidOnLoans) < 0.01 ? '✅ Match' : '❌ Mismatch'})`);

  } catch (error) {
    console.error('❌ Error during audit:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Bank Balance Audit Complete');
  }
};

// Run the audit
auditBankBalance();