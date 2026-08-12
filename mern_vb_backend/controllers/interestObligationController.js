// Interest Obligation report (docs/plan_configurable_group_rules.md Phase 3).
// The target is stored (GroupSettings.interestObligationAmount); everything else is
// derived from Loan/Contribution records so it can never drift out of sync with them —
// same "derive, don't store" rule the plan applies to the loan-limit cap.
const GroupMember = require('../models/GroupMember');
const Loan = require('../models/Loans');
const Contribution = require('../models/Contribution');
const { getSettings } = require('./groupSettingsController');

function round2(n) {
  return +Number(n).toFixed(2);
}

// Interest actually paid on a loan, regardless of accrual family. Revolving loans
// record each interest payment as its own ledger entry; scheduled loans don't, so a
// paid (or interest-covered partial) installment's interest portion is credited
// instead — mirrors the interest-first allocation convention already used elsewhere
// in the app (utils/strategies/loanAccrual/scheduledCommon.js).
function interestPaidOnLoan(loan) {
  if (loan.accrualMode === 'revolving') {
    return (loan.entries || [])
      .filter(e => e.type === 'interest_payment')
      .reduce((sum, e) => sum + e.amount, 0);
  }
  return (loan.installments || []).reduce((sum, inst) => {
    if (inst.paid) return sum + inst.interest;
    if (inst.paidAmount > 0) return sum + Math.min(inst.paidAmount, inst.interest);
    return sum;
  }, 0);
}

// Builds one row per member. `onlyMemberId` scopes to a single member (self-serve).
async function buildReport(req, onlyMemberId) {
  const settings = await getSettings(req.groupId);
  const target = round2(Number(settings.interestObligationAmount) || 0);

  const memberFilter = { ...req.groupScope, active: true, deletedAt: null };
  if (onlyMemberId) memberFilter._id = onlyMemberId;
  const members = await GroupMember.find(memberFilter).select('name');

  const loans = await Loan.find({ ...req.groupScope, archived: { $ne: true } });
  const contributions = await Contribution.find({
    ...req.groupScope, archived: { $ne: true }, countsTowardInterestObligation: true,
  });

  const loansByMember = new Map();
  for (const loan of loans) {
    const key = String(loan.userId);
    loansByMember.set(key, (loansByMember.get(key) || 0) + interestPaidOnLoan(loan));
  }

  const contributionsByMember = new Map();
  for (const c of contributions) {
    const key = String(c.userId);
    contributionsByMember.set(key, (contributionsByMember.get(key) || 0) + c.amount);
  }

  return members.map(member => {
    const key = String(member._id);
    const creditedFromLoans = round2(loansByMember.get(key) || 0);
    const creditedFromContributions = round2(contributionsByMember.get(key) || 0);
    const credited = round2(creditedFromLoans + creditedFromContributions);
    return {
      memberId: member._id,
      name: member.name,
      target,
      creditedFromLoans,
      creditedFromContributions,
      credited,
      shortfall: round2(Math.max(0, target - credited)),
    };
  });
}

exports.getInterestObligationReport = async (req, res) => {
  try {
    const settings = await getSettings(req.groupId);
    const rows = await buildReport(req);
    res.json({ target: round2(Number(settings.interestObligationAmount) || 0), rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build interest obligation report', details: err.message });
  }
};

// Exported for direct unit testing (pure function, no DB/HTTP needed).
exports.interestPaidOnLoan = interestPaidOnLoan;

exports.getMyInterestObligation = async (req, res) => {
  try {
    const [row] = await buildReport(req, req.memberId);
    if (!row) return res.status(404).json({ error: 'Member not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load interest obligation', details: err.message });
  }
};
