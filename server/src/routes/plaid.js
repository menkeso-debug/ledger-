import { Router } from 'express';
import { createLinkToken, exchangePublicToken, syncItemByPlaidId, syncAllItems } from '../plaid/sync.js';
import { verifyPlaidWebhook } from '../plaid/webhookVerify.js';
import { computeInsights } from '../analytics/engine.js';
import { log } from '../lib/log.js';

export const plaidRouter = Router();

plaidRouter.post('/link-token', async (_req, res, next) => {
  try {
    res.json(await createLinkToken());
  } catch (err) { next(err); }
});

plaidRouter.post('/exchange', async (req, res, next) => {
  try {
    const { public_token } = req.body || {};
    if (!public_token) return res.status(400).json({ error: 'public_token required' });
    const item = await exchangePublicToken(public_token);
    computeInsights().catch((err) => log.error('insights after exchange failed', err));
    res.json({ ok: true, item_id: item.plaid_item_id });
  } catch (err) { next(err); }
});

// Plaid webhooks. Mounted with express.raw() so the JWT body hash can be verified.
plaidRouter.post('/webhook', async (req, res) => {
  const raw = req.body; // Buffer (express.raw)
  const ok = await verifyPlaidWebhook(raw, req.header('Plaid-Verification'));
  if (!ok) {
    log.warn('rejected unverified webhook');
    return res.status(401).json({ error: 'verification failed' });
  }
  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'invalid JSON' });
  }
  // Ack fast; process async.
  res.json({ ok: true });

  const { webhook_type: type, webhook_code: code, item_id: itemId } = payload;
  log.info('webhook received', { type, code, itemId });
  try {
    if (type === 'TRANSACTIONS' && ['SYNC_UPDATES_AVAILABLE', 'INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'DEFAULT_UPDATE'].includes(code)) {
      await syncItemByPlaidId(itemId);
      await computeInsights();
    } else if (type === 'ITEM' && code === 'ERROR') {
      log.error('item error webhook', { itemId, error: payload.error?.error_code });
    }
  } catch (err) {
    log.error('webhook processing failed', err);
  }
});

// Manual full sync (also used by the UI's refresh affordance).
plaidRouter.post('/sync', async (_req, res, next) => {
  try {
    const results = await syncAllItems();
    await computeInsights();
    res.json({ ok: true, results });
  } catch (err) { next(err); }
});
