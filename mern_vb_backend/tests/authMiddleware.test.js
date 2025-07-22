const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

// Mock Express req, res, next
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = jest.fn();

describe('Auth Middleware', () => {
  it('should call next for valid token', () => {
    const user = { id: '123', role: 'admin' };
    const token = jwt.sign(user, 'testsecret');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    verifyToken(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(req.user).toBeDefined();
  });

  it('should return 401 for missing/invalid token', () => {
    const req = { headers: {} };
    const res = mockRes();
    verifyToken(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('Role Middleware', () => {
  it('should call next if user has required role', () => {
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should return 403 if user lacks required role', () => {
    const req = { user: { role: 'member' } };
    const res = mockRes();
    const next = jest.fn();
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
}); 