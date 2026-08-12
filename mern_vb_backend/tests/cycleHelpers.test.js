jest.mock('../models/Cycle', () => ({
  findOne: jest.fn(),
}));

const Cycle = require('../models/Cycle');
const { buildSettingsSnapshot, computeCycleEndDate, resolveEntryDate } = require('../utils/cycleHelpers');

describe('computeCycleEndDate', () => {
  test('adds the cycle length in months to the start date', () => {
    const end = computeCycleEndDate(new Date('2026-06-01T00:00:00.000Z'), 6);
    expect(end.toISOString().slice(0, 10)).toBe('2026-12-01');
  });
});

describe('buildSettingsSnapshot', () => {
  test('drops Mongo bookkeeping fields but keeps parameters and policies', () => {
    const fakeSettings = {
      toObject: () => ({
        _id: 'x', __v: 0, groupId: 'g1', createdAt: new Date(), updatedAt: new Date(),
        interestRate: 10, policies: { loanAccrual: 'scheduled_reducing' },
      }),
    };
    const snapshot = buildSettingsSnapshot(fakeSettings);
    expect(snapshot).toEqual({ interestRate: 10, policies: { loanAccrual: 'scheduled_reducing' } });
  });
});

describe('resolveEntryDate', () => {
  const groupId = 'group1';

  beforeEach(() => {
    Cycle.findOne.mockReset();
  });

  // Mimics a Mongoose Query: thenable directly (so `await Cycle.findOne(...)`
  // resolves without `.session()` ever being called, matching real usage from
  // controllers that don't pass a session), and `.session()` chains back to
  // itself so the session-passing path also resolves correctly.
  function mockCycleQuery(cycle) {
    const thenable = {
      session: () => thenable,
      then: (resolve) => resolve(cycle),
    };
    Cycle.findOne.mockReturnValue(thenable);
  }

  test('no requested date returns "now"', async () => {
    const before = Date.now();
    const result = await resolveEntryDate(groupId, undefined);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
  });

  test('an invalid date string is rejected with a 400', async () => {
    await expect(resolveEntryDate(groupId, 'not-a-date')).rejects.toMatchObject({ status: 400 });
  });

  test('no open Cycle document accepts any date (pre-Phase-5 groups)', async () => {
    mockCycleQuery(null);
    const result = await resolveEntryDate(groupId, '2020-01-01');
    expect(result.toISOString().slice(0, 10)).toBe('2020-01-01');
  });

  test('a date inside the open cycle bounds is accepted', async () => {
    mockCycleQuery({ startDate: new Date('2026-06-01'), endDate: new Date('2026-11-30') });
    const result = await resolveEntryDate(groupId, '2026-07-15');
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-15');
  });

  test('a date before the open cycle start is rejected with a 400', async () => {
    mockCycleQuery({ startDate: new Date('2026-06-01'), endDate: new Date('2026-11-30') });
    await expect(resolveEntryDate(groupId, '2026-01-01')).rejects.toMatchObject({ status: 400 });
  });

  test('a date after the open cycle end is rejected with a 400', async () => {
    mockCycleQuery({ startDate: new Date('2026-06-01'), endDate: new Date('2026-11-30') });
    await expect(resolveEntryDate(groupId, '2027-01-01')).rejects.toMatchObject({ status: 400 });
  });
});
