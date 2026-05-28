const mongoose = require('mongoose');
const { Schema } = mongoose;

const contributionSchema = new Schema({
  groupId:            { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  userId:             { type: Schema.Types.ObjectId, ref: 'GroupMember', required: true },
  contributionTypeId: { type: Schema.Types.ObjectId, ref: 'ContributionType', required: true },
  typeName:           { type: String, required: true },   // denormalized snapshot — preserves history if type is renamed/deactivated
  amount:             { type: Number, required: true, min: 0.01 },
  affectsMainBalance: { type: Boolean, required: true },  // resolved effective value at record time
  overrodeDefault:    { type: Boolean, default: false },  // true when recorder flipped the type's default routing
  note:               { type: String },
  recordedBy:         { type: Schema.Types.ObjectId, ref: 'GroupMember', required: true },
  transactionId:      { type: Schema.Types.ObjectId, ref: 'Transaction' },
  date:               { type: Date, default: Date.now },
  cycleNumber:        { type: Number },
  cycleEndDate:       { type: Date },
  archived:           { type: Boolean, default: false },
}, { timestamps: true });

contributionSchema.index({ groupId: 1, createdAt: -1 });
contributionSchema.index({ groupId: 1, userId: 1 });

module.exports = mongoose.model('Contribution', contributionSchema);
