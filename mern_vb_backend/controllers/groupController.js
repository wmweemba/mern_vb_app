const mongoose = require('mongoose');
const { getAuth } = require('@clerk/express');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupSettings = require('../models/GroupSettings');
const GroupTemplate = require('../models/GroupTemplate');
const BankBalance = require('../models/BankBalance');
const SocialFundBalance = require('../models/SocialFundBalance');
const ContributionType = require('../models/ContributionType');

exports.createGroup = async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const {
    groupName, treasurerName, phone,
    meetingDay, cycleStartDate, cycleLengthMonths,
    interestRate, interestMethod, loanLimitMultiplier,
    lateFineAmount, lateFineType = 'fixed',
    partialPaymentFineAmount,
    templateKey = 'village_bank',
  } = req.body;

  if (!groupName || !treasurerName) {
    return res.status(400).json({ error: 'groupName and treasurerName are required' });
  }

  const slug = groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Check if user already has a group
  const existingMember = await GroupMember.findOne({ clerkUserId });
  if (existingMember) {
    return res.status(409).json({ error: 'You are already in a group' });
  }

  // Fallback if the template catalogue hasn't been seeded (e.g. a fresh test DB) —
  // matches the literals this function hardcoded before templates existed, so
  // createGroup never breaks on a missing GroupTemplate document.
  const FALLBACK_TEMPLATE_DEFAULTS = {
    cycleLengthMonths: 6, interestRate: 10, interestMethod: 'reducing',
    defaultLoanDuration: 4, loanLimitMultiplier: 3, latePenaltyRate: 15,
    overdueFineAmount: 1000, earlyPaymentCharge: 200, partialPaymentFineAmount: 0,
    savingsInterestRate: 10, minimumSavingsMonth1: 3000, minimumSavingsMonthly: 1000,
    maximumSavingsFirst3Months: 5000, savingsShortfallFine: 500,
    profitSharingMethod: 'proportional', interestObligationAmount: 0,
  };
  const FALLBACK_TEMPLATE_POLICIES = {
    loanAccrual: 'scheduled_reducing', arrears: 'none', loanLimit: 'savings_multiple',
    concurrentLoans: 'unlimited', interestObligation: 'none',
    cycleEnd: 'shareout_proportional', exit: 'settle_and_refund',
  };

  const template = await GroupTemplate.findOne({ key: templateKey, active: true });
  if (!template && templateKey !== 'village_bank') {
    // Only 'village_bank' has a hardcoded fallback (it matches this function's
    // pre-template literals). Any other requested template must resolve to a real
    // GroupTemplate document — silently substituting village_bank numbers under the
    // requested label would create a group that doesn't match what the admin picked.
    return res.status(400).json({ error: `Unknown or inactive group template "${templateKey}"` });
  }
  const tplDefaults = template ? template.defaults : FALLBACK_TEMPLATE_DEFAULTS;
  const tplPolicies = template ? template.policies : FALLBACK_TEMPLATE_POLICIES;

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existingGroup = await Group.findOne({ slug }).session(session);
      if (existingGroup) throw Object.assign(new Error('Group name already taken'), { status: 409 });

      // 15-day free trial
      const trialExpiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

      const [group] = await Group.create([{
        name: groupName, slug, clerkAdminId: clerkUserId,
        trialExpiresAt,
        isPaid: false,
      }], { session });

      const [member] = await GroupMember.create([{
        clerkUserId,
        groupId: group._id,
        role: 'admin',
        name: treasurerName,
        phone: phone || null,
        isVerified: true,
      }], { session });

      await GroupSettings.create([{
        groupId: group._id,
        groupName,
        meetingDay: meetingDay || null,
        lateFineType: lateFineType || 'fixed',
        cycleLengthMonths: cycleLengthMonths || tplDefaults.cycleLengthMonths,
        interestRate: interestRate || tplDefaults.interestRate,
        interestMethod: interestMethod || tplDefaults.interestMethod,
        defaultLoanDuration: tplDefaults.defaultLoanDuration,
        loanLimitMultiplier: loanLimitMultiplier || tplDefaults.loanLimitMultiplier,
        latePenaltyRate: tplDefaults.latePenaltyRate,
        overdueFineAmount: lateFineAmount || tplDefaults.overdueFineAmount,
        earlyPaymentCharge: tplDefaults.earlyPaymentCharge,
        savingsInterestRate: tplDefaults.savingsInterestRate,
        minimumSavingsMonth1: tplDefaults.minimumSavingsMonth1,
        minimumSavingsMonthly: tplDefaults.minimumSavingsMonthly,
        maximumSavingsFirst3Months: tplDefaults.maximumSavingsFirst3Months,
        savingsShortfallFine: lateFineAmount || tplDefaults.savingsShortfallFine,
        profitSharingMethod: tplDefaults.profitSharingMethod,
        partialPaymentFineAmount: partialPaymentFineAmount || tplDefaults.partialPaymentFineAmount,
        interestObligationAmount: tplDefaults.interestObligationAmount,
        templateKey: template ? template.key : 'village_bank',
        policies: tplPolicies,
      }], { session });

      await BankBalance.create([{ balance: 0, groupId: group._id }], { session });

      await SocialFundBalance.create([{ balance: 0, groupId: group._id }], { session });

      await ContributionType.create([
        { groupId: group._id, name: 'Admin Fee',   affectsMainBalance: true,  isDefault: true, active: true },
        { groupId: group._id, name: 'Social Fund', affectsMainBalance: false, isDefault: true, active: true },
      ], { session, ordered: true });

      result = {
        group: { id: group._id, name: groupName, slug },
        member: { id: member._id, name: treasurerName, role: 'admin', groupId: group._id },
      };
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};
