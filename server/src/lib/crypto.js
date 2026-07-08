import crypto from 'node:crypto';
import { config } from '../config.js';

// AES-256-GCM at rest for Plaid access tokens. Key is 32 bytes hex in LEDGER_ENCRYPTION_KEY.
// Ciphertext format: base64(iv[12] || authTag[16] || ciphertext)

function key() {
  if (!config.encryptionKey) throw new Error('LEDGER_ENCRYPTION_KEY is not set');
  const buf = Buffer.from(config.encryptionKey, 'hex');
  if (buf.length !== 32) throw new Error('LEDGER_ENCRYPTION_KEY must be 32 bytes hex (64 chars)');
  return buf;
}

export function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decrypt(encoded) {
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
