const Group = require('../models/Group');

/**
 * The ONE place a group subscription is extended. Used by the super-admin activate
 * path and by the Lipila resolver. MUST be called inside the caller's session
 * transaction. Reading and then writing the Group doc inside a transaction means a
 * concurrent writer (admin activate vs webhook) raises a WriteConflict, and
 * withTransaction retries. That's the Mongo equivalent of PLAN-15's FOR UPDATE lock.
 *
 * @returns {Promise<null | { group, before, paidUntil }>}  null if the group is missing
 */
async function extendGroupSubscription(session, { groupId, plan, durationMonths, customPaidUntil }) {
  const group = await Group.findById(groupId).session(session);
  if (!group) return null;
  const before = { isPaid: group.isPaid, paidUntil: group.paidUntil, plan: group.plan, trialExpiresAt: group.trialExpiresAt };

  let paidUntil;
  if (customPaidUntil) {
    paidUntil = new Date(customPaidUntil);
  } else {
    const now = new Date();
    const base = (group.paidUntil && group.paidUntil > now) ? new Date(group.paidUntil) : new Date(now);
    base.setMonth(base.getMonth() + durationMonths);
    paidUntil = base;
  }

  group.isPaid = true;
  group.paidUntil = paidUntil;
  group.plan = plan;
  group.trialExpiresAt = new Date('2099-12-31');
  await group.save({ session });
  return { group, before, paidUntil };
}

module.exports = { extendGroupSubscription };
