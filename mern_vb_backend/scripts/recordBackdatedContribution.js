/**
 * recordBackdatedContribution.js — post one main-pool or fund contribution for a
 * member at a past date, inside a transaction, with the same document shape the
 * app and importGraceCycle.js produce (Contribution + Transaction + balance).
 *
 * Exists for the case where a treasurer's own book has an entry the app never saw —
 * first use 2026-09-11: Simon Peter covered Grace's June (-33) and July (-36) cash
 * shortfalls from his own pocket, which his workbook never recorded. Recording it
 * through the UI needs a signed-in member of that group; a super admin fails closed.
 *
 * Usage (dry run by default; nothing is written without --apply):
 *   node scripts/recordBackdatedContribution.js --group <groupId> --member "Simon" \
 *     --type "Treasurer Top-Up" --amount 33 --date 2026-06-30 --note "..." [--apply]
 *
 * --type is matched by name (case-insensitive) among the group's active types; with
 * --create-type it is created as a plain main-pool type (no fund, no target, does not
 * count toward the interest quota) if missing. The member is matched on a
 * case-insensitive substring of GroupMember.name and must be unique.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const ContributionType = require('../models/ContributionType');
const Contribution = require('../models/Contribution');
const GroupFund = require('../models/GroupFund');
const { updateBankBalance } = require('../controllers/bankBalanceController');
const { updateFundBalance } = require('../controllers/fundController');
const { logTransaction } = require('../controllers/transactionController');

const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; };
const has = (name) => process.argv.includes(name);

(async () => {
  const groupId = arg('--group'), memberQ = arg('--member'), typeQ = arg('--type');
  const amount = Number(arg('--amount')), dateStr = arg('--date'), note = arg('--note') || '';
  if (!groupId || !memberQ || !typeQ || !(amount > 0) || !dateStr) {
    console.error('Required: --group --member --type --amount --date [--note] [--create-type] [--apply]');
    process.exit(1);
  }
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) { console.error(`Bad --date ${dateStr}`); process.exit(1); }

  await mongoose.connect(process.env.MONGODB_URI);
  const group = await Group.findOne({ _id: groupId, deletedAt: null });
  if (!group) { console.error('Group not found'); process.exit(1); }

  const members = await GroupMember.find({ groupId, active: true, name: new RegExp(memberQ, 'i') });
  if (members.length !== 1) {
    console.error(`--member "${memberQ}" matched ${members.length} members: ${members.map(m => m.name).join(', ') || '(none)'}`);
    process.exit(1);
  }
  const member = members[0];
  const recordedBy = (await GroupMember.findOne({ groupId, active: true, role: { $in: ['treasurer', 'admin'] } }))?._id || member._id;

  let type = await ContributionType.findOne({ groupId, active: true, name: new RegExp(`^${typeQ}$`, 'i') });
  const fund = type?.fundId ? await GroupFund.findById(type.fundId) : null;

  console.log(`${has('--apply') ? 'APPLY' : 'DRY RUN'} — ${group.name}`);
  console.log(`  member : ${member.name} (${member._id})`);
  console.log(`  type   : ${type ? `${type.name} → ${fund ? fund.name : 'main lending pool'}` : `"${typeQ}" (missing${has('--create-type') ? ', will create as main-pool type' : ' — pass --create-type'})`}`);
  console.log(`  amount : K${amount}  date: ${date.toISOString().slice(0, 10)}  note: ${note || '(none)'}`);
  if (!type && !has('--create-type')) process.exit(1);
  if (!has('--apply')) { console.log('Nothing written. Re-run with --apply.'); process.exit(0); }

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    if (!type) {
      [type] = await ContributionType.create([{ groupId, name: typeQ, fundId: null, affectsMainBalance: true,
        countsTowardInterestObligation: false, targetAmountPerMember: 0, isDefault: false, active: true }], { session, ordered: true });
    }
    const [contribution] = await Contribution.create([{ groupId, userId: member._id,
      contributionTypeId: type._id, typeName: type.name, amount,
      fundId: fund ? fund._id : null, fundName: fund ? fund.name : null,
      affectsMainBalance: !fund, overrodeDefault: false,
      countsTowardInterestObligation: !!type.countsTowardInterestObligation,
      note, recordedBy, date, createdAt: date }], { session, ordered: true });
    const tx = await logTransaction({ userId: member._id, type: fund ? 'fund_credit' : 'contribution',
      amount, referenceId: contribution._id, note: note || `${type.name} (backdated)`, groupId, createdAt: date }, session);
    contribution.transactionId = tx._id;
    await contribution.save({ session });
    if (fund) await updateFundBalance(fund._id, amount, session);
    else await updateBankBalance(amount, groupId, session);
    console.log(`✅ Recorded contribution ${contribution._id}, transaction ${tx._id}`);
  });
  await session.endSession();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
