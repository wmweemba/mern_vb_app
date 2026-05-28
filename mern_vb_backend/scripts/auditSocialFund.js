/**
 * Audits the social fund balance by replaying social_fund_credit and social_fund_debit
 * transactions and comparing the calculated result to the stored SocialFundBalance.
 *
 * Usage: node scripts/auditSocialFund.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function auditSocialFund() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔍 Starting Social Fund Audit...\n');

    const Transaction = require('../models/Transaction');
    const SocialFundBalance = require('../models/SocialFundBalance');

    const storedDoc = await SocialFundBalance.findOne();
    const storedBalance = storedDoc ? storedDoc.balance : 0;
    console.log(`📊 Stored SocialFundBalance: K${storedBalance}\n`);

    const transactions = await Transaction.find({
      type: { $in: ['social_fund_credit', 'social_fund_debit'] },
      archived: { $ne: true },
    }).sort({ createdAt: 1 });

    console.log(`📝 Social fund transactions found: ${transactions.length}\n`);

    let calculatedBalance = 0;
    transactions.forEach((tx, i) => {
      const effect = tx.type === 'social_fund_credit' ? tx.amount : -tx.amount;
      calculatedBalance += effect;
      console.log(`${i + 1}. ${tx.createdAt.toISOString().split('T')[0]} | ${tx.type.toUpperCase()} | K${tx.amount} | Effect: ${effect >= 0 ? '+' : ''}K${effect} | Running: K${calculatedBalance.toFixed(2)}`);
    });

    console.log(`\n🎯 RESULTS:`);
    console.log(`  Stored balance:     K${storedBalance}`);
    console.log(`  Calculated balance: K${calculatedBalance.toFixed(2)}`);
    console.log(`  Difference:         K${(storedBalance - calculatedBalance).toFixed(2)}`);

    if (Math.abs(storedBalance - calculatedBalance) < 0.01) {
      console.log(`\n✅ Social fund balance is ACCURATE`);
    } else {
      console.log(`\n⚠️  Social fund balance discrepancy detected!`);
    }
  } catch (err) {
    console.error('❌ Error during social fund audit:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔚 Social Fund Audit Complete');
  }
}

auditSocialFund();
