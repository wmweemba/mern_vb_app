require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Loan = require('../models/Loans');
const Transaction = require('../models/Transaction');

const username = process.argv[2];

if (!username) {
  console.error('Usage: node scripts/repairMisappliedLoanPayment.js <username>');
  process.exit(1);
}

const applyPaymentToLoan = (loan, amount) => {
  let remaining = amount;
  for (let i = 0; i < loan.installments.length && remaining > 0; i++) {
    const inst = loan.installments[i];
    if (!inst.paid) {
      const paidSoFar = inst.paidAmount || 0;
      const needed = inst.total - paidSoFar;
      const pay = Math.min(needed, remaining);
      inst.paidAmount = paidSoFar + pay;
      if (inst.paidAmount >= inst.total) {
        inst.paid = true;
        inst.paymentDate = new Date();
      }
      remaining -= pay;
    }
  }
  loan.fullyPaid = loan.installments.every(inst => inst.paid);
  return remaining;
};

const reversePaymentFromLoan = (loan, amount) => {
  let remaining = amount;
  for (let i = 0; i < loan.installments.length && remaining > 0; i++) {
    const inst = loan.installments[i];
    const paidSoFar = inst.paidAmount || 0;
    if (paidSoFar > 0) {
      const take = Math.min(paidSoFar, remaining);
      inst.paidAmount = paidSoFar - take;
      if (inst.paidAmount < inst.total) {
        inst.paid = false;
        inst.paymentDate = undefined;
      }
      remaining -= take;
    }
  }
  loan.fullyPaid = loan.installments.every(inst => inst.paid);
  return remaining;
};

async function run() {
  let session;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    session = await mongoose.startSession();

    const user = await User.findOne({ username });
    if (!user) {
      console.error(`User not found: ${username}`);
      process.exit(1);
    }

    const latestLoan = await Loan.findOne({ userId: user._id, fullyPaid: false, archived: { $ne: true } })
      .sort({ createdAt: -1 });

    const latestPayment = await Transaction.findOne({ userId: user._id, type: 'loan_payment' })
      .sort({ createdAt: -1 });

    if (!latestLoan || !latestPayment) {
      console.error('No active loan or loan payment found for user.');
      process.exit(1);
    }

    if (String(latestPayment.referenceId) === String(latestLoan._id)) {
      console.log('Latest loan payment already references the latest active loan. No action taken.');
      process.exit(0);
    }

    const sourceLoan = await Loan.findById(latestPayment.referenceId);
    if (!sourceLoan) {
      console.error('Source loan not found for transaction referenceId.');
      process.exit(1);
    }

    await session.withTransaction(async () => {
      const paymentAmount = latestPayment.amount;

      const remainingAfterReverse = reversePaymentFromLoan(sourceLoan, paymentAmount);
      if (remainingAfterReverse > 0) {
        throw new Error(`Unable to fully reverse payment from source loan. Remaining: K${remainingAfterReverse}`);
      }

      const remainingAfterApply = applyPaymentToLoan(latestLoan, paymentAmount);
      if (remainingAfterApply > 0) {
        throw new Error(`Unable to fully apply payment to target loan. Remaining: K${remainingAfterApply}`);
      }

      await sourceLoan.save({ session });
      await latestLoan.save({ session });

      latestPayment.referenceId = latestLoan._id;
      latestPayment.note = `${latestPayment.note || 'Loan payment'} (reassigned to latest active loan on ${new Date().toISOString()})`;
      await latestPayment.save({ session });
    });

    console.log('Payment reassigned successfully.');
  } catch (err) {
    console.error('Repair failed:', err);
    process.exit(1);
  } finally {
    if (session) {
      await session.endSession();
    }
    await mongoose.disconnect();
  }
}

run();