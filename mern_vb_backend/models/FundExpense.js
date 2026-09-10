const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Debit side of a GroupFund's mini-ledger. Formerly SocialFundExpense — renamed
 * because a group can now hold several named pots, not just a welfare fund.
 *
 * Deliberately bound to the EXISTING `socialfundexpenses` collection: the rename
 * is a naming fix, not a data migration, and rewriting a collection of real
 * financial records to change a word would be a poor trade.
 */
const fundExpenseSchema = new Schema({
  fundId:              { type: Schema.Types.ObjectId, ref: 'GroupFund', default: null }, // backfilled to the group's social fund for pre-existing rows
  groupId:             { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  amount:              { type: Number, required: true, min: 0.01 },
  category:            { type: String, enum: ['birthday', 'bereavement', 'stationery', 'refreshments', 'app_subscription', 'other'], default: 'other' },
  description:         { type: String, required: true, trim: true },
  beneficiaryMemberId: { type: Schema.Types.ObjectId, ref: 'GroupMember', default: null },
  beneficiaryName:     { type: String, default: null },   // free-text name for external payees
  recordedBy:          { type: Schema.Types.ObjectId, ref: 'GroupMember', required: true },
  transactionId:       { type: Schema.Types.ObjectId, ref: 'Transaction' },
  cancelled:           { type: Boolean, default: false },
  cancelledAt:         { type: Date },
  cancelReason:        { type: String },
  date:                { type: Date, default: Date.now },
  cycleNumber:         { type: Number },
  cycleEndDate:        { type: Date },
  archived:            { type: Boolean, default: false },
}, { timestamps: true, collection: 'socialfundexpenses' });

fundExpenseSchema.index({ groupId: 1, createdAt: -1 });

module.exports = mongoose.model('FundExpense', fundExpenseSchema);
