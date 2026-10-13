const Group = require('../models/Group');

/**
 * Checks trial status for the current group.
 * Mount AFTER resolveGroup on all group-scoped routes.
 *
 * Behavior:
 * - isPaid groups (not lapsed): full access, no checks
 * - isPaid groups whose paidUntil has passed: treated exactly like an expired
 *   trial — GET allowed (read-only), writes blocked with trial_expired. This
 *   is a dead end: a lapsed paid group never falls through to the
 *   trialExpiresAt check below, because every activation sets
 *   trialExpiresAt to a far-future date (2099), which would otherwise grant
 *   full access forever.
 * - Active trial: full access, attaches trialActive: true
 * - Expired trial + GET request: allow (read-only), attaches trialActive: false
 * - Expired trial + POST/PUT/DELETE request: 403 trial_expired
 */
async function checkTrial(req, res, next) {
  try {
    // Super admins bypass trial checks entirely
    if (req.isSuperAdmin) return next();

    const group = await Group.findById(req.groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const now = new Date();

    // Paid groups — full access unless paidUntil is set and in the past.
    // null paidUntil = legacy paid group, treat as no expiry.
    if (group.isPaid) {
      if (!group.paidUntil || group.paidUntil > now) {
        req.trialActive = true;
        return next();
      }

      // isPaid but subscription has lapsed — read-only, same as an expired
      // trial. Must NOT fall through to the trialExpiresAt check below.
      req.trialActive = false;

      if (req.method === 'GET') {
        return next();
      }

      return res.status(403).json({
        error: 'trial_expired',
        code: 'subscription_lapsed',
        message:
          'Your subscription has ended. Your records are safe and readable; renew from the Upgrade page to continue saving.',
      });
    }

    if (group.trialExpiresAt > now) {
      // Trial is active
      req.trialActive = true;
      return next();
    }

    // Trial has expired
    req.trialActive = false;

    // Allow GET requests (read-only access)
    if (req.method === 'GET') {
      return next();
    }

    // Block write operations
    return res.status(403).json({
      error: 'trial_expired',
      message: 'Your free trial has ended. Contact support to continue.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check trial status', details: err.message });
  }
}

module.exports = { checkTrial };
