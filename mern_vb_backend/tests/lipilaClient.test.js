const crypto = require('crypto');
const {
  initiateCollection,
  checkCollectionStatus,
  mapLipilaStatus,
  classifyFailureReason,
  verifyWebhookSignature,
} = require('../utils/lipilaClient');

const ORIGINAL_ENV = { ...process.env };

function makeSecret() {
  return 'whsec_' + crypto.randomBytes(32).toString('base64');
}

function sign({ id, timestamp, rawBody, secret }) {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const digest = crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return `v1,${digest}`;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function nonJsonResponse(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error('Unexpected token < in JSON');
    },
  };
}

describe('mapLipilaStatus', () => {
  it('maps Pending to pending', () => {
    expect(mapLipilaStatus('Pending')).toBe('pending');
  });
  it('maps Successful to success', () => {
    expect(mapLipilaStatus('Successful')).toBe('success');
  });
  it('maps Failed to failed', () => {
    expect(mapLipilaStatus('Failed')).toBe('failed');
  });
  it('maps an unexpected status to pending (never activates or fails blindly)', () => {
    expect(mapLipilaStatus('SomethingWeird')).toBe('pending');
  });
});

describe('classifyFailureReason', () => {
  it('classifies "Incorrect pin has been entered." as pin', () => {
    expect(classifyFailureReason('Incorrect pin has been entered.')).toBe('pin');
  });
  it('classifies "User did not enter their pin." as pin', () => {
    expect(classifyFailureReason('User did not enter their pin.')).toBe('pin');
  });
  it('classifies "PIN verification failed" as pin', () => {
    expect(classifyFailureReason('PIN verification failed')).toBe('pin');
  });
  it('classifies "PIN verification could not be completed due to a timeout." as timeout, not pin', () => {
    expect(classifyFailureReason('PIN verification could not be completed due to a timeout.')).toBe('timeout');
  });
  it('classifies a bare "Failed" as other', () => {
    expect(classifyFailureReason('Failed')).toBe('other');
  });
});

describe('verifyWebhookSignature', () => {
  const secret = makeSecret();
  const id = 'msg_123';
  const rawBody = JSON.stringify({ referenceId: 'c360-1', status: 'Successful' });

  beforeEach(() => {
    process.env.LIPILA_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('verifies a correctly signed, fresh payload', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign({ id, timestamp, rawBody, secret });
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody })).toBe(true);
  });

  it('rejects a tampered body', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign({ id, timestamp, rawBody, secret });
    const tamperedBody = JSON.stringify({ referenceId: 'c360-1', status: 'Failed' });
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody: tamperedBody })).toBe(false);
  });

  it('accepts when the good signature is one of several space-separated candidates', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const goodSignature = sign({ id, timestamp, rawBody, secret });
    const signature = `v1,bad ${goodSignature}`;
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody })).toBe(true);
  });

  it('rejects a timestamp older than 300 seconds', () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const signature = sign({ id, timestamp, rawBody, secret });
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody })).toBe(false);
  });

  it('rejects when a required header is missing', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign({ id, timestamp, rawBody, secret });
    expect(verifyWebhookSignature({ id, timestamp: undefined, signature, rawBody })).toBe(false);
    expect(verifyWebhookSignature({ id: undefined, timestamp, signature, rawBody })).toBe(false);
    expect(verifyWebhookSignature({ id, timestamp, signature: undefined, rawBody })).toBe(false);
  });
});

describe('initiateCollection', () => {
  const baseEnv = {
    LIPILA_BASE_URL: 'https://api.lipila.dev',
    LIPILA_API_KEY: 'Lsk_test_key',
    LIPILA_CALLBACK_URL: 'https://api.chama360.nxhub.online/api/webhooks/lipila/subscriptions',
  };

  beforeEach(() => {
    Object.assign(process.env, baseEnv);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete global.fetch;
  });

  it('returns pending with the provider identifier on HTTP 200 Pending', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, { status: 'Pending', identifier: 'LPLXC-abc123', paymentType: 'MobileMoney' })
    );
    const result = await initiateCollection({ reference: 'c360-1', amount: 300, currency: 'ZMW', msisdn: '260975551234', narration: 'Subscription' });
    expect(result.outcome).toBe('pending');
    expect(result.raw.identifier).toBe('LPLXC-abc123');
  });

  it('returns failed on HTTP 500 with errors.generalErrors', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(500, { errors: { generalErrors: ['Insufficient balance'] } })
    );
    const result = await initiateCollection({ reference: 'c360-2', amount: 300, currency: 'ZMW', msisdn: '260975551234', narration: 'Subscription' });
    expect(result.outcome).toBe('failed');
    expect(result.reason).toBe('Insufficient balance');
  });

  it('returns failed on HTTP 429', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(429, { message: 'Too many requests' }));
    const result = await initiateCollection({ reference: 'c360-3', amount: 300, currency: 'ZMW', msisdn: '260975551234', narration: 'Subscription' });
    expect(result.outcome).toBe('failed');
    expect(result.reason).toBe('rate_limited');
  });

  it('returns failed on a generic HTTP 400', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(400, { message: 'Bad request' }));
    const result = await initiateCollection({ reference: 'c360-4', amount: 300, currency: 'ZMW', msisdn: '260975551234', narration: 'Subscription' });
    expect(result.outcome).toBe('failed');
  });

  it('returns ambiguous on a timeout', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'TimeoutError';
    global.fetch = jest.fn().mockRejectedValue(abortError);
    const result = await initiateCollection({ reference: 'c360-5', amount: 300, currency: 'ZMW', msisdn: '260975551234', narration: 'Subscription' });
    expect(result.outcome).toBe('ambiguous');
    expect(result.reason).toBe('timeout');
  });

  it('returns ambiguous on an unparseable 5xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue(nonJsonResponse(502));
    const result = await initiateCollection({ reference: 'c360-6', amount: 300, currency: 'ZMW', msisdn: '260975551234', narration: 'Subscription' });
    expect(result.outcome).toBe('ambiguous');
  });
});

describe('checkCollectionStatus', () => {
  const baseEnv = {
    LIPILA_BASE_URL: 'https://api.lipila.dev',
    LIPILA_API_KEY: 'Lsk_test_key',
  };

  beforeEach(() => {
    Object.assign(process.env, baseEnv);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete global.fetch;
  });

  it('returns success on HTTP 200 Successful', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, { status: 'Successful', amount: 300, currency: 'ZMW', externalId: 'MNO-1', identifier: 'LPLXC-abc123' })
    );
    const result = await checkCollectionStatus({ reference: 'c360-1' });
    expect(result.status).toBe('success');
    expect(result.externalId).toBe('MNO-1');
  });

  it('returns unknown on HTTP 404 with a non-JSON body', async () => {
    global.fetch = jest.fn().mockResolvedValue(nonJsonResponse(404));
    const result = await checkCollectionStatus({ reference: 'does-not-exist' });
    expect(result.status).toBe('unknown');
  });
});
