const GroupSettings = require('../models/GroupSettings');
const GroupTemplate = require('../models/GroupTemplate');
const Transaction = require('../models/Transaction');

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
      'groupName', 'meetingDay', 'lateFineType', 'cycleLengthMonths', 'interestRate', 'interestMethod',
      'defaultLoanDuration', 'loanLimitMultiplier', 'latePenaltyRate',
      'overdueFineAmount', 'earlyPaymentCharge', 'partialPaymentFineAmount', 'savingsInterestRate',
      'minimumSavingsMonth1', 'minimumSavingsMonthly', 'maximumSavingsFirst3Months',
      'savingsShortfallFine', 'profitSharingMethod', 'interestObligationAmount'
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

// PUT /api/group-settings/template — switches templateKey + policies (+ optionally
// re-applies that template's parameter defaults). Kept separate from the general PUT
// above deliberately: this changes *behaviour*, not just numbers, and per
// docs/plan_configurable_group_rules.md §3.3 is only ever allowed at a cycle boundary
// — switching mid-cycle would silently restate every open loan's arithmetic.
exports.updateGroupTemplate = async (req, res) => {
  const { templateKey, applyDefaults } = req.body;
  if (!templateKey) {
    return res.status(400).json({ error: 'templateKey is required' });
  }
  try {
    const settings = await GroupSettings.findOne({ groupId: req.groupId });
    if (!settings) {
      return res.status(404).json({ error: 'Group settings not found.' });
    }

    const template = await GroupTemplate.findOne({ key: templateKey, active: true });
    if (!template) {
      return res.status(404).json({ error: `Unknown or inactive template "${templateKey}"` });
    }

    const hasActivity = await Transaction.exists({ groupId: req.groupId, archived: { $ne: true } });
    if (hasActivity && settings.templateKey !== templateKey) {
      return res.status(400).json({
        error: 'Cannot switch templates mid-cycle — this group already has transactions in the current cycle. Switch only at a cycle boundary.',
      });
    }

    settings.templateKey = template.key;
    settings.policies = template.policies;
    if (applyDefaults) {
      for (const key of Object.keys(template.defaults)) {
        settings[key] = template.defaults[key];
      }
    }

    await settings.save();
    res.json({ message: 'Group template updated', settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update group template', details: err.message });
  }
};

// GET /api/group-templates — public catalogue for the onboarding wizard / template switcher
exports.listGroupTemplates = async (req, res) => {
  try {
    const templates = await GroupTemplate.find({ active: true }).sort({ name: 1 });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch group templates', details: err.message });
  }
};
