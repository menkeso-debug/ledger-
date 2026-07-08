// Structured logger with token redaction. Never log Plaid access tokens or account numbers.
const SECRET_PATTERNS = [
  /access-(sandbox|development|production)-[0-9a-f-]+/gi, // Plaid access tokens
  /public-(sandbox|development|production)-[0-9a-f-]+/gi, // Plaid public tokens
  /link-(sandbox|development|production)-[0-9a-f-]+/gi, // Plaid link tokens
  /sk-ant-[A-Za-z0-9_-]+/g, // Anthropic keys
  /\b\d{13,19}\b/g, // anything that looks like a full card/account number
];

function redact(value) {
  if (typeof value === 'string') {
    let out = value;
    for (const p of SECRET_PATTERNS) out = out.replace(p, '[REDACTED]');
    return out;
  }
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message), stack: redact(value.stack || '') };
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|password|authorization|api[_-]?key/i.test(k)) out[k] = '[REDACTED]';
      else out[k] = redact(v);
    }
    return out;
  }
  return value;
}

function emit(level, msg, meta) {
  const line = { ts: new Date().toISOString(), level, msg: redact(msg) };
  if (meta !== undefined) line.meta = redact(meta);
  const s = JSON.stringify(line);
  if (level === 'error') console.error(s);
  else console.log(s);
}

export const log = {
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};
