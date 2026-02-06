const mongoose = require('mongoose');
require('dotenv').config();

const analyzeLoan = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const User = require('../models/User');
    const user = await User.findOne({ username: 'patriciam' });
    
    if (!user) {
      console.log('User patriciam not found');
      return;
    }
    
    console.log('User patriciam ID:', user._id);
    
    const Loan = require('../models/Loans');
    const loan = await Loan.findOne({ userId: user._id, archived: false });
    
    if (!loan) {
      console.log('No active loan found for patriciam');
      return;
    }
    
    console.log('\n=== PATRICIAM LOAN ANALYSIS ===');
    console.log('Loan ID:', loan._id);
    console.log('Amount:', loan.amount);
    console.log('Duration:', loan.durationMonths);
    console.log('Interest Rate:', loan.interestRate + '%');
    console.log('Fully Paid:', loan.fullyPaid);
    console.log('Created:', loan.createdAt);
    console.log('\nInstallment Details:');
    
    loan.installments.forEach(inst => {
      console.log(`Month ${inst.month}:`);
      console.log(`  Principal: K${inst.principal}`);
      console.log(`  Interest: K${inst.interest}`);
      console.log(`  Total: K${inst.total}`);
      console.log(`  Paid: ${inst.paid}`);
      console.log(`  Paid Amount: K${inst.paidAmount}`);
      console.log(`  Payment Date: ${inst.paymentDate || 'None'}`);
      console.log('');
    });
    
    // Check for payment transactions for this user
    const Transaction = require('../models/Transaction');
    const payments = await Transaction.find({
      userId: user._id,
      type: { $in: ['loan_payment', 'payment'] },
      createdAt: { $gte: new Date('2026-01-01') }
    }).sort({ createdAt: 1 });
    
    console.log('=== PAYMENT TRANSACTIONS ===');
    console.log(`Found ${payments.length} payment transactions:`);
    payments.forEach(txn => {
      console.log(`${txn.createdAt.toISOString().split('T')[0]} | ${txn.type} | K${txn.amount} | ${txn.note || 'No note'}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

analyzeLoan();