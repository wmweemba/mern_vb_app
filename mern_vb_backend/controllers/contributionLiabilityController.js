// Contribution liability report (docs/plan_configurable_group_rules.md Phase 4).
// No new model — any ContributionType with targetAmountPerMember > 0 becomes a
// per-member liability (e.g. a K250 membership fee payable in instalments). Paid /
// outstanding are derived from Contribution records, same "derive, don't store" rule
// Phase 3's interest obligation report already follows.
const GroupMember = require('../models/GroupMember');
const ContributionType = require('../models/ContributionType');
const Contribution = require('../models/Contribution');

function round2(n) {
  return +Number(n).toFixed(2);
}

// Exported for direct unit testing (pure function, no DB needed).
function computeLiabilityRow(target, paid) {
  const t = round2(target);
  const p = round2(paid);
  return { target: t, paid: p, outstanding: round2(Math.max(0, t - p)) };
}

// Builds one entry per liability type, each with one row per member.
// `onlyMemberId` scopes every type's rows to a single member (self-serve).
async function buildReport(req, onlyMemberId) {
  const liabilityTypes = await ContributionType.find({
    ...req.groupScope, targetAmountPerMember: { $gt: 0 },
  });
  if (liabilityTypes.length === 0) return [];

  const memberFilter = { ...req.groupScope, active: true, deletedAt: null };
  if (onlyMemberId) memberFilter._id = onlyMemberId;
  const members = await GroupMember.find(memberFilter).select('name');

  const contributions = await Contribution.find({
    ...req.groupScope,
    archived: { $ne: true },
    contributionTypeId: { $in: liabilityTypes.map(t => t._id) },
  });

  const paidByTypeAndMember = new Map();
  for (const c of contributions) {
    const key = `${c.contributionTypeId}:${c.userId}`;
    paidByTypeAndMember.set(key, (paidByTypeAndMember.get(key) || 0) + c.amount);
  }

  return liabilityTypes.map(type => ({
    contributionTypeId: type._id,
    name: type.name,
    target: round2(type.targetAmountPerMember),
    rows: members.map(member => {
      const paid = paidByTypeAndMember.get(`${type._id}:${member._id}`) || 0;
      return { memberId: member._id, name: member.name, ...computeLiabilityRow(type.targetAmountPerMember, paid) };
    }),
  }));
}

exports.computeLiabilityRow = computeLiabilityRow;

exports.getContributionLiabilityReport = async (req, res) => {
  try {
    const types = await buildReport(req);
    res.json({ types });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build contribution liability report', details: err.message });
  }
};

exports.getMyContributionLiability = async (req, res) => {
  try {
    const types = await buildReport(req, req.memberId);
    const rows = types.map(t => ({
      contributionTypeId: t.contributionTypeId,
      name: t.name,
      target: t.target,
      paid: t.rows[0]?.paid ?? 0,
      outstanding: t.rows[0]?.outstanding ?? t.target,
    }));
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load contribution liability', details: err.message });
  }
};
