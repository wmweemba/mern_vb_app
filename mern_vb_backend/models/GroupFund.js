const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * A named pot of money held alongside — but never inside — the main lending pool.
 *
 * Replaces the single-purpose `SocialFundBalance`, which hardcoded exactly one
 * side pot per group. `ContributionType.fundId` points here; a null fundId means
 * the contribution lands in `BankBalance` (the main pool) instead.
 *
 * `BankBalance` is deliberately NOT modelled here. Folding the main lending pool
 * into a generic fund abstraction would rewrite the most load-bearing arithmetic
 * in the app to solve a side-pot problem — see docs/plan_demo_environment.md's
 * sibling discussion in docs/plan_db_cutover_and_grace_migration.md section 7.
 *
 * Reserved keys:
 *   social_fund      — welfare pot; seeded when the group's template has it
 *   app_subscription — money collected from members to pay the group's Chama360
 *                      bill; seeded for EVERY group regardless of template,
 *                      inactive until a treasurer switches it on, because paying
 *                      for the app is a platform fact rather than a group-model
 *                      variation (see P-013 in the second brain)
 */
const groupFundSchema = new Schema({
  groupId:  { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  key:      { type: String, required: true, trim: true },
  name:     { type: String, required: true, trim: true },
  balance:  { type: Number, required: true, default: 0 },
  active:   { type: Boolean, default: true },
  isDefault:{ type: Boolean, default: false },
}, { timestamps: true });

groupFundSchema.index({ groupId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('GroupFund', groupFundSchema);
