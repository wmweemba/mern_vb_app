const SubscriptionPayment = require('../models/SubscriptionPayment');
const { verifyWebhookSignature, mapLipilaStatus } = require('../utils/lipilaClient');
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

    await subscriptionCollection.resolveAttempt(attempt._id, {
      status: mapLipilaStatus(payload.status),
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
    console.error('[lipila] webhook resolve failed:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
}

module.exports = { handle };
