const SuperAdmin = require('../models/SuperAdmin');
const { getAuth } = require('@clerk/express');

async function requireSuperAdmin(req, res, next) {
  try {
    const { userId: clerkUserId } = getAuth(req);
    if (!clerkUserId) return res.status(401).json({ error: 'Not authenticated' });

    const superAdmin = await SuperAdmin.findOne({ clerkUserId, revokedAt: null });
    if (!superAdmin) return res.status(403).json({ error: 'Super admin access required' });

    req.superAdmin = superAdmin;
    req.isSuperAdmin = true;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify super admin', details: err.message });
  }
}

module.exports = { requireSuperAdmin };
