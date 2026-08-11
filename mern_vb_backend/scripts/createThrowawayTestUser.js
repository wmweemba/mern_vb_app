/**
 * Creates a throwaway, pre-verified Clerk user for headless UI verification —
 * no signup email, no magic link, no OTP inbox needed by the agent driving the
 * browser. See second-brain systems/NS-020-clerk-headless-test-session.md for the
 * full technique this implements, and CLAUDE.md's "Dev Test Accounts" section.
 *
 * Prints the credentials + the fixed Clerk test OTP (424242) needed for the
 * "new device" sign-in challenge, and — if --group is passed — also creates a
 * matching GroupMember so the account can be used to test authenticated pages
 * instead of exercising the onboarding wizard.
 *
 * SAFETY: only ever run this against a Clerk *test* instance (CLERK_SECRET_KEY
 * starting with sk_test_ — this script refuses to run against sk_live_). The
 * app's MongoDB is currently still the shared production Atlas database (no
 * dev/staging split yet — see CLAUDE.md), so any GroupMember/Group this script
 * creates is real data until you delete it with the matching --delete flag.
 *
 * Usage:
 *   node scripts/createThrowawayTestUser.js
 *     → creates a Clerk user with NO group (lands on /welcome → /onboarding)
 *
 *   node scripts/createThrowawayTestUser.js --group "ZZZ_TEST Grocery Chilimba" --role admin
 *     → also creates a throwaway Group + GroupSettings + GroupMember, so the
 *       account signs straight into an authenticated page instead of onboarding
 *
 *   node scripts/createThrowawayTestUser.js --delete <clerkUserId> [--groupId <id>]
 *     → deletes the Clerk user (and the Group/GroupSettings/GroupMember/BankBalance/
 *       SocialFundBalance/ContributionType docs for --groupId, if given)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { clerkClient } = require('@clerk/express');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      args[key] = next && !next.startsWith('--') ? next : true;
      if (args[key] !== true) i++;
    }
  }
  return args;
}

async function assertTestKey() {
  const key = process.env.CLERK_SECRET_KEY || '';
  if (!key.startsWith('sk_test_')) {
    throw new Error(
      `Refusing to run: CLERK_SECRET_KEY does not look like a test key (starts with "${key.slice(0, 8)}..."). ` +
      'This script creates/deletes real Clerk users — only run it against a sk_test_ instance.'
    );
  }
}

async function deleteFlow(args) {
  await assertTestKey();
  await clerkClient.users.deleteUser(args.delete);
  console.log(`✅ Deleted Clerk user ${args.delete}`);

  if (args.groupId) {
    await mongoose.connect(process.env.MONGODB_URI);
    const Group = require('../models/Group');
    const GroupMember = require('../models/GroupMember');
    const GroupSettings = require('../models/GroupSettings');
    const BankBalance = require('../models/BankBalance');
    const SocialFundBalance = require('../models/SocialFundBalance');
    const ContributionType = require('../models/ContributionType');

    const { groupId } = args;
    await Promise.all([
      Group.deleteOne({ _id: groupId }),
      GroupMember.deleteMany({ groupId }),
      GroupSettings.deleteOne({ groupId }),
      BankBalance.deleteOne({ groupId }),
      SocialFundBalance.deleteOne({ groupId }),
      ContributionType.deleteMany({ groupId }),
    ]);
    console.log(`✅ Deleted Group ${groupId} and its GroupMember/GroupSettings/BankBalance/SocialFundBalance/ContributionType docs`);
    await mongoose.disconnect();
  }
}

async function createFlow(args) {
  await assertTestKey();

  const suffix = Math.random().toString(36).slice(2, 8);
  // +clerk_test@ unlocks the fixed 424242 OTP for the sign-in device-verification
  // challenge (NOT the signup flow — admin-created users skip that entirely).
  const email = `chama360.throwaway+${suffix}+clerk_test@example.com`;
  const password = 'Temp' + Math.random().toString(36).slice(2, 10) + '!1';

  const user = await clerkClient.users.createUser({
    emailAddress: [email],
    password,
    firstName: 'Throwaway',
    lastName: 'Tester',
  });

  console.log('✅ Clerk user created (pre-verified, no email sent):');
  console.log(`   email:    ${email}`);
  console.log(`   password: ${password}`);
  console.log(`   userId:   ${user.id}`);
  console.log('   Sign in at /sign-in with the above. A "new device" OTP challenge');
  console.log('   will fire — use the fixed test code: 424242');

  if (args.group) {
    await mongoose.connect(process.env.MONGODB_URI);
    const Group = require('../models/Group');
    const GroupMember = require('../models/GroupMember');
    const GroupSettings = require('../models/GroupSettings');
    const BankBalance = require('../models/BankBalance');
    const SocialFundBalance = require('../models/SocialFundBalance');
    const ContributionType = require('../models/ContributionType');
    const GroupTemplate = require('../models/GroupTemplate');

    const groupName = args.group;
    const slug = groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + suffix;
    const templateKey = args.template || 'village_bank';
    const template = await GroupTemplate.findOne({ key: templateKey, active: true });

    const trialExpiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const group = await Group.create({ name: groupName, slug, clerkAdminId: user.id, trialExpiresAt, isPaid: false });
    const member = await GroupMember.create({
      clerkUserId: user.id, groupId: group._id, role: args.role || 'admin',
      name: 'Throwaway Tester', isVerified: true,
    });
    const defaults = template?.defaults || {
      cycleLengthMonths: 6, interestRate: 10, interestMethod: 'reducing',
      defaultLoanDuration: 4, loanLimitMultiplier: 3, latePenaltyRate: 15,
      overdueFineAmount: 1000, earlyPaymentCharge: 200, partialPaymentFineAmount: 0,
      savingsInterestRate: 10, minimumSavingsMonth1: 3000, minimumSavingsMonthly: 1000,
      maximumSavingsFirst3Months: 5000, savingsShortfallFine: 500,
      profitSharingMethod: 'proportional', interestObligationAmount: 0,
    };
    const policies = template?.policies || {
      loanAccrual: 'scheduled_reducing', arrears: 'none', loanLimit: 'savings_multiple',
      concurrentLoans: 'unlimited', interestObligation: 'none',
      cycleEnd: 'shareout_proportional', exit: 'settle_and_refund',
    };
    await GroupSettings.create({ groupId: group._id, groupName, ...defaults, templateKey, policies });
    await BankBalance.create({ groupId: group._id, balance: 0 });
    await SocialFundBalance.create({ groupId: group._id, balance: 0 });
    await ContributionType.create([
      { groupId: group._id, name: 'Admin Fee', affectsMainBalance: true, isDefault: true, active: true },
      { groupId: group._id, name: 'Social Fund', affectsMainBalance: false, isDefault: true, active: true },
    ]);

    console.log(`✅ Group created: "${groupName}" (template: ${templateKey}${template ? '' : ' — fallback, not seeded'})`);
    console.log(`   groupId:  ${group._id}`);
    console.log(`   memberId: ${member._id} (role: ${member.role})`);
    console.log('\nCleanup when done:');
    console.log(`   node scripts/createThrowawayTestUser.js --delete ${user.id} --groupId ${group._id}`);

    await mongoose.disconnect();
  } else {
    console.log('\nNo --group given — this account has no group, so it will land on');
    console.log('/welcome → /onboarding after sign-in (useful for testing the wizard).');
    console.log('\nCleanup when done:');
    console.log(`   node scripts/createThrowawayTestUser.js --delete ${user.id}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.delete) {
    await deleteFlow(args);
  } else {
    await createFlow(args);
  }
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
