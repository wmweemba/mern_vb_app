const { groupScopedModels } = require('../scripts/utils/groupScopedModels');

describe('groupScopedModels', () => {
  it('excludes SubscriptionPayment (retainOnGroupDelete) while including the savings model', () => {
    const names = groupScopedModels().map(({ name }) => name);

    expect(names).not.toContain('SubscriptionPayment');
    expect(names).toContain('Savings');
  });
});
