const GroupSettings = require('../models/GroupSettings');

// Internal helper — used by other controllers to get settings for a specific group
// Throws if no settings document exists
exports.getSettings = async (groupId) => {
  const settings = await GroupSettings.findOne({ groupId });
  if (!settings) {
    throw new Error('GroupSettings not configured for this group.');
  }
  return settings;
};

// GET /api/group-settings
exports.getGroupSettings = async (req, res) => {
  try {
    const settings = await GroupSettings.findOne({ groupId: req.groupId });
    if (!settings) {
      return res.status(404).json({ error: 'Group settings not found' });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch group settings', details: err.message });
  }
};

// PUT /api/group-settings
exports.updateGroupSettings = async (req, res) => {
  try {
    let settings = await GroupSettings.findOne({ groupId: req.groupId });
    if (!settings) {
      return res.status(404).json({ error: 'Group settings not found.' });
    }

    const allowedFields = [
      'groupName', 'cycleLengthMonths', 'interestRate', 'interestMethod',
      'defaultLoanDuration', 'loanLimitMultiplier', 'latePenaltyRate',
      'overdueFineAmount', 'earlyPaymentCharge', 'savingsInterestRate',
      'minimumSavingsMonth1', 'minimumSavingsMonthly', 'maximumSavingsFirst3Months',
      'savingsShortfallFine', 'profitSharingMethod'
    ];

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        settings[key] = req.body[key];
      }
    }

    await settings.save();
    res.json({ message: 'Group settings updated', settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update group settings', details: err.message });
  }
};
