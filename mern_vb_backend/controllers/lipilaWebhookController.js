const SubscriptionPayment = require('../models/SubscriptionPayment');
const { verifyWebhookSignature, mapLipilaStatus, checkCollectionStatus } = require('../utils/lipilaClient');
const subscriptionCollection = require('../utils/subscriptionCollection');

// Source plan §5b / Step 5b — the single source of truth for a Lipila
// collection result. Signed, verified before anything is parsed. Never logs
// the payload, accountNumber or the webhook secret.
async function handle(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  const verified = verifyWebhookSignature({
    id: req.get('webhook-id'),
    timestamp: req.get('webhook-timestamp'),
    signature: req.get('webhook-signature'),
    rawBody,
  });
  if (!verified) {
    console.error('[lipila] webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signed but unparseable — don't make Lipila retry forever on a body it
    // will never be able to send differently.
    return res.status(200).json({ received: true });
  }

  if (!payload || payload.type !== 'Collection') {
    return res.status(200).json({ received: true });
  }

  try {
    const attempt = await SubscriptionPayment.findOne({ reference: payload.referenceId });
    if (!attempt) {
      // Unknown reference — may be another collection on the same wallet.
      return res.status(200).json({ received: true });
    }

    const mappedStatus = mapLipilaStatus(payload.status);

    // The webhook secret is merchant-wide (shared with another app on the
    // same wallet) — a forged-but-validly-signed `Successful` payload from
    // that other app must never be able to activate a group here. Before
    // activating on a webhook success, confirm the collection directly with
    // Lipila using this wallet's own API key. Failed webhooks need no
    // confirmation — they never activate anything.
    if (mappedStatus === 'success') {
      const confirmed = await checkCollectionStatus({ reference: attempt.reference });

      if (confirmed.status === 'success') {
        await subscriptionCollection.resolveAttempt(attempt._id, {
          status: 'success',
          amount: confirmed.amount != null ? confirmed.amount : payload.amount,
          currency: confirmed.currency || payload.currency,
          externalId: confirmed.externalId || payload.externalId || null,
          identifier: confirmed.identifier || payload.identifier,
          message: confirmed.message || payload.message,
          raw: payload,
        });
        return res.status(200).json({ received: true });
      }

      if (confirmed.status === 'failed') {
        await subscriptionCollection.resolveAttempt(attempt._id, {
          status: 'failed',
          amount: payload.amount,
          currency: payload.currency,
          externalId: payload.externalId || null,
          identifier: payload.identifier,
          message: confirmed.message || payload.message,
          raw: payload,
        });
        return res.status(200).json({ received: true });
      }

      // confirmed.status is 'pending' or 'unknown' — never activate on an
      // unconfirmed success. Answer 503 so Lipila retries the webhook later
      // (the resolver is idempotent); the poll/reconcile path can also finish
      // it. A payer who closed the tab must not depend on someone reopening
      // /upgrade. Never log the payload itself.
      console.error('[lipila] webhook Successful not confirmed by provider; asking Lipila to retry');
      await subscriptionCollection.resolveAttempt(attempt._id, { status: 'pending' });
      return res.status(503).json({ error: 'Not yet confirmed' });
    }

    await subscriptionCollection.resolveAttempt(attempt._id, {
      status: mappedStatus,
      amount: payload.amount,
      currency: payload.currency,
      externalId: payload.externalId || null,
      identifier: payload.identifier,
      message: payload.message,
      raw: payload,
    });

    return res.status(200).json({ received: true });
  } catch (err) {
    // Let Lipila retry — resolveAttempt is idempotent, so a retry is safe.
    // Also covers checkCollectionStatus throwing (rather than returning
    // status: 'unknown', which it only does on a non-exception failure path).
    console.error('[lipila] webhook resolve failed:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = { handle };
