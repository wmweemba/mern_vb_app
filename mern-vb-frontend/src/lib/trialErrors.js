// Forms across the app display `err.response.data.error` directly, so a blocked
// write used to show the raw code "trial_expired". Swap in the backend's own
// sentence (expired trial or lapsed subscription) and keep the code on `code`.
export const TRIAL_EXPIRED_FALLBACK = 'Saving is paused for this group. Your records are safe and readable; renew from the Upgrade page to continue.';
export function friendlyTrialExpiredBody(data) {
  return {
    ...data,
    code: data?.code || 'trial_expired',
    error: data?.message || TRIAL_EXPIRED_FALLBACK,
  };
}
