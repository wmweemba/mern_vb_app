const crypto = require('crypto');

const TIMEOUT_MS = 20000;

// Env vars are read inside each function call, never at module scope, so tests
// (and runtime config changes) never race against a value cached at require()-time.
function config() {
  return {
    baseUrl: process.env.LIPILA_BASE_URL, // https://api.lipila.dev | https://blz.lipila.io
    apiKey: process.env.LIPILA_API_KEY,
    callbackUrl: process.env.LIPILA_CALLBACK_URL, // full URL of /api/webhooks/lipila/subscriptions
  };
}

// Lipila status strings are capitalised. Anything unrecognised is treated as
// pending — an unknown status must never activate or fail an attempt.
function mapLipilaStatus(status) {
  if (status === 'Successful') return 'success';
  if (status === 'Failed') return 'failed';
  return 'pending';
}

/**
 * @returns {Promise<{ outcome: 'pending' | 'failed' | 'ambiguous', reason?: string, raw: object | null }>}
 *   'failed' only when Lipila definitively rejected the request (no PIN prompt was sent).
 *   'ambiguous' = timeout / network / unparseable response — a prompt MAY be live.
 */
async function initiateCollection({ reference, amount, currency, msisdn, narration, email }) {
  const { baseUrl, apiKey, callbackUrl } = config();
  let res;
  try {
    res = await fetch(`${baseUrl}/api/v1/collections/mobile-money`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        callbackUrl,
      },
      body: JSON.stringify({ referenceId: reference, amount: Number(amount), narration, accountNumber: msisdn, currency, email }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { outcome: 'ambiguous', reason: err.name === 'TimeoutError' ? 'timeout' : 'network', raw: null };
  }

  const body = await res.json().catch(() => null);
  if (res.ok && body) {
    const mapped = mapLipilaStatus(body.status);
    if (mapped === 'failed') return { outcome: 'failed', reason: body.message || 'Failed', raw: body };
    return { outcome: 'pending', raw: body };
  }
  if (res.status === 429) return { outcome: 'failed', reason: 'rate_limited', raw: body };
  const generalErrors = body?.errors?.generalErrors;
  if (Array.isArray(generalErrors) && generalErrors.length) {
    return { outcome: 'failed', reason: generalErrors.join('; '), raw: body };
  }
  if (res.status >= 400 && res.status < 500) return { outcome: 'failed', reason: `http_${res.status}`, raw: body };
  return { outcome: 'ambiguous', reason: `http_${res.status}`, raw: body };
}

/**
 * @returns {Promise<{ status: 'pending' | 'success' | 'failed' | 'unknown', amount?, currency?, externalId?, identifier?, message?, raw }>}
 *   'unknown' = Lipila has no record of this reference, or the call itself failed.
 *
 * Ported from the Step 0 findings (source plan §3), not guessed:
 *   - A known reference returns HTTP 200 with the SAME shape as the webhook payload
 *     ({ referenceId, currency, amount, accountNumber, status, paymentType, type,
 *     ipAddress, identifier, externalId, message, referenceData, narration }).
 *   - An unknown reference returns HTTP 404 with a body that is NOT valid JSON —
 *     never assume body.status exists on a non-2xx response.
 */
async function checkCollectionStatus({ reference }) {
  const { baseUrl, apiKey } = config();
  let res;
  try {
    res = await fetch(`${baseUrl}/api/v1/collections/check-status?referenceId=${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: { accept: 'application/json', 'x-api-key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { status: 'unknown', raw: null };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body || typeof body.status !== 'string') {
    return { status: 'unknown', raw: body };
  }

  return {
    status: mapLipilaStatus(body.status),
    amount: body.amount,
    currency: body.currency,
    externalId: body.externalId || null,
    identifier: body.identifier,
    message: body.message,
    raw: body,
  };
}

// Coarse, user-facing classification of a raw provider failure reason — never
// send the raw text (e.g. "Insufficient balance", "http_500") to the browser.
// Order matters: timeout is checked BEFORE pin, because the spike found
// "PIN verification could not be completed due to a timeout." — a message
// that contains both words and must read as a timeout, not a PIN error.
function classifyFailureReason(reason) {
  if (!reason) return 'other';
  if (/timeout/i.test(reason)) return 'timeout';
  if (/pin/i.test(reason)) return 'pin';
  if (reason === 'rate_limited') return 'rate_limited';
  return 'other';
}

// Ported from lipila-sandbox-spike/src/webhookVerify.js, which verified real
// Lipila webhooks. Standard Webhooks scheme: webhook-id / webhook-timestamp /
// webhook-signature headers, HMAC-SHA256 over "{id}.{timestamp}.{rawBody}",
// secret is base64-decoded (after stripping the "whsec_" prefix), signature is
// "v1,<base64>", possibly several space-delimited values during key rotation,
// reject anything older than 300s, constant-time compare.
function verifyWebhookSignature({ id, timestamp, signature, rawBody }) {
  const secret = process.env.LIPILA_WEBHOOK_SECRET;
  if (!id || !timestamp || !signature || !secret) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest();

  return signature
    .split(' ')
    .map((part) => part.split(',')[1])
    .filter(Boolean)
    .some((candidate) => {
      let given;
      try {
        given = Buffer.from(candidate, 'base64');
      } catch {
        return false;
      }
      return given.length === expected.length && crypto.timingSafeEqual(given, expected);
    });
}

module.exports = {
  initiateCollection,
  checkCollectionStatus,
  mapLipilaStatus,
  classifyFailureReason,
  verifyWebhookSignature,
};
