const mongoose = require('mongoose');
require('dotenv').config();

const repairPatriciamLoan = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const User = require('../models/User');
    const Loan = require('../models/Loans');

    // Find patriciam's user and loan
    const user = await User.findOne({ username: 'patriciam' });
    if (!user) {
      console.log('User patriciam not found');
      return;
    }

    const loan = await Loan.findOne({ userId: user._id, archived: false });
    if (!loan) {
      console.log('Loan for patriciam not found');
      return;
    }

    console.log('Found loan:', loan._id);
    console.log('Current corrupted installments:');
    loan.installments.forEach(inst => {
      console.log(`Month ${inst.month}: Total=K${inst.total}, Paid=${inst.paid}, PaidAmount=K${inst.paidAmount}`);
    });

    // Based on transaction analysis:
    // Payment 1: K4767 -> Month 1 (K4766.67) + K0.33 toward Month 2
    // Payment 2: K4766.67 -> Complete Month 2 (K4399.67 remaining) + K366.99 toward Month 3
    
    console.log('\nApplying payment corrections:');
    
    // Month 1: Full payment
    loan.installments[0].paid = true;
    loan.installments[0].paidAmount = 4766.67;
    loan.installments[0].paymentDate = new Date('2026-02-05');
    console.log('✓ Month 1: Marked as fully paid (K4766.67)');
    
    // Month 2: Full payment 
    // First payment contributed K0.33, second payment contributed K4399.67
    loan.installments[1].paid = true;
    loan.installments[1].paidAmount = 4400.00;
    loan.installments[1].paymentDate = new Date('2026-02-06');
    console.log('✓ Month 2: Marked as fully paid (K4400.00)');
    
    // Month 3: Partial payment
    // Remaining from second payment: K4766.67 - K4399.67 = K367.00 toward Month 3
    loan.installments[2].paid = false;
    loan.installments[2].paidAmount = 367.00;
    loan.installments[2].paymentDate = new Date('2026-02-06');
    console.log('✓ Month 3: Partial payment applied (K367.00 of K4033.34)');

    await loan.save();
    console.log('\n✅ Loan repaired successfully!');
    
    console.log('\nUpdated installments:');
    loan.installments.forEach(inst => {
      console.log(`Month ${inst.month}: Total=K${inst.total}, Paid=${inst.paid}, PaidAmount=K${inst.paidAmount}`);
    });

  } catch (error) {
    console.error('Error repairing loan:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

repairPatriciamLoan();