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

describe('Loans & Savings Controllers', () => {
  it('should return 401 for unauthenticated loan creation', async () => {
    const res = await request(app).post('/api/loans').send({});
    expect(res.statusCode).toBe(401);
  });
  it('should return 401 for unauthenticated savings creation', async () => {
    const res = await request(app).post('/api/savings').send({});
    expect(res.statusCode).toBe(401);
  });
});
