const request = require('supertest');
const app = require('../server');

describe('Report Generation Endpoints', () => {
  it('should return PDF for loans report', async () => {
    const res = await request(app).get('/api/loans/export/pdf');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
  });
  it('should return PDF for savings report', async () => {
    const res = await request(app).get('/api/savings/export/pdf');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
  });
  it('should return PDF for transactions report', async () => {
    const res = await request(app).get('/api/transactions/export/pdf');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
  });
}); 