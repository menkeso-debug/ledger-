import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { log } from './lib/log.js';
import { apiRouter } from './routes/api.js';
import { plaidRouter } from './routes/plaid.js';
import { rewardsRouter } from './routes/rewards.js';
import { advisorRouter } from './routes/advisor.js';
import { syncAllItems } from './plaid/sync.js';
import { computeInsights } from './analytics/engine.js';
import { generateBriefing } from './advisor/briefing.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');

const app = express();
app.disable('x-powered-by');

// Webhook route needs the raw body for JWT verification — mount before json().
app.use('/api/plaid/webhook', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/plaid', plaidRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/advisor', advisorRouter);
app.use('/api', apiRouter);

// Serve the built frontend (single Railway service).
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  log.error('request failed', { path: req.path, err });
  const plaidError = err?.response?.data?.error_code;
  res.status(500).json({ error: plaidError || 'internal error' });
});

async function main() {
  await migrate();

  app.listen(config.port, () => log.info(`ledger listening on :${config.port}`, { plaidEnv: config.plaid.env }));

  // Proactive briefing: recompute deterministic insights, then write the daily read.
  cron.schedule(config.briefingCron, async () => {
    try {
      await syncAllItems();
      await computeInsights();
      await generateBriefing();
    } catch (err) {
      log.error('scheduled briefing failed', err);
    }
  }, { timezone: config.timezone });

  // Safety-net sync every 6h — webhooks are the primary trigger.
  cron.schedule('0 */6 * * *', async () => {
    try {
      await syncAllItems();
      await computeInsights();
    } catch (err) {
      log.error('scheduled sync failed', err);
    }
  }, { timezone: config.timezone });
}

main().catch((err) => {
  log.error('fatal startup error', err);
  process.exit(1);
});
