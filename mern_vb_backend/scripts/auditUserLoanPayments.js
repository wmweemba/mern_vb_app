require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Loan = require('../models/Loans');
const Transaction = require('../models/Transaction');

const username = process.argv[2];

if (!username) {
  console.error('Usage: node scripts/auditUserLoanPayments.js <username>');
  process.exit(1);
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const user = await User.findOne({ username });
    if (!user) {
      console.error(`User not found: ${username}`);
      process.exit(1);
    }

    const loans = await Loan.find({ userId: user._id }).sort({ createdAt: -1 });
    const transactions = await Transaction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    console.log(`User: ${user.username} (${user._id})`);
    console.log(`Loans: ${loans.length}`);

    loans.forEach((loan, idx) => {
      console.log(`\nLoan ${idx + 1}: ${loan._id}`);
      console.log(`Amount: K${loan.amount} | Duration: ${loan.durationMonths} | FullyPaid: ${loan.fullyPaid}`);
      console.log('Installments:');
      loan.installments.forEach(inst => {
        const paidAmount = inst.paidAmount || 0;
        console.log(`  Month ${inst.month}: total=${inst.total} paid=${paidAmount} paidFlag=${inst.paid} paymentDate=${inst.paymentDate || 'N/A'}`);
      });
    });

    console.log('\nRecent Transactions:');
    transactions.forEach(t => {
      console.log(`  ${t.createdAt.toISOString()} | ${t.type} | K${t.amount} | ${t.note || ''} | ref=${t.referenceId || ''}`);
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error('Audit failed:', err);
    process.exit(1);
  }
}

run();