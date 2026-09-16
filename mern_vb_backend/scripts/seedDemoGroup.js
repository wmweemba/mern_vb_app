/**
 * Seeds (or re-seeds) an EXISTING demo group with realistic-looking fictional
 * data — docs/plan_demo_environment.md Session C. Pairs with
 * createThrowawayTestUser.js, which creates the group + its three permanent
 * role accounts (treasurer/loan officer/member); this script fills it with a
 * plausible mid-cycle history so it looks like a real, active group rather
 * than an empty shell.
 *
 * Seeds, on the grocery_chilimba template (revolving monthly loans):
 *   - 7 additional fictional members (no Clerk login — pre-created profiles,
 *     the same pattern real groups use before every member has signed up)
 *   - 3 months of monthly contributions (savings) for every member
 *   - 3 loans at different stages: one fresh (just disbursed, one accrual,
 *     no payment yet), one ongoing/part-repaid, one fully repaid
 *   - Admin Fee (membership fee) + Interest Top-Up contributions to the main
 *     pool, and App Subscription contributions into that fund
 *   - A positive ending bank balance
 *
 * All financial writes go through the same helpers the real controllers use
 * (updateBankBalance, logTransaction, updateFundBalance, and the actual
 * revolvingMonthly loan-accrual strategy) inside one MongoDB session, so the
 * result is exactly as if a treasurer had entered it by hand — auditBankBalance.js
 * and auditFunds.js should both reconcile cleanly afterward.
 *
 * SAFETY: refuses to run against production Mongo (Coolify) — demo data must
 * only ever land in Atlas, never the real customer database. See
 * scripts/utils/productionGuard.js.
 *
 * Usage:
 *   node scripts/seedDemoGroup.js --groupId <id>
 *     → dry run: prints what would be seeded, writes nothing
 *
 *   node scripts/seedDemoGroup.js --groupId <id> --apply
 *     → writes it
 *
 *   node scripts/seedDemoGroup.js --groupId <id> --wipe --apply
 *     → clears all prior seed data for this group first (keeps the group,
 *       settings, and the 3 Clerk-linked role accounts), then re-seeds —
 *       this is the "reset to a clean demo state" path
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { isProductionUri, printTarget } = require('./utils/productionGuard');

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

// No last names shared with real Chama360 customers (Grace's group, William's
// group) — deliberately distinct so nobody mistakes this for real data.
const ROSTER = [
  'Chanda Mwansa', 'Bwalya Phiri', 'Natasha Zulu', 'Kunda Mumba',
  'Mutinta Banda', 'Chileshe Tembo', 'Prudence Lungu',
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.groupId) {
    throw new Error('Usage: node scripts/seedDemoGroup.js --groupId <id> [--wipe] [--apply]');
  }

  const uri = process.env.MONGODB_URI;
  const mode = args.apply ? (args.wipe ? 'WIPE + SEED (writes)' : 'SEED (writes)') : 'DRY RUN (no writes)';
  printTarget(uri, mode);

  if (isProductionUri(uri)) {
    throw new Error(
      'Refusing to run: this looks like the production Mongo URI. Demo data must only ' +
      'ever land in Atlas — see docs/plan_demo_environment.md.'
    );
  }

  await mongoose.connect(uri);

  const Group = require('../models/Group');
  const GroupMember = require('../models/GroupMember');
  const GroupSettings = require('../models/GroupSettings');
  const BankBalance = require('../models/BankBalance');
  const Saving = require('../models/Savings');
  const Loan = require('../models/Loans');
  const Contribution = require('../models/Contribution');
  const ContributionType = require('../models/ContributionType');
  const Transaction = require('../models/Transaction');
  const GroupFund = require('../models/GroupFund');
  const { updateBankBalance } = require('../controllers/bankBalanceController');
  const { logTransaction } = require('../controllers/transactionController');
  const { ensureFund, updateFundBalance, APP_SUBSCRIPTION_KEY } = require('../controllers/fundController');
  const revolvingMonthly = require('../utils/strategies/loanAccrual/revolvingMonthly');

  const group = await Group.findById(args.groupId);
  if (!group) throw new Error(`Group ${args.groupId} not found`);

  const existingMembers = await GroupMember.find({ groupId: group._id });
  const roleMembers = existingMembers.filter((m) => m.clerkUserId);
  if (roleMembers.length === 0) {
    throw new Error(
      'No Clerk-linked members found on this group — expected the 3 demo role accounts ' +
      '(createThrowawayTestUser.js --group / --existing-group) to already exist.'
    );
  }

  if (!args.apply) {
    console.log(`\nWould seed group "${group.name}" (${group._id}):`);
    console.log(`  - ${ROSTER.length} fictional members (+ ${roleMembers.length} existing role accounts = ${roleMembers.length + ROSTER.length} total)`);
    console.log('  - 3 months of savings (K700 x members x 3 months)');
    console.log('  - 3 revolving loans: 1 fresh, 1 ongoing/part-repaid, 1 fully repaid');
    console.log('  - Admin Fee (membership fee) x2, Interest Top-Up x1 — main pool');
    console.log('  - App Subscription x5 — routes to that fund, not the main pool');
    console.log('  - Ends with a positive bank balance');
    if (args.wipe) console.log('\n--wipe was passed: prior seed data would be cleared first (role accounts kept).');
    console.log('\nRe-run with --apply to write.');
    await mongoose.disconnect();
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (args.wipe) {
        await Saving.deleteMany({ groupId: group._id }).session(session);
        await Loan.deleteMany({ groupId: group._id }).session(session);
        await Contribution.deleteMany({ groupId: group._id }).session(session);
        await Transaction.deleteMany({ groupId: group._id }).session(session);
        await GroupMember.deleteMany({ groupId: group._id, clerkUserId: null }).session(session);
        await BankBalance.findOneAndUpdate({ groupId: group._id }, { balance: 0 }, { session });
        await GroupFund.updateMany({ groupId: group._id }, { balance: 0 }, { session });
        console.log('🧹 Wiped prior seed data (kept the group, settings, and the 3 role accounts).');
      }

      // 1. Roster — fictional, no Clerk login, same shape as a real pre-invite profile
      const fictionalMembers = [];
      for (const name of ROSTER) {
        const [m] = await GroupMember.create(
          [{ groupId: group._id, name, role: 'member', isVerified: false }],
          { session }
        );
        fictionalMembers.push(m);
      }
      const allMembers = [...roleMembers, ...fictionalMembers];
      console.log(`✅ ${fictionalMembers.length} fictional members added (roster now ${allMembers.length})`);

      // 2. Settings — interest quota + membership fee target, mirroring a real
      // grocery_chilimba group (Grace's group uses the same shape, different amounts)
      await GroupSettings.findOneAndUpdate(
        { groupId: group._id },
        { interestObligationAmount: 1000 },
        { session }
      );

      const adminFeeType = await ContributionType.findOneAndUpdate(
        { groupId: group._id, name: 'Admin Fee' },
        { targetAmountPerMember: 250 },
        { session, new: true }
      );
      if (!adminFeeType) throw new Error('Expected an "Admin Fee" ContributionType — was this group created via createThrowawayTestUser.js --group?');

      let topUpType = await ContributionType.findOne({ groupId: group._id, name: 'Interest Top-Up' }).session(session);
      if (!topUpType) {
        [topUpType] = await ContributionType.create(
          [{
            groupId: group._id, name: 'Interest Top-Up', fundId: null, affectsMainBalance: true,
            countsTowardInterestObligation: true, isDefault: false, active: true,
          }],
          { session, ordered: true }
        );
      }

      // Pointing a type at a fund is what a real treasurer does to activate it
      // (contributionTypeController.resolveFundId) — mirror that here rather than
      // relying on ensureFund's create-if-missing (it won't flip an existing
      // inactive fund's active flag).
      const appSubFund = await ensureFund(group._id, APP_SUBSCRIPTION_KEY, 'App Subscription Fund', { isDefault: true, resetsOnCycle: false }, session);
      if (!appSubFund.active) {
        appSubFund.active = true;
        await appSubFund.save({ session });
      }
      let appSubType = await ContributionType.findOne({ groupId: group._id, name: 'App Subscription' }).session(session);
      if (!appSubType) {
        [appSubType] = await ContributionType.create(
          [{ groupId: group._id, name: 'App Subscription', fundId: appSubFund._id, affectsMainBalance: false, isDefault: false, active: true }],
          { session, ordered: true }
        );
      }

      const treasurer = roleMembers.find((m) => m.role === 'treasurer') || roleMembers[0];

      // 3. Savings — 3 months, every member
      const months = [
        { label: 6, date: new Date('2026-06-15') },
        { label: 7, date: new Date('2026-07-15') },
        { label: 8, date: new Date('2026-08-15') },
      ];
      let totalSaved = 0;
      for (const mo of months) {
        for (const member of allMembers) {
          await Saving.create([{ userId: member._id, groupId: group._id, month: mo.label, amount: 700, date: mo.date }], { session });
          await updateBankBalance(700, group._id, session);
          await logTransaction(
            { userId: member._id, type: 'saving', amount: 700, groupId: group._id, note: `Monthly contribution — month ${mo.label}`, createdAt: mo.date },
            session
          );
          totalSaved += 700;
        }
      }
      console.log(`✅ Savings seeded: K${totalSaved} across ${months.length} months`);

      // 4. Loans — revolving, using the real accrual strategy so the numbers are
      // exactly what the app itself would have produced.
      async function disburse(member, amount, date) {
        const fields = revolvingMonthly.onDisburse(null, amount, { date, recordedBy: treasurer._id });
        const [loan] = await Loan.create(
          [{ groupId: group._id, userId: member._id, amount, durationMonths: 0, interestRate: 10, interestMethod: 'flat', installments: [], createdAt: date, ...fields }],
          { session }
        );
        await updateBankBalance(-amount, group._id, session);
        await logTransaction(
          { userId: member._id, type: 'loan', amount, groupId: group._id, referenceId: loan._id, note: `Loan of K${amount} disbursed.`, createdAt: date },
          session
        );
        return loan;
      }
      async function accrue(loan, periodLabel, date) {
        revolvingMonthly.accrue(loan, { periodLabel, rate: 10, capitalise: true, recordedBy: treasurer._id, date });
        await loan.save({ session });
      }
      async function pay(loan, member, amount, date) {
        const result = revolvingMonthly.applyPayment(loan, amount, {}, { date, recordedBy: treasurer._id });
        loan.fullyPaid = result.fullyPaid;
        await loan.save({ session });
        await updateBankBalance(amount, group._id, session);
        await logTransaction(
          { userId: member._id, type: 'loan_payment', amount, groupId: group._id, referenceId: loan._id, note: `Loan payment of K${amount}.`, createdAt: date },
          session
        );
      }

      const [borrowerFresh, borrowerPart, borrowerPaid] = fictionalMembers;

      // Fresh — just disbursed, one accrual, no payment yet
      const loanA = await disburse(borrowerFresh, 3000, new Date('2026-08-20'));
      await accrue(loanA, '2026-08', new Date('2026-08-31'));

      // Ongoing / part-repaid — three months of history, still owing
      const loanB = await disburse(borrowerPart, 5000, new Date('2026-06-05'));
      await accrue(loanB, '2026-06', new Date('2026-06-30'));
      await pay(loanB, borrowerPart, 800, new Date('2026-07-10'));   // 500 interest + 300 principal
      await accrue(loanB, '2026-07', new Date('2026-07-31'));
      await pay(loanB, borrowerPart, 470, new Date('2026-08-15'));   // clears July's interest
      await accrue(loanB, '2026-08', new Date('2026-08-31'));

      // Fully repaid
      const loanC = await disburse(borrowerPaid, 2000, new Date('2026-06-10'));
      await accrue(loanC, '2026-06', new Date('2026-06-30'));
      await pay(loanC, borrowerPaid, 2200, new Date('2026-07-05'));  // clears interest + full principal

      console.log('✅ Loans seeded: 1 fresh, 1 ongoing/part-repaid, 1 fully repaid');

      // 5. Contributions
      async function recordContribution(member, type, amount, date, note) {
        const fund = type.fundId ? await GroupFund.findById(type.fundId).session(session) : null;
        const [contribution] = await Contribution.create(
          [{
            groupId: group._id, userId: member._id, contributionTypeId: type._id, typeName: type.name,
            amount, fundId: type.fundId, fundName: fund?.name || null,
            affectsMainBalance: !type.fundId, countsTowardInterestObligation: type.countsTowardInterestObligation,
            recordedBy: treasurer._id, date,
          }],
          { session }
        );
        if (type.fundId) {
          await updateFundBalance(type.fundId, amount, session);
        } else {
          await updateBankBalance(amount, group._id, session);
        }
        await logTransaction(
          { userId: member._id, type: type.fundId ? 'fund_credit' : 'contribution', amount, groupId: group._id, referenceId: contribution._id, note, createdAt: date },
          session
        );
      }

      await recordContribution(fictionalMembers[3], adminFeeType, 250, new Date('2026-06-20'), 'Membership fee');
      await recordContribution(fictionalMembers[4], adminFeeType, 250, new Date('2026-07-20'), 'Membership fee');
      await recordContribution(borrowerFresh, topUpType, 350, new Date('2026-08-25'), 'Interest top-up');
      for (const member of allMembers.slice(0, 5)) {
        await recordContribution(member, appSubType, 12, new Date('2026-08-28'), 'App subscription');
      }

      console.log('✅ Contributions seeded: Admin Fee x2, Interest Top-Up x1, App Subscription x5');

      const finalBalance = await BankBalance.findOne({ groupId: group._id }).session(session);
      console.log(`\n✅ Demo group seeded. Bank balance: K${finalBalance.balance}`);
    });
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
