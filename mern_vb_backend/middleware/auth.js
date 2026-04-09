const { getAuth } = require('@clerk/express');

// Verifies Clerk session token. Replaces old requireAuth() which redirects to "/"
// when unauthenticated instead of returning 401 (wrong for API routes).
// clerkMiddleware() must already be applied globally before this runs.
const verifyToken = (req, res, next) => {
  let auth;
  try {
    auth = getAuth(req);
  } catch (e) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  if (!auth?.userId) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  next();
};

// Role checking — reads from req.role (set by resolveGroup middleware)
const requireRole = (role) => (req, res, next) => {
  if (req.role !== role) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
};

exports.verifyToken = verifyToken;
exports.requireRole = requireRole;
