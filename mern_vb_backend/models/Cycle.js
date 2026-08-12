const mongoose = require('mongoose');
const { Schema } = mongoose;

// docs/plan_configurable_group_rules.md Phase 5 — the authoritative start/end
// dates that cycleNumber alone never gave the app. Until this existed, "current
// cycle" was approximated everywhere as "not archived" (see CLAUDE.md's
// Configurable Group Rules Phase 3 note #6) — that convention is unchanged for
// existing data, but new code should prefer the open Cycle document when it needs
// real dates instead of a boolean.
const cycleSchema = new Schema({
  groupId:     { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  cycleNumber: { type: Number, required: true },
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  status:      { type: String, enum: ['open', 'closed'], default: 'open' },
  // Frozen copy of GroupSettings' parameters/policies at the moment this cycle
  // opened — the same defensive instinct already applied to Contribution.typeName
  // and Contribution.affectsMainBalance. Editing GroupSettings mid-cycle must
  // never restate a closed cycle's arithmetic.
  settingsSnapshot: { type: Schema.Types.Mixed, required: true },
  closedAt:    { type: Date },
}, { timestamps: true });

cycleSchema.index({ groupId: 1, cycleNumber: 1 }, { unique: true });
// At most one open cycle per group — enforced at the app layer (beginNewCycle
// closes the current cycle inside the same transaction that opens the next), this
// partial index just makes a violation impossible even under a race.
cycleSchema.index(
  { groupId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);

module.exports = mongoose.model('Cycle', cycleSchema);
