const GroupSettings = require('../models/GroupSettings');
const { logAdminAction } = require('../utils/auditLog');

// GET /api/admin/groups/:groupId/settings
exports.getSettings = async (req, res) => {
  const settings = await GroupSettings.findOne({ groupId: req.params.groupId });
  if (!settings) return res.status(404).json({ error: 'Settings not found for this group' });
  res.json(settings);
};

// PATCH /api/admin/groups/:groupId/settings
exports.updateSettings = async (req, res) => {
  const settings = await GroupSettings.findOne({ groupId: req.params.groupId });
  if (!settings) return res.status(404).json({ error: 'Settings not found' });

  const before = settings.toObject();
  const allowed = [
    'groupName', 'meetingDay', 'lateFineType',
    'cycleLengthMonths', 'interestRate', 'interestMethod', 'defaultLoanDuration', 'loanLimitMultiplier',
    'latePenaltyRate', 'overdueFineAmount', 'earlyPaymentCharge',
    'savingsInterestRate', 'minimumSavingsMonth1', 'minimumSavingsMonthly',
    'maximumSavingsFirst3Months', 'savingsShortfallFine',
    'profitSharingMethod',
  ];
  for (const key of allowed) {
    if (req.body[key] !== undefined) settings[key] = req.body[key];
  }
  await settings.save();

  await logAdminAction({
    req, action: 'group_settings.update', targetType: 'group_settings', targetId: settings._id,
    groupId: settings.groupId,
    metadata: { before, after: settings.toObject() },
  });
  res.json(settings);
};
