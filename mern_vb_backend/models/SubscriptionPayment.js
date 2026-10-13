const mongoose = require('mongoose');
const { Schema } = mongoose;

const subscriptionPaymentSchema = new Schema({
  groupId:             { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  initiatedByMemberId: { type: Schema.Types.ObjectId, ref: 'GroupMember', required: true },
  initiatedByName:     String,              // denormalized, same pattern as Fine.username
  payerEmail:          String,              // for the receipt
  plan:                { type: String, enum: ['starter', 'standard'], required: true },
  periodMonths:        { type: Number, required: true, default: 1 },
  amount:              { type: Number, required: true },   // amount actually requested from Lipila
  currency:            { type: String, default: 'ZMW' },
  isTestAmount:        { type: Boolean, default: false },
  msisdn:              { type: String, required: true },   // 2609XXXXXXXX; never returned to the client unmasked
  reference:           { type: String, required: true }, // sent as Lipila referenceId; unique index below
  status:              { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  providerIdentifier:  String,              // LPLXC-…
  providerExternalId:  String,              // MNO transaction id
  failureReason:       String,              // raw provider text — admin only, never sent to the browser
  amountMismatch:      { type: Boolean, default: false },
  wasLateSuccess:      { type: Boolean, default: false },
  rawResponse:         Schema.Types.Mixed,
  paidUntilAfter:      Date,                // Group.paidUntil after this payment applied
  lastCheckedAt:       Date,
  completedAt:         Date,
}, {
  timestamps: true,
  // Payment records are proof of real money and MNO references and must outlive
  // their group — a deleted group doesn't erase the fact that money moved. Same
  // precedent as BazaBooks. scripts/utils/groupScopedModels.js skips any model
  // with this flag set, so deleteGroups.js / cleanupOrphanedRecords.js /
  // createThrowawayTestUser.js --delete never sweep these rows.
  retainOnGroupDelete: true,
});

subscriptionPaymentSchema.index({ reference: 1 }, { unique: true });
subscriptionPaymentSchema.index({ groupId: 1, createdAt: -1 });
subscriptionPaymentSchema.index({ msisdn: 1, createdAt: -1 });
subscriptionPaymentSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);
