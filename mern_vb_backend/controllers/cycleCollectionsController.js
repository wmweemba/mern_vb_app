// "Collected This Cycle" dashboard card (docs/plan_cycle_collections_card.md).
// Derive-only, same discipline as interestObligationController /
// contributionLiabilityController — nothing stored, everything computed fresh from
// Loan/Contribution records so it can never drift out of sync with them.
const Loan = require('../models/Loans');
const Contribution = require('../models/Contribution');
const ContributionType = require('../models/ContributionType');

function round2(n) {
  return +Number(n).toFixed(2);
}

// Exported for direct unit testing (pure function, no DB needed).
function summarizeLoans(loans) {
  let monthlyInterest = 0;
  let loanRepayment = 0;
  for (const loan of loans) {
    // Scheduled loans have no entries[] — grocery_chilimba (the only template this
    // card is meaningful for) is revolving-only (Phase 2), so nothing currently
    // needs a scheduled-loan equivalent of this split.
    if (loan.accrualMode !== 'revolving') continue;
    for (const e of loan.entries || []) {
      if (e.type === 'interest_payment') monthlyInterest += e.amount;
      if (e.type === 'principal_payment') loanRepayment += e.amount;
    }
  }
  return { monthlyInterest, loanRepayment };
}

async function buildSummary(req) {
  const loans = await Loan.find({ ...req.groupScope, archived: { $ne: true } });
  const { monthlyInterest, loanRepayment } = summarizeLoans(loans);

  const liabilityTypeIds = (await ContributionType.find({
    ...req.groupScope, targetAmountPerMember: { $gt: 0 },
  }).select('_id')).map(t => t._id);
  const liabilitySet = new Set(liabilityTypeIds.map(String));

  const contributions = await Contribution.find({
    ...req.groupScope,
    archived: { $ne: true },
    $or: [
      { countsTowardInterestObligation: true },
      { contributionTypeId: { $in: liabilityTypeIds } },
    ],
  });

  let addedInterest = 0;
  let membershipFee = 0;
  for (const c of contributions) {
    // A contribution matching both categories is credited once, as addedInterest —
    // avoids double-counting. Not expected in practice (the quota and liability
    // types are seeded as mutually exclusive), but the boundary needs a rule.
    if (c.countsTowardInterestObligation) addedInterest += c.amount;
    else if (liabilitySet.has(String(c.contributionTypeId))) membershipFee += c.amount;
  }

  const total = round2(monthlyInterest + loanRepayment + addedInterest + membershipFee);
  return {
    total,
    monthlyInterest: round2(monthlyInterest),
    loanRepayment: round2(loanRepayment),
    addedInterest: round2(addedInterest),
    membershipFee: round2(membershipFee),
  };
}

exports.summarizeLoans = summarizeLoans;

exports.getCycleCollectionsSummary = async (req, res) => {
  try {
    const summary = await buildSummary(req);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to build cycle collections summary', details: err.message });
  }
};
