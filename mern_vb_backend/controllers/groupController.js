const mongoose = require('mongoose');
const { getAuth } = require('@clerk/express');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupSettings = require('../models/GroupSettings');
const BankBalance = require('../models/BankBalance');

exports.createGroup = async (req, res) => {
  const { userId: clerkUserId } = getAuth(req);
  const {
    groupName, treasurerName, phone,
    meetingDay, cycleStartDate, cycleLengthMonths,
    interestRate, interestMethod, loanLimitMultiplier,
    lateFineAmount, lateFineType,
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
      }], { session });

      await GroupSettings.create([{
        groupId: group._id,
        groupName,
        cycleLengthMonths: cycleLengthMonths || 6,
        interestRate: interestRate || 10,
        interestMethod: interestMethod || 'reducing',
        defaultLoanDuration: 4,
        loanLimitMultiplier: loanLimitMultiplier || 3,
        latePenaltyRate: 15,
        overdueFineAmount: lateFineAmount || 1000,
        earlyPaymentCharge: 200,
        savingsInterestRate: 10,
        minimumSavingsMonth1: 3000,
        minimumSavingsMonthly: 1000,
        maximumSavingsFirst3Months: 5000,
        savingsShortfallFine: lateFineAmount || 500,
        profitSharingMethod: 'proportional',
      }], { session });

      await BankBalance.create([{ balance: 0, groupId: group._id }], { session });

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
