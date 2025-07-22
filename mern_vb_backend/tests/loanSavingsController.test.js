const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { useNewUrlParser: true, useUnifiedTopology: true });
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Loans & Savings Controllers', () => {
  it('should reject loan creation with missing fields', async () => {
    const res = await request(app).post('/api/loans').send({});
    expect(res.statusCode).toBe(400);
  });
  it('should reject savings creation with missing fields', async () => {
    const res = await request(app).post('/api/savings').send({});
    expect(res.statusCode).toBe(400);
  });
  // Add more tests for valid creation if needed (requires auth/user setup)
}); 