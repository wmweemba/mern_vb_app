// Auth middleware tests — updated for Clerk-based auth

// Mock @clerk/express before requiring auth middleware
jest.mock('@clerk/express', () => ({
  requireAuth: () => (req, res, next) => {
    // In tests, simulate Clerk auth: if Authorization header has "valid-token", proceed
    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer valid-token')) {
      req.auth = { userId: 'user_test123' };
      return next();
    }
    // Simulate Clerk's 401 behavior
    return res.status(401).json({ error: 'Unauthenticated' });
  },
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: (req) => {
    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer valid-token')) {
      return { userId: 'user_test123' };
    }
    return req.auth || {};
  },
}));

const { verifyToken, requireRole } = require('../middleware/auth');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Auth Middleware', () => {
  it('should call next for valid token', () => {
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    const mockNext = jest.fn();
    verifyToken(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should return 401 for missing token', () => {
    const req = { headers: {} };
    const res = mockRes();
    const mockNext = jest.fn();
    verifyToken(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('Role Middleware', () => {
  it('should call next if user has required role', () => {
    // resolveGroup sets req.role (not req.user.role)
    const req = { role: 'admin' };
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should return 403 if user lacks required role', () => {
    const req = { role: 'member' };
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
