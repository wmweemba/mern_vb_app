// Mock @clerk/express before any imports
jest.mock('@clerk/express', () => ({
  clerkMiddleware: () => (req, res, next) => next(),
  getAuth: (req) => {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer valid-member-token')) return { userId: 'user_member' };
    if (auth.startsWith('Bearer valid-superadmin-token')) return { userId: 'user_superadmin' };
    return {};
  },
  clerkClient: {
    users: {
      getUser: jest.fn().mockResolvedValue({
        fullName: 'Super Admin User',
        emailAddresses: [{ id: 'ea_1', emailAddress: 'superadmin@example.com' }],
        primaryEmailAddressId: 'ea_1',
      }),
    },
  },
}));

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({}) },
  })),
}));

// Mock resolveGroup: token 'valid-member-token' → member, 'valid-superadmin-token' → super admin
jest.mock('../middleware/resolveGroup', () => ({
  resolveGroup: (req, res, next) => {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer valid-member-token')) {
      req.auth = { userId: 'user_member' };
      req.member = {
        _id: require('mongoose').Types.ObjectId.createFromHexString('aaaaaaaaaaaaaaaaaaaaaaaa'),
        name: 'Test Member',
        email: 'member@example.com',
        role: 'treasurer',
      };
      req.groupId = require('mongoose').Types.ObjectId.createFromHexString('bbbbbbbbbbbbbbbbbbbbbbbb');
      req.isSuperAdmin = false;
    } else if (auth.startsWith('Bearer valid-superadmin-token')) {
      req.auth = { userId: 'user_superadmin' };
      req.isSuperAdmin = true;
    }
    next();
  },
}));

// Mock requireSuperAdmin: only passes for 'valid-superadmin-token'
jest.mock('../middleware/requireSuperAdmin', () => ({
  requireSuperAdmin: (req, res, next) => {
    const auth = req.headers?.authorization || '';
    if (auth.startsWith('Bearer valid-superadmin-token')) {
      req.auth = { userId: 'user_superadmin' };
      req.isSuperAdmin = true;
      return next();
    }
    return res.status(403).json({ error: 'Super admin access required' });
  },
}));

// Mock Group.findById used inside supportController
jest.mock('../models/Group', () => ({
  findById: jest.fn(() => ({
    select: jest.fn().mockResolvedValue({ name: 'Chama360 Pilot Group' }),
  })),
}));

jest.setTimeout(120000);

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Build a minimal test app
  app = express();
  app.use(express.json());

  const { verifyToken } = require('../middleware/auth');
  const { resolveGroup } = require('../middleware/resolveGroup');
  const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
  const supportController = require('../controllers/supportController');

  // User-facing route
  app.post('/api/support/request', verifyToken, resolveGroup, supportController.createRequest);

  // Admin routes (guarded by verifyToken + requireSuperAdmin)
  const adminRouter = express.Router();
  adminRouter.use(verifyToken, requireSuperAdmin);
  adminRouter.get('/support', supportController.listRequests);
  adminRouter.patch('/support/:id', supportController.updateStatus);
  app.use('/api/admin', adminRouter);
});

afterEach(async () => {
  const SupportRequest = require('../models/SupportRequest');
  await SupportRequest.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

const MEMBER_TOKEN = 'Bearer valid-member-token';
const ADMIN_TOKEN = 'Bearer valid-superadmin-token';

const VALID_BODY = {
  phone: '0979645911',
  category: 'question',
  description: 'I have a question about the app.',
};

describe('POST /api/support/request', () => {
  it('returns 201, persists document with status:open, sets notifiedTelegramAt on success', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat-id';

    const res = await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send(VALID_BODY);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.ticketId).toBeDefined();

    const SupportRequest = require('../models/SupportRequest');
    const ticket = await SupportRequest.findById(res.body.ticketId);
    expect(ticket).not.toBeNull();
    expect(ticket.status).toBe('open');
    expect(ticket.name).toBe('Test Member');
    expect(ticket.email).toBe('member@example.com');
    expect(ticket.groupName).toBe('Chama360 Pilot Group');
    expect(ticket.notifiedTelegramAt).not.toBeNull();

    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it('returns 201 even if Telegram send fails; notifiedTelegramAt is null and notifyError is set', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat-id';

    const res = await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send(VALID_BODY);

    expect(res.statusCode).toBe(201);

    const SupportRequest = require('../models/SupportRequest');
    const ticket = await SupportRequest.findById(res.body.ticketId);
    expect(ticket.notifiedTelegramAt).toBeNull();
    expect(ticket.notifyError).toMatch(/telegram/);

    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it('returns 400 when phone is missing', async () => {
    const res = await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send({ category: 'question', description: 'Some description here.' });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid category', async () => {
    const res = await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send({ phone: '0979645911', category: 'invalid_category', description: 'Some description here.' });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when description is empty', async () => {
    const res = await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send({ phone: '0979645911', category: 'question', description: '' });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when description exceeds 4000 characters', async () => {
    const res = await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send({ phone: '0979645911', category: 'question', description: 'a'.repeat(4001) });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/support/request')
      .send(VALID_BODY);

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/admin/support', () => {
  it('returns 403 for non-super-admin', async () => {
    const res = await request(app)
      .get('/api/admin/support')
      .set('Authorization', MEMBER_TOKEN);

    expect(res.statusCode).toBe(403);
  });

  it('returns paginated ticket list sorted by createdAt desc for super admin', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    // Create two tickets
    await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send({ ...VALID_BODY, category: 'error' });

    await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send({ ...VALID_BODY, category: 'billing' });

    delete process.env.TELEGRAM_BOT_TOKEN;

    const res = await request(app)
      .get('/api/admin/support')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.requests).toHaveLength(2);
    // Sorted by createdAt desc — most recent first
    expect(res.body.requests[0].createdAt >= res.body.requests[1].createdAt).toBe(true);
  });

  it('filters by status correctly', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send(VALID_BODY);

    delete process.env.TELEGRAM_BOT_TOKEN;

    const openRes = await request(app)
      .get('/api/admin/support?status=open')
      .set('Authorization', ADMIN_TOKEN);

    expect(openRes.statusCode).toBe(200);
    expect(openRes.body.total).toBe(1);

    const closedRes = await request(app)
      .get('/api/admin/support?status=closed')
      .set('Authorization', ADMIN_TOKEN);

    expect(closedRes.body.total).toBe(0);
  });
});

describe('PATCH /api/admin/support/:id', () => {
  it('transitions open → resolved, sets resolvedAt and resolvedBy', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    const createRes = await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send(VALID_BODY);

    delete process.env.TELEGRAM_BOT_TOKEN;

    const ticketId = createRes.body.ticketId;

    const patchRes = await request(app)
      .patch(`/api/admin/support/${ticketId}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ status: 'resolved', resolutionNote: 'Issue fixed.' });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.body.status).toBe('resolved');
    expect(patchRes.body.resolvedAt).not.toBeNull();
    expect(patchRes.body.resolvedBy).toBe('user_superadmin');
  });

  it('second transition to closed does NOT overwrite resolvedAt', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    const createRes = await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send(VALID_BODY);

    delete process.env.TELEGRAM_BOT_TOKEN;

    const ticketId = createRes.body.ticketId;

    // First transition to resolved
    const res1 = await request(app)
      .patch(`/api/admin/support/${ticketId}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ status: 'resolved' });

    const originalResolvedAt = res1.body.resolvedAt;

    // Second transition to closed
    const res2 = await request(app)
      .patch(`/api/admin/support/${ticketId}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ status: 'closed' });

    expect(res2.body.resolvedAt).toBe(originalResolvedAt);
  });

  it('returns 400 for invalid status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';

    const createRes = await request(app)
      .post('/api/support/request')
      .set('Authorization', MEMBER_TOKEN)
      .send(VALID_BODY);

    delete process.env.TELEGRAM_BOT_TOKEN;

    const ticketId = createRes.body.ticketId;

    const res = await request(app)
      .patch(`/api/admin/support/${ticketId}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ status: 'not_a_real_status' });

    expect(res.statusCode).toBe(400);
  });
});
