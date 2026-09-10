/**
 * DEPRECATED — kept so the existing /api/social-fund routes and any un-migrated
 * caller keep working. All logic now lives in fundController; the social fund is
 * simply the GroupFund with key `social_fund`, so there is exactly one balance
 * per pot rather than two models disagreeing about the same money.
 *
 * `SocialFundBalance` is no longer read or written by application code. It is
 * left in the database, un-dropped, as the pre-migration record (same discipline
 * as SupportRequest.resolutionNote).
 */
const fundController = require('./fundController');

// Legacy signature: (amount, groupId, session). Resolves the group's social fund
// and adjusts it, so old callers cannot drift from the new source of truth.
exports.updateSocialFundBalance = async (amount, groupId, session = null) => {
  const fund = await fundController.getSocialFund(groupId, session);
  return fundController.updateFundBalance(fund._id, amount, session);
};

exports.getBalance = async (req, res) => {
  try {
    const fund = await fundController.getSocialFund(req.groupId);
    res.json({ balance: fund.balance, fundId: fund._id, name: fund.name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch social fund balance', details: err.message });
  }
};

exports.recordExpense = fundController.recordExpense;
exports.listExpenses = fundController.listExpenses;
