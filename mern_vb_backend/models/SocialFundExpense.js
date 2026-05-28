const mongoose = require('mongoose');
const { Schema } = mongoose;

const socialFundExpenseSchema = new Schema({
  groupId:             { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  amount:              { type: Number, required: true, min: 0.01 },
  category:            { type: String, enum: ['birthday', 'bereavement', 'stationery', 'refreshments', 'other'], default: 'other' },
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
}, { timestamps: true });

socialFundExpenseSchema.index({ groupId: 1, createdAt: -1 });

module.exports = mongoose.model('SocialFundExpense', socialFundExpenseSchema);
