const Cycle = require('../models/Cycle');

// Freezes the parameters/policies a cycle opened with. Deliberately takes the
// whole settings doc (minus Mongo/document bookkeeping fields) rather than a
// hand-picked subset — a new GroupSettings field should be captured in future
// snapshots without this helper needing an edit every time one is added.
function buildSettingsSnapshot(groupSettings) {
  const obj = typeof groupSettings.toObject === 'function' ? groupSettings.toObject() : { ...groupSettings };
  delete obj._id;
  delete obj.__v;
  delete obj.groupId;
  delete obj.createdAt;
  delete obj.updatedAt;
  return obj;
}

function computeCycleEndDate(startDate, cycleLengthMonths) {
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + Number(cycleLengthMonths));
  return end;
}

// Opens a new Cycle document. Caller is responsible for having closed any prior
// open cycle first (the unique partial index on { groupId, status: 'open' }
// guarantees at most one open cycle even if that discipline is ever broken).
async function openCycle({ groupId, cycleNumber, startDate, cycleLengthMonths, settings, session }) {
  const [cycle] = await Cycle.create([{
    groupId,
    cycleNumber,
    startDate,
    endDate: computeCycleEndDate(startDate, cycleLengthMonths),
    status: 'open',
    settingsSnapshot: buildSettingsSnapshot(settings),
  }], { session });
  return cycle;
}

async function getOpenCycle(groupId, session = null) {
  const query = Cycle.findOne({ groupId, status: 'open' });
  if (session) query.session(session);
  return query;
}

// Restricts a caller-supplied entry date to the currently open cycle's bounds.
// Returns the resolved Date on success; throws a { status, message } error the
// controller can forward as-is otherwise. Groups without a Cycle document yet
// (pre-Phase-5 groups that haven't opened a fresh cycle) are not restricted —
// there is nothing to validate against, so any date is accepted, matching the
// pre-Phase-5 behaviour for savings' existing `date` field.
async function resolveEntryDate(groupId, requestedDate, session = null) {
  if (!requestedDate) return new Date();

  const date = new Date(requestedDate);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error('Invalid date'), { status: 400 });
  }

  const cycle = await getOpenCycle(groupId, session);
  if (!cycle) return date;

  if (date < cycle.startDate || date > cycle.endDate) {
    throw Object.assign(
      new Error(`Date must fall within the current cycle (${cycle.startDate.toISOString().split('T')[0]} – ${cycle.endDate.toISOString().split('T')[0]})`),
      { status: 400 }
    );
  }
  return date;
}

module.exports = { buildSettingsSnapshot, computeCycleEndDate, openCycle, getOpenCycle, resolveEntryDate };
