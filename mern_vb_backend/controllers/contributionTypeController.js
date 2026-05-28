const ContributionType = require('../models/ContributionType');

exports.createType = async (req, res) => {
  const { name, affectsMainBalance } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const type = await ContributionType.create({
      groupId: req.groupId,
      name: name.trim(),
      affectsMainBalance: typeof affectsMainBalance === 'boolean' ? affectsMainBalance : true,
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
  const { name, active } = req.body;
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

    await type.save();
    res.json(type);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A contribution type with that name already exists' });
    }
    res.status(500).json({ error: 'Failed to update contribution type', details: err.message });
  }
};
