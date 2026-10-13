import { friendlyTrialExpiredBody, TRIAL_EXPIRED_FALLBACK } from '../lib/trialErrors';

describe('friendlyTrialExpiredBody', () => {
  test('uses the backend message for a lapsed subscription and keeps its code', () => {
    const out = friendlyTrialExpiredBody({
      error: 'trial_expired',
      code: 'subscription_lapsed',
      message: 'Your subscription has ended. Your records are safe and readable; renew from the Upgrade page to continue saving.',
    });
    expect(out.error).toMatch(/^Your subscription has ended/);
    expect(out.code).toBe('subscription_lapsed');
  });

  test('expired trial without a code gets code trial_expired and the backend message', () => {
    const out = friendlyTrialExpiredBody({ error: 'trial_expired', message: 'Your free trial has ended. Contact support to continue.' });
    expect(out.error).toBe('Your free trial has ended. Contact support to continue.');
    expect(out.code).toBe('trial_expired');
  });

  test('no message falls back to a readable sentence, never the raw code', () => {
    const out = friendlyTrialExpiredBody({ error: 'trial_expired' });
    expect(out.error).toBe(TRIAL_EXPIRED_FALLBACK);
    expect(out.error).not.toBe('trial_expired');
  });
});
