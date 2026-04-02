require('dotenv').config();
const mongoose = require('mongoose');
const GroupSettings = require('../models/GroupSettings');

const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true }
};

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI, clientOptions);

  const existing = await GroupSettings.findOne();
  if (existing) {
    console.log('GroupSettings already exists — skipping seed.');
    console.log('Current settings:', JSON.stringify(existing.toJSON(), null, 2));
    await mongoose.disconnect();
    return;
  }

  const settings = await GroupSettings.create({
    groupName: "Chama360 Pilot Group",
    cycleLengthMonths: 6,
    interestRate: 10,
    interestMethod: "reducing",
    defaultLoanDuration: 4,
    loanLimitMultiplier: 3,
    latePenaltyRate: 15,
    overdueFineAmount: 1000,
    earlyPaymentCharge: 200,
    savingsInterestRate: 10,
    minimumSavingsMonth1: 3000,
    minimumSavingsMonthly: 1000,
    maximumSavingsFirst3Months: 5000,
    savingsShortfallFine: 500,
    profitSharingMethod: "proportional",
  });

  console.log('GroupSettings seeded successfully:');
  console.log(JSON.stringify(settings.toJSON(), null, 2));
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
