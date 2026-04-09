const Group = require('../models/Group');

/**
 * Checks trial status for the current group.
 * Mount AFTER resolveGroup on all group-scoped routes.
 *
 * Behavior:
 * - isPaid groups: full access, no checks
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

    // Paid groups — full access forever
    if (group.isPaid) {
      req.trialActive = true;
      return next();
    }

    const now = new Date();
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
