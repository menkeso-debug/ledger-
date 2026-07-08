import crypto from 'node:crypto';
import { importJWK, jwtVerify, decodeProtectedHeader } from 'jose';
import { plaid } from './client.js';
import { config } from '../config.js';
import { log } from '../lib/log.js';

// Plaid webhook verification: each webhook carries a Plaid-Verification JWT (ES256).
// We fetch the signing key by kid via /webhook_verification_key/get, verify the JWT,
// and check the body SHA-256 matches the claim. Keys are cached in memory.
// https://plaid.com/docs/api/webhooks/webhook-verification/

const keyCache = new Map(); // kid -> { jwk, fetchedAt }

async function getKey(kid) {
  const cached = keyCache.get(kid);
  if (cached && Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000) return cached.jwk;
  const { data } = await plaid().webhookVerificationKeyGet({ key_id: kid });
  if (data.key.expired_at != null) throw new Error('webhook signing key expired');
  keyCache.set(kid, { jwk: data.key, fetchedAt: Date.now() });
  return data.key;
}

export async function verifyPlaidWebhook(rawBody, jwtToken) {
  if (!config.plaid.verifyWebhooks) return true; // disabled (sandbox default)
  if (!jwtToken) return false;
  try {
    const header = decodeProtectedHeader(jwtToken);
    if (header.alg !== 'ES256') return false;
    const jwk = await getKey(header.kid);
    const key = await importJWK(jwk, 'ES256');
    const { payload } = await jwtVerify(jwtToken, key, { maxTokenAge: '5 min' });
    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(bodyHash),
      Buffer.from(payload.request_body_sha256 || '')
    );
  } catch (err) {
    log.warn('webhook verification failed', err);
    return false;
  }
}
