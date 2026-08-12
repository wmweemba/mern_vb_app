const { computeLiabilityRow } = require('../controllers/contributionLiabilityController');

describe('computeLiabilityRow', () => {
  test('Chitalu-style instalments (50+50+50+60+40=250) exactly clear a K250 target', () => {
    const paid = 50 + 50 + 50 + 60 + 40;
    expect(computeLiabilityRow(250, paid)).toEqual({ target: 250, paid: 250, outstanding: 0 });
  });

  test('partial instalments leave the remainder outstanding', () => {
    expect(computeLiabilityRow(250, 150)).toEqual({ target: 250, paid: 150, outstanding: 100 });
  });

  test('a member who has paid nothing owes the full target', () => {
    expect(computeLiabilityRow(250, 0)).toEqual({ target: 250, paid: 0, outstanding: 250 });
  });

  test('overpaying floors outstanding at zero, not negative', () => {
    expect(computeLiabilityRow(250, 300)).toEqual({ target: 250, paid: 300, outstanding: 0 });
  });

  test('a target of 0 is never actually reached here — buildReport excludes it upstream, but the pure function still floors correctly', () => {
    expect(computeLiabilityRow(0, 0)).toEqual({ target: 0, paid: 0, outstanding: 0 });
  });
});
