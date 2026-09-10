/**
 * One-off import of Grace's group's June–August 2026 cycle from the artifact
 * produced by scripts/extractGraceWorkbook.js. Session 7 of
 * docs/plan_db_cutover_and_grace_migration.md.
 *
 * NOT production code. It exists to run a handful of times and then be retired.
 *
 * Design notes worth knowing before changing anything:
 *
 *  - It drives the real accrual strategy (utils/strategies/loanAccrual/revolvingMonthly)
 *    and the real balance helpers, not hand-written document writes. Re-implementing
 *    the arithmetic here is exactly the risk this import exists to avoid.
 *  - **Interest is accrued at an effective rate derived from Simon's own figures**,
 *    not a flat 10%. His book rounds — Patricia's August interest is K512 where 10%
 *    of K5,113 is K511.30 — and a flat rate would leave K0.70 outstanding forever
 *    and put the app permanently out of step with the group's records.
 *  - Order within a month is load-bearing: accrue on the OPENING balance, then take
 *    payments, then disburse new loans. The workbook charges interest before that
 *    month's new borrowing (verified against every row).
 *  - June/July close at -33 and -36. Those are real and Simon confirmed they carry
 *    as-is. Posting in date order reproduces them as history rather than netting
 *    them away. Nothing rejects a negative bank balance.
 *
 *   node scripts/importGraceCycle.js <artifact.json> --group <groupId>
 *   node scripts/importGraceCycle.js <artifact.json> --group <groupId> --reset-first --apply
 */
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const { printTarget, maskUri } = require('./utils/productionGuard');

const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupSettings = require('../models/GroupSettings');
const GroupFund = require('../models/GroupFund');
const BankBalance = require('../models/BankBalance');
const Loan = require('../models/Loans');
const Saving = require('../models/Savings');
const Fine = require('../models/Fine');
const Contribution = require('../models/Contribution');
const ContributionType = require('../models/ContributionType');
const FundExpense = require('../models/FundExpense');
const Transaction = require('../models/Transaction');

const revolving = require('../utils/strategies/loanAccrual/revolvingMonthly');
const { updateBankBalance } = require('../controllers/bankBalanceController');
const { updateFundBalance, ensureFund, APP_SUBSCRIPTION_KEY } = require('../controllers/fundController');
const { logTransaction } = require('../controllers/transactionController');

const APPLY = process.argv.includes('--apply');
const RESET_FIRST = process.argv.includes('--reset-first');
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; };
const clientOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };

/** Month key '2026-06' → the last day of that month, so entries land inside the month. */
function monthEndDate(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 12, 0, 0));
}

/**
 * Match a workbook first name to exactly one GroupMember. Ambiguity is fatal:
 * this group contains both "Maluba Siakapa" and "Mateba Siakapa" — two different
 * members who are related and share a surname (confirmed by William 2026-09-10) —
 * and guessing would post one member's money to another. Matching on the first
 * name keeps them distinct; never relax this to a surname or substring match.
 */
function sharedPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// Keyed by lowercased workbook name. The workbook is not internally consistent about
// capitalisation — the Membership sheet has "malambo" where the August sheet has
// "Malambo" — so lookups must not depend on it.
function resolveMembers(workbookNames, members) {
  const map = new Map();
  const problems = [];
  for (const name of workbookNames) {
    const needle = name.trim().toLowerCase();
    const hits = members.filter(m => String(m.name || '').trim().toLowerCase().startsWith(needle));
    if (hits.length === 1) { map.set(needle, hits[0]); continue; }
    if (hits.length === 0) {
      // Offer near-misses. Spelling variants between the workbook and the app are
      // common and easy to resolve by eye — "Tabitha" vs "Tabita Mtonga" — but they
      // must be confirmed and aliased explicitly, never guessed at here.
      // Compare against every token of the member's name, not just the leading
      // characters — the workbook uses a surname for at least one member
      // ("Saasa" -> "Batizani Saasa"), which a leading-prefix check misses entirely.
      const close = members
        .map(m => {
          const full = String(m.name || '').toLowerCase();
          const best = Math.max(
            sharedPrefix(needle, full),
            ...full.split(/\s+/).map(tok => (tok.startsWith(needle) || needle.startsWith(tok) ? Math.min(tok.length, needle.length) : sharedPrefix(needle, tok)))
          );
          return { name: m.name, score: best };
        })
        .filter(c => c.score >= 4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(c => `"${c.name}"`);
      problems.push(`no GroupMember matches "${name}"` + (close.length ? ` — did you mean ${close.join(' or ')}? Add an alias in extractGraceWorkbook.js` : ''));
      continue;
    }
    problems.push(`"${name}" is ambiguous — matches ${hits.map(h => h.name).join(', ')}`);
  }
  return { map, problems };
}

async function ensureType(groupId, name, opts, session) {
  let type = await ContributionType.findOne({ groupId, name }).collation({ locale: 'en', strength: 2 }).session(session);
  if (type) return type;
  const [created] = await ContributionType.create([{ groupId, name, active: true, isDefault: false, ...opts }], { session, ordered: true });
  return created;
}

async function run() {
  const artifactPath = process.argv[2];
  const groupId = arg('--group');
  if (!artifactPath || !groupId) {
    console.error('Usage: node scripts/importGraceCycle.js <artifact.json> --group <groupId> [--reset-first] [--apply]');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri, clientOptions);

  console.log('\n📥 Grace cycle import');
  printTarget(maskUri(uri), APPLY ? 'APPLY (writes will happen)' : 'DRY RUN (no writes — pass --apply to execute)');

  const group = await Group.findById(groupId);
  if (!group) throw new Error(`No group ${groupId}`);
  const settings = await GroupSettings.findOne({ groupId });
  console.log(`\n   Group: ${group.name}`);
  console.log(`   Template: ${settings?.templateKey}  accrual: ${settings?.policies?.loanAccrual}`);
  if (settings?.policies?.loanAccrual !== 'revolving_monthly') {
    throw new Error(`Group is not on revolving accrual (${settings?.policies?.loanAccrual}). Re-template before importing.`);
  }

  const members = await GroupMember.find({ groupId, deletedAt: null });
  const { map: memberMap, problems } = resolveMembers(data.members, members);
  console.log(`   Members: ${data.members.length} in workbook, ${members.length} in app, ${memberMap.size} matched`);
  if (problems.length) {
    console.error('\n❌ Member matching failed — nothing written:\n');
    problems.forEach(p => console.error(`   - ${p}`));
    console.error('\n   Fix the roster (or the workbook names) and re-run.\n');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Existing-data guard. The import assumes an empty cycle; running it over the
  // trial data would double every figure.
  const existing = {
    loans: await Loan.countDocuments({ groupId, archived: { $ne: true } }),
    savings: await Saving.countDocuments({ groupId, archived: { $ne: true } }),
    contributions: await Contribution.countDocuments({ groupId, archived: { $ne: true } }),
    transactions: await Transaction.countDocuments({ groupId, archived: { $ne: true } }),
  };
  const hasData = Object.values(existing).some(n => n > 0);
  if (hasData) {
    console.log(`\n   Existing current-cycle data: ${JSON.stringify(existing)}`);
    if (!RESET_FIRST) {
      console.error('\n❌ Group already holds current-cycle data. Pass --reset-first to clear it, or clear it yourself.\n');
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log('   --reset-first: this data will be DELETED before import.');
  }

  const plan = buildPlan(data, memberMap);
  const mismatches = report(plan, data);
  if (mismatches.length) {
    console.error(`\n❌ Projected end state disagrees with the signed-off figures (${mismatches.join(', ')}).`);
    console.error('   Nothing written. Resolve the source data with the treasurer first — a projection that');
    console.error('   does not reconcile means the workbook and the agreed totals disagree, and importing');
    console.error('   either one silently picks a side.\n');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to execute.\n');
    await mongoose.disconnect();
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (RESET_FIRST) {
        const f = { groupId, archived: { $ne: true } };
        await Promise.all([
          Loan.deleteMany(f, { session }), Saving.deleteMany(f, { session }),
          Fine.deleteMany(f, { session }), Contribution.deleteMany(f, { session }),
          FundExpense.deleteMany(f, { session }), Transaction.deleteMany(f, { session }),
        ]);
        await BankBalance.findOneAndUpdate({ groupId }, { balance: 0 }, { upsert: true, session });
        await GroupFund.updateMany({ groupId }, { balance: 0 }, { session });
      }
      await execute(plan, data, groupId, session);
    });
    console.log('\n✅ Import complete.\n');
  } finally {
    await session.endSession();
  }

  await mongoose.disconnect();
}

/** Turn the artifact into an ordered list of operations, without touching the DB. */
function buildPlan(data, memberMap) {
  const ops = [];
  const balances = new Map(); // member name → running principal balance
  for (const [monthIndex, month] of data.months.entries()) {
    const date = monthEndDate(month.key);
    // Saving.month is the CYCLE month number (1-based), not a calendar month —
    // GroupSettings' savings rules key off "month 1" vs "month > 1". Their cycle
    // opens in June, so June is 1.
    const cycleMonth = monthIndex + 1;
    for (const e of month.entries) {
      const opening = balances.get(e.name) || 0;

      // 1. Accrue on the OPENING balance, at the rate Simon actually charged.
      if (e.loanInterestPaid > 0) {
        if (opening <= 0) throw new Error(`${e.name} ${month.key}: interest K${e.loanInterestPaid} with no opening balance`);
        ops.push({ kind: 'accrue', month: month.key, date, name: e.name,
          amount: e.loanInterestPaid, effectiveRate: (e.loanInterestPaid / opening) * 100 });
      }
      // 2. Payments — interest and principal, exactly as recorded.
      if (e.loanInterestPaid > 0 || e.loanRepayment > 0) {
        ops.push({ kind: 'payment', month: month.key, date, name: e.name,
          toInterest: e.loanInterestPaid, toPrincipal: e.loanRepayment,
          amount: round2(e.loanInterestPaid + e.loanRepayment) });
      }
      // 3. New borrowing, after interest is charged.
      if (e.newLoan > 0) ops.push({ kind: 'disburse', month: month.key, date, name: e.name, amount: e.newLoan });

      balances.set(e.name, round2(opening - e.loanRepayment + e.newLoan));

      if (e.monthlyContribution > 0) ops.push({ kind: 'saving', month: month.key, cycleMonth, date, name: e.name, amount: e.monthlyContribution });
      if (e.addedInterest > 0) ops.push({ kind: 'contribution', typeKey: 'interestTopUp', month: month.key, date, name: e.name, amount: e.addedInterest });
      if (e.membershipFeePaid > 0) ops.push({ kind: 'contribution', typeKey: 'membershipFee', month: month.key, date, name: e.name, amount: e.membershipFeePaid });
      if (e.subscription > 0) ops.push({ kind: 'contribution', typeKey: 'appSubscription', month: month.key, date, name: e.name, amount: e.subscription });
    }
  }
  return { ops, closingBalances: balances };
}

function report(plan, data) {
  const byKind = plan.ops.reduce((a, o) => { a[o.kind] = (a[o.kind] || 0) + 1; return a; }, {});
  console.log(`\n   Operations: ${plan.ops.length}`);
  Object.entries(byKind).forEach(([k, n]) => console.log(`     ${k.padEnd(14)} ${n}`));

  const closing = round2([...plan.closingBalances.values()].reduce((s, v) => s + v, 0));
  const cash = round2(plan.ops.reduce((s, o) => {
    if (o.kind === 'disburse') return s - o.amount;
    if (o.kind === 'payment' || o.kind === 'saving') return s + o.amount;
    if (o.kind === 'contribution' && o.typeKey !== 'appSubscription') return s + o.amount;
    return s;
  }, 0));
  const subs = round2(plan.ops.filter(o => o.typeKey === 'appSubscription').reduce((s, o) => s + o.amount, 0));

  console.log('\n   Projected end state vs signed-off figures:');
  const mismatches = [];
  const chk = (label, actual, expected) => {
    const ok = Math.abs(actual - expected) < 0.01;
    if (!ok) mismatches.push(label);
    console.log(`     ${ok ? '✅' : '❌'} ${label.padEnd(30)} ${String(actual).padStart(10)}  (expected ${expected})`);
  };
  chk('outstanding principal', closing, data.totals.outstandingAt31Aug);
  chk('bank balance', cash, data.totals.cashAt31Aug);
  chk('app subscription fund', subs, data.totals.subscriptionCollected);
  return mismatches;
}

async function execute(plan, data, groupId, session) {
  const settings = await GroupSettings.findOne({ groupId }).session(session);
  const members = await GroupMember.find({ groupId, deletedAt: null }).session(session);
  const { map: memberMap } = resolveMembers(data.members, members);
  const recordedBy = members.find(m => ['admin', 'treasurer'].includes(m.role))?._id || members[0]._id;

  const appFund = await ensureFund(groupId, APP_SUBSCRIPTION_KEY, 'App Subscription Fund', { active: true, isDefault: true, resetsOnCycle: false }, session);
  await GroupFund.updateOne({ _id: appFund._id }, { $set: { active: true } }, { session });

  const types = {
    interestTopUp: await ensureType(groupId, 'Interest Top-Up', { fundId: null, affectsMainBalance: true, countsTowardInterestObligation: true }, session),
    membershipFee: await ensureType(groupId, 'Membership Fee', { fundId: null, affectsMainBalance: true, targetAmountPerMember: data.membershipFeeTarget }, session),
    appSubscription: await ensureType(groupId, 'App Subscription', { fundId: appFund._id, affectsMainBalance: false, targetAmountPerMember: 12 }, session),
  };

  const loans = new Map(); // member id → loan doc

  for (const op of plan.ops) {
    const member = memberMap.get(op.name.trim().toLowerCase());
    if (!member) throw new Error(`No member resolved for "${op.name}" (${op.month}) — roster and workbook disagree`);
    const uid = String(member._id);

    if (op.kind === 'accrue') {
      const loan = loans.get(uid);
      if (!loan) throw new Error(`${op.name} ${op.month}: accrual with no loan`);
      revolving.accrue(loan, { periodLabel: op.month, rate: op.effectiveRate, date: op.date, recordedBy });
      await loan.save({ session });

    } else if (op.kind === 'payment') {
      const loan = loans.get(uid);
      if (!loan) throw new Error(`${op.name} ${op.month}: payment with no loan`);
      const tx = await logTransaction({ userId: member._id, type: 'loan_payment', amount: op.amount,
        referenceId: loan._id, note: `Imported ${op.month} repayment`, groupId, createdAt: op.date }, session);
      revolving.applyPayment(loan, op.amount, { toInterest: op.toInterest, toPrincipal: op.toPrincipal },
        { date: op.date, transactionId: tx._id, recordedBy });
      await loan.save({ session });
      await updateBankBalance(op.amount, groupId, session);

    } else if (op.kind === 'disburse') {
      let loan = loans.get(uid);
      const tx = await logTransaction({ userId: member._id, type: 'loan', amount: op.amount,
        referenceId: loan ? loan._id : undefined, note: `Imported ${op.month} disbursement`, groupId, createdAt: op.date }, session);
      if (!loan) {
        const shape = revolving.onDisburse(null, op.amount, { date: op.date, transactionId: tx._id, recordedBy });
        const [created] = await Loan.create([{ groupId, userId: member._id, amount: op.amount,
          durationMonths: settings.cycleLengthMonths || 6,
          interestRate: settings.interestRate,
          interestMethod: settings.interestMethod,
          installments: [],
          createdAt: op.date, startDate: op.date, ...shape }], { session, ordered: true });
        loan = created;
        loans.set(uid, loan);
      } else {
        revolving.onDisburse(loan, op.amount, { date: op.date, transactionId: tx._id, recordedBy });
        await loan.save({ session });
      }
      await updateBankBalance(-op.amount, groupId, session);

    } else if (op.kind === 'saving') {
      const [saving] = await Saving.create([{ groupId, userId: member._id, amount: op.amount,
        month: op.cycleMonth, date: op.date, createdAt: op.date }], { session, ordered: true });
      await logTransaction({ userId: member._id, type: 'saving', amount: op.amount,
        referenceId: saving._id, note: `Imported ${op.month} contribution`, groupId, createdAt: op.date }, session);
      await updateBankBalance(op.amount, groupId, session);

    } else if (op.kind === 'contribution') {
      const type = types[op.typeKey];
      const fund = type.fundId ? await GroupFund.findById(type.fundId).session(session) : null;
      const [contribution] = await Contribution.create([{ groupId, userId: member._id,
        contributionTypeId: type._id, typeName: type.name, amount: op.amount,
        fundId: fund ? fund._id : null, fundName: fund ? fund.name : null,
        affectsMainBalance: !fund, overrodeDefault: false,
        countsTowardInterestObligation: type.countsTowardInterestObligation,
        recordedBy, date: op.date, createdAt: op.date }], { session, ordered: true });
      const tx = await logTransaction({ userId: member._id, type: fund ? 'fund_credit' : 'contribution',
        amount: op.amount, referenceId: contribution._id, note: `Imported ${op.month} ${type.name}`,
        groupId, createdAt: op.date }, session);
      contribution.transactionId = tx._id;
      await contribution.save({ session });
      if (fund) await updateFundBalance(fund._id, op.amount, session);
      else await updateBankBalance(op.amount, groupId, session);
    }
  }
}

run().catch(err => { console.error('\n❌', err.message, '\n'); process.exit(1); });
