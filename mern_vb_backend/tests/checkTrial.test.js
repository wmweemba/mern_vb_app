// Tests for middleware/checkTrial.js — lapsed-paid-group read-only gate.

jest.mock('../models/Group');

const Group = require('../models/Group');
const { checkTrial } = require('../middleware/checkTrial');
const { computeTrialActive } = require('../controllers/authController');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeReq = (overrides = {}) => ({
  groupId: 'group123',
  method: 'GET',
  ...overrides,
});

const DAY = 24 * 60 * 60 * 1000;
const YESTERDAY = new Date(Date.now() - DAY);
const TOMORROW = new Date(Date.now() + DAY);
const FAR_FUTURE = new Date('2099-12-31');

describe('checkTrial — lapsed paid group (isPaid && paidUntil <= now)', () => {
  const group = {
    isPaid: true,
    paidUntil: YESTERDAY,
    trialExpiresAt: FAR_FUTURE, // every activation sets this; must not grant access
  };

  beforeEach(() => {
    Group.findById.mockResolvedValue(group);
  });

  it('GET → next(), trialActive false', async () => {
    const req = makeReq({ method: 'GET' });
    const res = mockRes();
    const next = jest.fn();

    await checkTrial(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.trialActive).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s → 403 trial_expired/subscription_lapsed', async (method) => {
    const req = makeReq({ method });
    const res = mockRes();
    const next = jest.fn();

    await checkTrial(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'trial_expired',
        code: 'subscription_lapsed',
      })
    );
  });
});

describe('checkTrial — paid, not lapsed', () => {
  it('paidUntil in the future → next(), trialActive true', async () => {
    Group.findById.mockResolvedValue({
      isPaid: true,
      paidUntil: TOMORROW,
      trialExpiresAt: FAR_FUTURE,
    });
    const req = makeReq({ method: 'POST' });
    const res = mockRes();
    const next = jest.fn();

    await checkTrial(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.trialActive).toBe(true);
  });

  it('paidUntil null (legacy no-expiry) → next() on POST', async () => {
    Group.findById.mockResolvedValue({
      isPaid: true,
      paidUntil: null,
      trialExpiresAt: FAR_FUTURE,
    });
    const req = makeReq({ method: 'POST' });
    const res = mockRes();
    const next = jest.fn();

    await checkTrial(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.trialActive).toBe(true);
  });
});

describe('checkTrial — never-paid groups (unchanged trial logic)', () => {
  it('active trial → next() on POST', async () => {
    Group.findById.mockResolvedValue({
      isPaid: false,
      paidUntil: null,
      trialExpiresAt: TOMORROW,
    });
    const req = makeReq({ method: 'POST' });
    const res = mockRes();
    const next = jest.fn();

    await checkTrial(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.trialActive).toBe(true);
  });

  it('expired trial → 403 on POST with unchanged message', async () => {
    Group.findById.mockResolvedValue({
      isPaid: false,
      paidUntil: null,
      trialExpiresAt: YESTERDAY,
    });
    const req = makeReq({ method: 'POST' });
    const res = mockRes();
    const next = jest.fn();

    await checkTrial(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'trial_expired',
        message: 'Your free trial has ended. Contact support to continue.',
      })
    );
  });

  it('markUnpaid case — trialExpiresAt manually set to 2099, isPaid false → next() on POST (unchanged)', async () => {
    Group.findById.mockResolvedValue({
      isPaid: false,
      paidUntil: null,
      trialExpiresAt: FAR_FUTURE,
    });
    const req = makeReq({ method: 'POST' });
    const res = mockRes();
    const next = jest.fn();

    await checkTrial(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.trialActive).toBe(true);
  });
});

describe('checkTrial — super admin bypass', () => {
  it('super admin on a lapsed paid group → next(), no Group lookup needed', async () => {
    const req = makeReq({ method: 'POST', isSuperAdmin: true });
    const res = mockRes();
    const next = jest.fn();

    await checkTrial(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('authController.computeTrialActive (/me)', () => {
  const now = new Date();

  it('lapsed paid group → false', () => {
    expect(
      computeTrialActive({ isPaid: true, paidUntil: YESTERDAY, trialExpiresAt: FAR_FUTURE }, now)
    ).toBe(false);
  });

  it('paid, future paidUntil → true', () => {
    expect(
      computeTrialActive({ isPaid: true, paidUntil: TOMORROW, trialExpiresAt: FAR_FUTURE }, now)
    ).toBe(true);
  });

  it('paid, null paidUntil (legacy no-expiry) → true', () => {
    expect(computeTrialActive({ isPaid: true, paidUntil: null, trialExpiresAt: FAR_FUTURE }, now)).toBe(
      true
    );
  });

  it('never-paid, active trial → true', () => {
    expect(computeTrialActive({ isPaid: false, paidUntil: null, trialExpiresAt: TOMORROW }, now)).toBe(
      true
    );
  });

  it('never-paid, expired trial → false', () => {
    expect(computeTrialActive({ isPaid: false, paidUntil: null, trialExpiresAt: YESTERDAY }, now)).toBe(
      false
    );
  });

  it('never-paid, markUnpaid case (trialExpiresAt 2099) → true (unchanged)', () => {
    expect(computeTrialActive({ isPaid: false, paidUntil: null, trialExpiresAt: FAR_FUTURE }, now)).toBe(
      true
    );
  });
});
