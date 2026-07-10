jest.setTimeout(120000);

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const { getMemberLimitStatus } = require('../utils/planLimits');
const PLANS = require('../config/plans');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Group.deleteMany({});
  await GroupMember.deleteMany({});
});

async function makeGroup(plan) {
  return Group.create({
    name: 'Test Group',
    slug: `test-group-${Date.now()}-${Math.random()}`,
    trialExpiresAt: new Date(Date.now() + 86400000),
    isPaid: true,
    plan,
  });
}

async function addMembers(groupId, count, overrides = {}) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    docs.push({ groupId, name: `Member ${i}`, role: 'member', ...overrides });
  }
  return GroupMember.insertMany(docs);
}

describe('getMemberLimitStatus', () => {
  it('falls back to Starter limit for legacy groups with no plan assigned', async () => {
    const group = await makeGroup(null);
    const status = await getMemberLimitStatus(group);
    expect(status.plan.name).toBe('Starter');
    expect(status.plan.memberLimit).toBe(PLANS.starter.memberLimit);
  });

  it('resolves the Standard plan limit when assigned', async () => {
    const group = await makeGroup('standard');
    const status = await getMemberLimitStatus(group);
    expect(status.plan.name).toBe('Standard');
    expect(status.plan.memberLimit).toBe(PLANS.standard.memberLimit);
  });

  it('is not at limit when active member count is below the cap', async () => {
    const group = await makeGroup('starter');
    await addMembers(group._id, PLANS.starter.memberLimit - 1);
    const status = await getMemberLimitStatus(group);
    expect(status.atLimit).toBe(false);
    expect(status.activeCount).toBe(PLANS.starter.memberLimit - 1);
  });

  it('is at limit when active member count equals the cap', async () => {
    const group = await makeGroup('starter');
    await addMembers(group._id, PLANS.starter.memberLimit);
    const status = await getMemberLimitStatus(group);
    expect(status.atLimit).toBe(true);
  });

  it('excludes inactive and soft-deleted members from the count (grandfathering never touches them, but they should not block new capacity checks incorrectly)', async () => {
    const group = await makeGroup('starter');
    await addMembers(group._id, PLANS.starter.memberLimit, { active: false, deletedAt: new Date() });
    const status = await getMemberLimitStatus(group);
    expect(status.activeCount).toBe(0);
    expect(status.atLimit).toBe(false);
  });

  it('does not cap a downgraded group that is grandfathered over the new limit from removing existing members — atLimit still reports true so new adds are blocked, but activeCount reflects the full grandfathered total', async () => {
    const group = await makeGroup('starter');
    await addMembers(group._id, PLANS.starter.memberLimit + 10);
    const status = await getMemberLimitStatus(group);
    expect(status.activeCount).toBe(PLANS.starter.memberLimit + 10);
    expect(status.atLimit).toBe(true);
  });
});
