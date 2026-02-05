const mongoose = require('mongoose');
require('dotenv').config();

const fixCorruptedLoan = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const User = require('../models/User');
    const Loan = require('../models/Loans');

    // Find idah's user and loan
    const user = await User.findOne({ username: 'idah' });
    if (!user) {
      console.log('User idah not found');
      return;
    }

    const loan = await Loan.findOne({ userId: user._id, archived: false });
    if (!loan) {
      console.log('Loan for idah not found');
      return;
    }

    console.log('Found loan:', loan._id);
    console.log('Current corrupted installments:');
    loan.installments.forEach(inst => {
      console.log(`Month ${inst.month}: Total=${inst.total}, Paid=${inst.paid}, PaidAmount=${inst.paidAmount}`);
    });

    // Reset corrupted installments (Months 2-4) to unpaid state
    let fixed = false;
    loan.installments.forEach(installment => {
      // Keep Month 1 as is (it's correctly paid)
      if (installment.month === 1) return;
      
      // Fix corrupted months 2-4: if paid=false but paidAmount > 0, reset to completely unpaid
      if (installment.paid === false && installment.paidAmount > 0) {
        console.log(`Fixing Month ${installment.month}: resetting paidAmount from ${installment.paidAmount} to 0`);
        installment.paidAmount = 0;
        delete installment.paymentDate; // Remove payment date since it's not paid
        fixed = true;
      }
    });

    if (fixed) {
      await loan.save();
      console.log('✅ Loan fixed successfully!');
      
      console.log('Updated installments:');
      loan.installments.forEach(inst => {
        console.log(`Month ${inst.month}: Total=${inst.total}, Paid=${inst.paid}, PaidAmount=${inst.paidAmount}`);
      });
    } else {
      console.log('No corruption found to fix');
    }

  } catch (error) {
    console.error('Error fixing loan:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the fix
fixCorruptedLoan();