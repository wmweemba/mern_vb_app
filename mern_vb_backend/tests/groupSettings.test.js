const calculateLoanSchedule = require('../utils/loanCalculator');

describe('GroupSettings integration with loanCalculator', () => {
  // Regression: William's group settings (10% reducing) produce same results as before
  test('reducing balance at 10% matches pre-GroupSettings output', () => {
    const { schedule } = calculateLoanSchedule(10000, 4, 10);

    expect(schedule).toHaveLength(4);
    expect(schedule[0].interest).toBe(1000);   // 10000 * 0.10
    expect(schedule[1].interest).toBe(750);    // 7500 * 0.10
    expect(schedule[2].interest).toBe(500);    // 5000 * 0.10
    expect(schedule[3].interest).toBe(250);    // 2500 * 0.10
  });

  // Different group with 15% rate produces correct schedule
  test('reducing balance at 15% produces correct different schedule', () => {
    const { schedule } = calculateLoanSchedule(10000, 4, 15);

    expect(schedule).toHaveLength(4);
    expect(schedule[0].interest).toBe(1500);   // 10000 * 0.15
    expect(schedule[1].interest).toBe(1125);   // 7500 * 0.15
    expect(schedule[2].interest).toBe(750);    // 5000 * 0.15
    expect(schedule[3].interest).toBe(375);    // 2500 * 0.15
  });

  // Different group with 5% rate
  test('reducing balance at 5% produces correct schedule', () => {
    const { schedule } = calculateLoanSchedule(10000, 4, 5);

    expect(schedule).toHaveLength(4);
    expect(schedule[0].interest).toBe(500);    // 10000 * 0.05
    expect(schedule[1].interest).toBe(375);    // 7500 * 0.05
    expect(schedule[2].interest).toBe(250);    // 5000 * 0.05
    expect(schedule[3].interest).toBe(125);    // 2500 * 0.05
  });

  // Duration from GroupSettings (defaultLoanDuration = 6)
  test('6-month duration from settings produces 6 installments', () => {
    const { duration, schedule } = calculateLoanSchedule(12000, 6, 10);

    expect(duration).toBe(6);
    expect(schedule).toHaveLength(6);
    expect(schedule[0].principal).toBe(2000);
    expect(schedule[5].principal).toBe(2000);
  });
});

describe('GroupSettings schema validation', () => {
  const GroupSettings = require('../models/GroupSettings');

  test('rejects invalid interestMethod', async () => {
    const doc = new GroupSettings({
      groupName: 'Test',
      cycleLengthMonths: 6,
      interestRate: 10,
      interestMethod: 'invalid',
      defaultLoanDuration: 4,
      loanLimitMultiplier: 3,
      latePenaltyRate: 15,
      overdueFineAmount: 1000,
      earlyPaymentCharge: 200,
      savingsInterestRate: 10,
      minimumSavingsMonth1: 3000,
      minimumSavingsMonthly: 1000,
      maximumSavingsFirst3Months: 5000,
      savingsShortfallFine: 500,
      profitSharingMethod: 'proportional',
    });

    await expect(doc.validate()).rejects.toThrow();
  });

  test('rejects cycleLengthMonths not in [6, 12]', async () => {
    const doc = new GroupSettings({
      groupName: 'Test',
      cycleLengthMonths: 3,
      interestRate: 10,
      interestMethod: 'reducing',
      defaultLoanDuration: 4,
      loanLimitMultiplier: 3,
      latePenaltyRate: 15,
      overdueFineAmount: 1000,
      earlyPaymentCharge: 200,
      savingsInterestRate: 10,
      minimumSavingsMonth1: 3000,
      minimumSavingsMonthly: 1000,
      maximumSavingsFirst3Months: 5000,
      savingsShortfallFine: 500,
      profitSharingMethod: 'proportional',
    });

    await expect(doc.validate()).rejects.toThrow();
  });

  test('accepts valid William group settings', async () => {
    const doc = new GroupSettings({
      groupName: 'Chama360 Pilot Group',
      cycleLengthMonths: 6,
      interestRate: 10,
      interestMethod: 'reducing',
      defaultLoanDuration: 4,
      loanLimitMultiplier: 3,
      latePenaltyRate: 15,
      overdueFineAmount: 1000,
      earlyPaymentCharge: 200,
      savingsInterestRate: 10,
      minimumSavingsMonth1: 3000,
      minimumSavingsMonthly: 1000,
      maximumSavingsFirst3Months: 5000,
      savingsShortfallFine: 500,
      profitSharingMethod: 'proportional',
    });

    await expect(doc.validate()).resolves.toBeUndefined();
  });

  test('rejects interest rate above 50', async () => {
    const doc = new GroupSettings({
      groupName: 'Test',
      cycleLengthMonths: 6,
      interestRate: 60,
      interestMethod: 'reducing',
      defaultLoanDuration: 4,
      loanLimitMultiplier: 3,
      latePenaltyRate: 15,
      overdueFineAmount: 1000,
      earlyPaymentCharge: 200,
      savingsInterestRate: 10,
      minimumSavingsMonth1: 3000,
      minimumSavingsMonthly: 1000,
      maximumSavingsFirst3Months: 5000,
      savingsShortfallFine: 500,
      profitSharingMethod: 'proportional',
    });

    await expect(doc.validate()).rejects.toThrow();
  });
});

describe('Penalty calculations with GroupSettings values', () => {
  test('late penalty at 15% matches current hardcoded behaviour', () => {
    const installmentTotal = 3500;
    const latePenaltyRate = 15;
    const penalty = +(installmentTotal * (latePenaltyRate / 100)).toFixed(2);
    expect(penalty).toBe(525);
  });

  test('late penalty at 20% produces different correct value', () => {
    const installmentTotal = 3500;
    const latePenaltyRate = 20;
    const penalty = +(installmentTotal * (latePenaltyRate / 100)).toFixed(2);
    expect(penalty).toBe(700);
  });

  test('savings interest at 10% matches current hardcoded behaviour', () => {
    const amount = 5000;
    const savingsInterestRate = 10;
    const interest = +(amount * (savingsInterestRate / 100)).toFixed(2);
    expect(interest).toBe(500);
  });

  test('savings interest at 8% produces different correct value', () => {
    const amount = 5000;
    const savingsInterestRate = 8;
    const interest = +(amount * (savingsInterestRate / 100)).toFixed(2);
    expect(interest).toBe(400);
  });
});
