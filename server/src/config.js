const required = (name) => {
  const v = process.env[name];
  if (!v) {
    // Defer hard failure to first use so migrations/health can still run in partial envs.
    return null;
  }
  return v;
};

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  // 32-byte key, hex-encoded (64 chars). Generate: node -e "console.log(crypto.randomBytes(32).toString('hex'))"
  encryptionKey: required('LEDGER_ENCRYPTION_KEY'),

  plaid: {
    clientId: required('PLAID_CLIENT_ID'),
    secret: required('PLAID_SECRET'),
    env: process.env.PLAID_ENV || 'sandbox',
    // Public URL of this service, used for the webhook endpoint registered with Plaid.
    webhookUrl: process.env.PLAID_WEBHOOK_URL || null,
    // Verify inbound webhook JWTs against Plaid's verification keys. On by default outside sandbox.
    verifyWebhooks: process.env.PLAID_VERIFY_WEBHOOKS
      ? process.env.PLAID_VERIFY_WEBHOOKS === 'true'
      : (process.env.PLAID_ENV || 'sandbox') !== 'sandbox',
  },

  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-8',
  },

  // Cron expression for the proactive briefing (server-local time). Default 7:30am daily.
  briefingCron: process.env.BRIEFING_CRON || '30 7 * * *',
  timezone: process.env.LEDGER_TZ || 'America/New_York',

  // Total monthly budget shown on Overview; per-category budgets live in the budgets table.
  monthlyBudget: Number(process.env.MONTHLY_BUDGET || 20000),
};

export function assertConfigured(...keys) {
  const missing = [];
  for (const key of keys) {
    const parts = key.split('.');
    let v = config;
    for (const p of parts) v = v?.[p];
    if (!v) missing.push(key);
  }
  if (missing.length) {
    const envNames = {
      databaseUrl: 'DATABASE_URL',
      encryptionKey: 'LEDGER_ENCRYPTION_KEY',
      'plaid.clientId': 'PLAID_CLIENT_ID',
      'plaid.secret': 'PLAID_SECRET',
      'anthropic.apiKey': 'ANTHROPIC_API_KEY',
    };
    throw new Error(
      `Missing required environment variables: ${missing.map((m) => envNames[m] || m).join(', ')}`
    );
  }
}
