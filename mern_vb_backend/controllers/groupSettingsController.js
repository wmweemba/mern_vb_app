const GroupSettings = require('../models/GroupSettings');

// Internal helper — used by other controllers to get settings
// Returns the first GroupSettings document (single-group for now)
// Throws if no settings document exists
exports.getSettings = async () => {
  const settings = await GroupSettings.findOne();
  if (!settings) {
    throw new Error('GroupSettings not configured. Run the seed script or create settings via the API.');
  }
  return settings;
};

// GET /api/group-settings
exports.getGroupSettings = async (req, res) => {
  try {
    const settings = await GroupSettings.findOne();
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
    let settings = await GroupSettings.findOne();
    if (!settings) {
      return res.status(404).json({ error: 'Group settings not found. Run seed script first.' });
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
