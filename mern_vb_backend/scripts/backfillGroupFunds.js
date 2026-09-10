/**
 * Backfill for the named-funds migration (Session 5 of
 * docs/plan_db_cutover_and_grace_migration.md).
 *
 * For every non-deleted group:
 *   1. Creates a `social_fund` GroupFund, carrying across the balance from the
 *      deprecated single-purpose SocialFundBalance document.
 *   2. Creates an `app_subscription` GroupFund, INACTIVE — every group gets the
 *      capability because paying for Chama360 is a platform fact, but a group that
 *      doesn't collect for it separately should never see an empty pot (P-013).
 *   3. Points every ContributionType with affectsMainBalance=false at the social
 *      fund. Types with affectsMainBalance=true keep fundId null (= main pool).
 *   4. Backfills fundId/fundName onto historical Contribution rows and fundId onto
 *      FundExpense rows, so reports over past cycles resolve a fund.
 *
 * SocialFundBalance is READ but never written or deleted — it stays as the
 * pre-migration record, the same discipline used for SupportRequest.resolutionNote.
 * Existing social_fund_credit / social_fund_debit Transaction rows are never
 * rewritten.
 *
 * Idempotent: re-running reports zero changes.
 *
 *   node scripts/backfillGroupFunds.js            # dry run
 *   node scripts/backfillGroupFunds.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { printTarget, maskUri } = require('./utils/productionGuard');

const Group = require('../models/Group');
const GroupFund = require('../models/GroupFund');
const SocialFundBalance = require('../models/SocialFundBalance');
const ContributionType = require('../models/ContributionType');
const Contribution = require('../models/Contribution');
const FundExpense = require('../models/FundExpense');

const SOCIAL_FUND_KEY = 'social_fund';
const APP_SUBSCRIPTION_KEY = 'app_subscription';
const APPLY = process.argv.includes('--apply');

const clientOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI is not set.'); process.exit(1); }
  await mongoose.connect(uri, clientOptions);

  console.log('\n💰 GroupFund backfill');
  printTarget(maskUri(uri), APPLY ? 'APPLY (writes will happen)' : 'DRY RUN (no writes — pass --apply to execute)');

  const groups = await Group.find({ deletedAt: null }).sort({ createdAt: 1 });
  console.log(`\n   ${groups.length} non-deleted group(s)\n`);

  const totals = { funds: 0, types: 0, contributions: 0, expenses: 0 };

  for (const group of groups) {
    const groupId = group._id;
    const changes = [];

    // 1 + 2 — the two platform funds
    let social = await GroupFund.findOne({ groupId, key: SOCIAL_FUND_KEY });
    if (!social) {
      const legacy = await SocialFundBalance.findOne({ groupId });
      const balance = legacy ? legacy.balance : 0;
      changes.push(`create social_fund (balance K${balance}${legacy ? ' carried from SocialFundBalance' : ', no legacy doc'})`);
      if (APPLY) {
        social = await GroupFund.create({ groupId, key: SOCIAL_FUND_KEY, name: 'Social Fund', balance, isDefault: true });
      }
      totals.funds++;
    }

    const appFund = await GroupFund.findOne({ groupId, key: APP_SUBSCRIPTION_KEY });
    if (!appFund) {
      changes.push('create app_subscription (inactive)');
      if (APPLY) {
        await GroupFund.create({ groupId, key: APP_SUBSCRIPTION_KEY, name: 'App Subscription Fund', balance: 0, active: false, isDefault: true });
      }
      totals.funds++;
    }

    // 3 — point pot-bound contribution types at the social fund
    const potTypes = await ContributionType.find({ groupId, affectsMainBalance: false, fundId: null });
    if (potTypes.length) {
      changes.push(`point ${potTypes.length} contribution type(s) at social_fund`);
      if (APPLY && social) {
        await ContributionType.updateMany(
          { groupId, affectsMainBalance: false, fundId: null },
          { $set: { fundId: social._id } }
        );
      }
      totals.types += potTypes.length;
    }

    // 4 — historical rows
    const oldContribs = await Contribution.countDocuments({ groupId, affectsMainBalance: false, fundId: null });
    if (oldContribs) {
      changes.push(`stamp ${oldContribs} historical contribution(s) with the social fund`);
      if (APPLY && social) {
        await Contribution.updateMany(
          { groupId, affectsMainBalance: false, fundId: null },
          { $set: { fundId: social._id, fundName: social.name } }
        );
      }
      totals.contributions += oldContribs;
    }

    const oldExpenses = await FundExpense.countDocuments({ groupId, fundId: null });
    if (oldExpenses) {
      changes.push(`stamp ${oldExpenses} historical expense(s) with the social fund`);
      if (APPLY && social) {
        await FundExpense.updateMany({ groupId, fundId: null }, { $set: { fundId: social._id } });
      }
      totals.expenses += oldExpenses;
    }

    if (changes.length) {
      console.log(`   ${group.name}`);
      changes.forEach(c => console.log(`     - ${c}`));
    }
  }

  const total = totals.funds + totals.types + totals.contributions + totals.expenses;
  if (total === 0) {
    console.log('✅ Nothing to backfill — every group already has its funds.\n');
  } else {
    console.log(`\n   Funds: ${totals.funds}  ContributionTypes: ${totals.types}  Contributions: ${totals.contributions}  Expenses: ${totals.expenses}`);
    console.log(APPLY ? '\n✅ Backfill applied.\n' : '\nDry run — nothing written. Re-run with --apply.\n');
  }

  await mongoose.disconnect();
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
