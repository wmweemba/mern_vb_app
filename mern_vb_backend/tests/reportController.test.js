const request = require('supertest');

// Mock Clerk before importing server
jest.mock('@clerk/express', () => ({
  requireAuth: () => (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer valid-token')) {
      req.auth = { userId: 'user_test123' };
      return next();
    }
    return res.status(401).json({ error: 'Unauthenticated' });
  },
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: (req) => req.auth || {},
}));

const app = require('../server');

describe('Report Generation Endpoints', () => {
  it('should return 401 for unauthenticated loans PDF export', async () => {
    const res = await request(app).get('/api/loans/export/pdf');
    expect(res.statusCode).toBe(401);
  });
  it('should return 401 for unauthenticated savings export', async () => {
    const res = await request(app).get('/api/savings/export');
    expect(res.statusCode).toBe(401);
  });
  it('should return 401 for unauthenticated transactions export', async () => {
    const res = await request(app).get('/api/transactions/export');
    expect(res.statusCode).toBe(401);
  });
});
