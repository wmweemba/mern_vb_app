const ContributionType = require('../models/ContributionType');
const GroupFund = require('../models/GroupFund');

exports.createType = async (req, res) => {
  const { name, fundId, affectsMainBalance, countsTowardInterestObligation, targetAmountPerMember } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    // fundId is authoritative; affectsMainBalance is still accepted from
    // un-migrated callers and still written, but derived as `!fundId`.
    const resolvedFundId = await resolveFundId(req, fundId, affectsMainBalance);
    const type = await ContributionType.create({
      groupId: req.groupId,
      name: name.trim(),
      fundId: resolvedFundId,
      affectsMainBalance: !resolvedFundId,
      countsTowardInterestObligation: typeof countsTowardInterestObligation === 'boolean' ? countsTowardInterestObligation : false,
      targetAmountPerMember: Number(targetAmountPerMember) || 0,
      createdBy: req.memberId,
    });
    res.status(201).json(type);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `A contribution type named "${name.trim()}" already exists` });
    }
    res.status(500).json({ error: 'Failed to create contribution type', details: err.message });
  }
};

exports.listTypes = async (req, res) => {
  try {
    const filter = { ...req.groupScope };
    if (req.query.active === 'true') filter.active = true;
    const types = await ContributionType.find(filter).sort({ createdAt: 1 });
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list contribution types', details: err.message });
  }
};

exports.updateType = async (req, res) => {
  const { name, active, fundId, countsTowardInterestObligation, targetAmountPerMember } = req.body;
  try {
    const type = await ContributionType.findOne({ _id: req.params.id, ...req.groupScope });
    if (!type) return res.status(404).json({ error: 'Contribution type not found' });

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
      type.name = name.trim();
    }
    if (typeof active === 'boolean') {
      type.active = active;
    }
    if (fundId !== undefined) {
      const resolved = await resolveFundId(req, fundId, undefined);
      type.fundId = resolved;
      type.affectsMainBalance = !resolved;
    }
    if (typeof countsTowardInterestObligation === 'boolean') {
      type.countsTowardInterestObligation = countsTowardInterestObligation;
    }
    if (targetAmountPerMember !== undefined) {
      const target = Number(targetAmountPerMember);
      if (isNaN(target) || target < 0) {
        return res.status(400).json({ error: 'targetAmountPerMember must be a non-negative number' });
      }
      type.targetAmountPerMember = target;
    }

    await type.save();
    res.json(type);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A contribution type with that name already exists' });
    }
    res.status(500).json({ error: 'Failed to update contribution type', details: err.message });
  }
};

/**
 * Resolve a contribution type's destination. Returns null for the main lending
 * pool, or a validated GroupFund id. Falls back to the legacy boolean only when
 * no fundId was supplied, so migrated and un-migrated callers can coexist for a
 * release without a second source of truth.
 */
async function resolveFundId(req, fundId, affectsMainBalance) {
  if (fundId) {
    const fund = await GroupFund.findOne({ _id: fundId, ...req.groupScope });
    if (!fund) throw Object.assign(new Error('Fund not found'), { status: 400 });
    // Pointing a contribution type at a fund is what makes that fund relevant, so
    // switch it on here. Funds like App Subscription are seeded inactive precisely
    // so a group that never uses them shows no empty pot — this is the moment the
    // group starts using it, and it saves needing a separate activation screen.
    if (!fund.active) {
      fund.active = true;
      await fund.save();
    }
    return fund._id;
  }
  if (fundId === null) return null;
  if (affectsMainBalance === false) {
    const { getSocialFund } = require('./fundController');
    const social = await getSocialFund(req.groupId);
    return social._id;
  }
  return null;
}
