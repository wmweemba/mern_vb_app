const calculateLoanSchedule = require('../utils/loanCalculator');

describe('calculateLoanSchedule', () => {
  // REGRESSION: William's group uses 10% reducing balance.
  // This test ensures the refactor produces identical output to the old code.
  test('10% interest, 4 months — matches pre-refactor output', () => {
    const { duration, schedule } = calculateLoanSchedule(10000, 4, 10);

    expect(duration).toBe(4);
    expect(schedule).toHaveLength(4);

    // Month 1: principal=2500, interest=10000*0.10=1000, total=3500
    expect(schedule[0].principal).toBe(2500);
    expect(schedule[0].interest).toBe(1000);
    expect(schedule[0].total).toBe(3500);

    // Month 2: principal=2500, interest=7500*0.10=750, total=3250
    expect(schedule[1].principal).toBe(2500);
    expect(schedule[1].interest).toBe(750);
    expect(schedule[1].total).toBe(3250);

    // Month 3: principal=2500, interest=5000*0.10=500, total=3000
    expect(schedule[2].principal).toBe(2500);
    expect(schedule[2].interest).toBe(500);
    expect(schedule[2].total).toBe(3000);

    // Month 4: principal=2500, interest=2500*0.10=250, total=2750
    expect(schedule[3].principal).toBe(2500);
    expect(schedule[3].interest).toBe(250);
    expect(schedule[3].total).toBe(2750);
  });

  // PROVES PARAMETERIZATION: different rate produces different schedule
  test('15% interest rate produces correct different schedule', () => {
    const { duration, schedule } = calculateLoanSchedule(10000, 4, 15);

    expect(duration).toBe(4);
    expect(schedule).toHaveLength(4);

    // Month 1: principal=2500, interest=10000*0.15=1500, total=4000
    expect(schedule[0].principal).toBe(2500);
    expect(schedule[0].interest).toBe(1500);
    expect(schedule[0].total).toBe(4000);

    // Month 2: principal=2500, interest=7500*0.15=1125, total=3625
    expect(schedule[1].principal).toBe(2500);
    expect(schedule[1].interest).toBe(1125);
    expect(schedule[1].total).toBe(3625);

    // Month 3: principal=2500, interest=5000*0.15=750, total=3250
    expect(schedule[2].principal).toBe(2500);
    expect(schedule[2].interest).toBe(750);
    expect(schedule[2].total).toBe(3250);

    // Month 4: principal=2500, interest=2500*0.15=375, total=2875
    expect(schedule[3].principal).toBe(2500);
    expect(schedule[3].interest).toBe(375);
    expect(schedule[3].total).toBe(2875);
  });

  // DURATION PARAMETERIZATION: different duration changes installment count and amounts
  test('custom duration of 2 months splits principal correctly', () => {
    const { duration, schedule } = calculateLoanSchedule(10000, 2, 10);

    expect(duration).toBe(2);
    expect(schedule).toHaveLength(2);

    // Month 1: principal=5000, interest=10000*0.10=1000, total=6000
    expect(schedule[0].principal).toBe(5000);
    expect(schedule[0].interest).toBe(1000);
    expect(schedule[0].total).toBe(6000);

    // Month 2: principal=5000, interest=5000*0.10=500, total=5500
    expect(schedule[1].principal).toBe(5000);
    expect(schedule[1].interest).toBe(500);
    expect(schedule[1].total).toBe(5500);
  });

  // REDUCING BALANCE PROOF: interest decreases each month
  test('interest decreases each month (reducing balance)', () => {
    const { schedule } = calculateLoanSchedule(20000, 4, 10);

    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].interest).toBeLessThan(schedule[i - 1].interest);
    }
  });

  // STRUCTURE: all installments have correct shape
  test('each installment has correct structure', () => {
    const { schedule } = calculateLoanSchedule(5000, 3, 10);

    schedule.forEach((inst, i) => {
      expect(inst.month).toBe(i + 1);
      expect(inst.paid).toBe(false);
      expect(inst.penalties).toEqual({
        lateInterest: 0,
        overdueFine: 0,
        earlyPaymentCharge: 0
      });
      expect(typeof inst.principal).toBe('number');
      expect(typeof inst.interest).toBe('number');
      expect(typeof inst.total).toBe('number');
    });
  });

  // SINGLE MONTH LOAN
  test('1 month loan — full amount in single installment', () => {
    const { duration, schedule } = calculateLoanSchedule(3000, 1, 10);

    expect(duration).toBe(1);
    expect(schedule).toHaveLength(1);
    expect(schedule[0].principal).toBe(3000);
    expect(schedule[0].interest).toBe(300);
    expect(schedule[0].total).toBe(3300);
  });
});
