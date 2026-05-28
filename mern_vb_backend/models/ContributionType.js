const mongoose = require('mongoose');
const { Schema } = mongoose;

const contributionTypeSchema = new Schema({
  groupId:            { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  name:               { type: String, required: true, trim: true },
  affectsMainBalance: { type: Boolean, required: true, default: true },
  active:             { type: Boolean, default: true },
  isDefault:          { type: Boolean, default: false },
  createdBy:          { type: Schema.Types.ObjectId, ref: 'GroupMember', default: null },
}, { timestamps: true });

// Case-insensitive uniqueness: "Admin fee" and "Admin Fee" treated as same name within a group
contributionTypeSchema.index(
  { groupId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

module.exports = mongoose.model('ContributionType', contributionTypeSchema);
