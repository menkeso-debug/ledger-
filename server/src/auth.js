import crypto from 'node:crypto';
import { config } from './config.js';
import { log } from './lib/log.js';

// One user, one password. The session cookie is an HMAC of the password —
// deterministic (survives restarts, no session table) and rotating either the
// password or the encryption key invalidates every device at once.
const COOKIE = 'ledger_auth';
const MAX_AGE = 400 * 24 * 60 * 60; // browser cookie lifetime ceiling (~400 days)

function sessionToken() {
  return crypto
    .createHmac('sha256', config.encryptionKey || 'unconfigured')
    .update(`ledger-auth-v1:${config.password}`)
    .digest('hex');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function readCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === COOKIE) return part.slice(eq + 1).trim();
  }
  return null;
}

function setSessionCookie(req, res) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${sessionToken()}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  );
}

export function authRoutes(app) {
  app.get('/api/auth/check', (req, res) => {
    if (!config.password) return res.json({ authed: true, gate: false });
    const token = readCookie(req);
    res.json({ authed: !!token && safeEqual(token, sessionToken()), gate: true });
  });

  app.post('/api/auth/login', (req, res) => {
    if (!config.password) return res.json({ ok: true });
    const attempt = String(req.body?.password ?? '');
    if (!safeEqual(attempt, config.password)) {
      log.warn('failed login attempt');
      return res.status(401).json({ error: 'wrong password' });
    }
    setSessionCookie(req, res);
    res.json({ ok: true });
  });
}

// Everything under /api requires the session cookie, except the login/check
// endpoints above and the Plaid webhook (verified separately via its JWT).
// Both full and mount-relative forms: req.path is relative when the gate is
// mounted at '/api', absolute if it's ever mounted globally.
const OPEN_PATHS = new Set([
  '/api/auth/login', '/api/auth/check', '/api/plaid/webhook', '/api/health',
  '/auth/login', '/auth/check', '/plaid/webhook', '/health',
]);

export function authGate(req, res, next) {
  if (!config.password) return next();
  if (OPEN_PATHS.has(req.path)) return next();
  const token = readCookie(req);
  if (token && safeEqual(token, sessionToken())) return next();
  res.status(401).json({ error: 'unauthorized' });
}
