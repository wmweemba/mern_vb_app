const PLANS = require('../config/plans');
const GroupMember = require('../models/GroupMember');

// Legacy paid groups without a `plan` assigned yet fall back to Starter's limit
// until backfilled (see scripts/backfillGroupPlans.js) — never treated as unlimited.
async function getMemberLimitStatus(group) {
  const plan = PLANS[group.plan] || PLANS.starter;
  const activeCount = await GroupMember.countDocuments({
    groupId: group._id,
    active: true,
    deletedAt: null,
  });
  return { plan, activeCount, atLimit: activeCount >= plan.memberLimit };
}

module.exports = { getMemberLimitStatus };
