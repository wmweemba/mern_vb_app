/**
 * Idempotent seed: creates the platform's GroupTemplate catalogue.
 *
 * `village_bank` mirrors today's hardcoded createGroup() defaults exactly, so a group
 * created from it behaves identically to a group created before templates existed.
 * `grocery_chilimba` is the archetype scoped in docs/plan_configurable_group_rules.md
 * against Grace Kalele's group and the Grocery Champions constitution.
 *
 * Safe to re-run: upserts by `key`, never overwrites an existing template's fields
 * (so a super admin's manual edits in the catalogue survive a re-run).
 *
 * Usage: node scripts/seedGroupTemplates.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const GroupTemplate = require('../models/GroupTemplate');

const TEMPLATES = [
  {
    key: 'village_bank',
    name: 'Village Bank',
    description: 'Standard savings group: scheduled reducing/flat loans, proportional or equal profit share-out at cycle end.',
    policies: {
      loanAccrual: 'scheduled_reducing',
      arrears: 'none',
      loanLimit: 'savings_multiple',
      concurrentLoans: 'unlimited',
      interestObligation: 'none',
      cycleEnd: 'shareout_proportional',
      exit: 'settle_and_refund',
    },
    defaults: {
      cycleLengthMonths: 6,
      interestRate: 10,
      interestMethod: 'reducing',
      defaultLoanDuration: 4,
      loanLimitMultiplier: 3,
      latePenaltyRate: 15,
      overdueFineAmount: 1000,
      earlyPaymentCharge: 200,
      partialPaymentFineAmount: 0,
      savingsInterestRate: 10,
      minimumSavingsMonth1: 3000,
      minimumSavingsMonthly: 1000,
      maximumSavingsFirst3Months: 5000,
      savingsShortfallFine: 500,
      profitSharingMethod: 'proportional',
      interestObligationAmount: 0,
    },
    features: { fines: true, shareOut: true, socialFund: true, savingsInterest: true },
    vocabulary: {},
  },
  {
    key: 'grocery_chilimba',
    name: 'Grocery Savings Group',
    description: 'Members save monthly and borrow from a revolving pool; funds buy groceries in bulk at cycle end. No fines, no scheduled installments — loans accrue monthly interest on the outstanding balance.',
    policies: {
      loanAccrual: 'revolving_monthly',
      arrears: 'capitalise',
      loanLimit: 'none',
      concurrentLoans: 'unlimited',
      interestObligation: 'per_member_quota',
      cycleEnd: 'pooled_external',
      exit: 'settle_and_refund',
    },
    defaults: {
      cycleLengthMonths: 6,
      interestRate: 10,
      interestMethod: 'flat',
      defaultLoanDuration: 1,
      loanLimitMultiplier: 10,
      latePenaltyRate: 15,
      overdueFineAmount: 0,
      earlyPaymentCharge: 0,
      partialPaymentFineAmount: 0,
      savingsInterestRate: 0,
      minimumSavingsMonth1: 0,
      minimumSavingsMonthly: 0,
      maximumSavingsFirst3Months: 0,
      savingsShortfallFine: 0,
      profitSharingMethod: 'equal',
      interestObligationAmount: 0,
    },
    features: { fines: false, shareOut: false, socialFund: true, savingsInterest: false },
    vocabulary: { shareOut: 'Grocery Purchase Fund', savings: 'Monthly Contribution' },
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('🔗 Connected to MongoDB\n');

  let created = 0;
  for (const tpl of TEMPLATES) {
    const exists = await GroupTemplate.findOne({ key: tpl.key });
    if (exists) {
      console.log(`  ⏭️  "${tpl.key}" already exists — skipped`);
      continue;
    }
    await GroupTemplate.create(tpl);
    created++;
    console.log(`  ✅ Created template "${tpl.key}"`);
  }

  console.log(`\n✅ Done. Templates created: ${created}`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
