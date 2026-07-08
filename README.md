# Ledger

Single-user personal finance dashboard with an AI advisory layer. Aggregates six accounts via Plaid, categorizes spending, detects patterns deterministically, tracks rewards across all cards, and layers Claude on top for a proactive daily briefing plus on-demand Q&A over real transaction data.

## Architecture

Single Node.js service on Railway serving both the API and the built React frontend, backed by Railway Postgres.

```
web/            Vite + React + TS + Tailwind — the six screens per the design handoff
server/
  src/plaid/    Link token, token exchange, /transactions/sync (cursor per item), webhook JWT verification
  src/analytics/  Deterministic engine: MoM deltas, recurring detection, 3-mo baselines,
                  new-merchant & large-txn flags, net cash flow → insights table
  src/rewards/  MQD pace + driver attribution, per-card points earn rates, credit tracking,
                manual point balances (rules in rewards/config.js)
  src/advisor/  Anthropic API: scheduled briefing (cron) + Q&A tool-runner over safe query tools
  src/db/       Migrations (schema in migrations/001_init.sql)
```

**Data flow:** Plaid webhook (`SYNC_UPDATES_AVAILABLE`) → `/transactions/sync` with per-item cursor → upsert → recompute insights. A 6-hour cron is the safety net. The briefing cron (default 7:30am) syncs, recomputes, and writes the daily read.

**Security:** Plaid access tokens are AES-256-GCM encrypted at rest (`LEDGER_ENCRYPTION_KEY`). The logger redacts anything token-shaped and any ≥13-digit number; Plaid only ever returns account masks (last 4). Webhooks are JWT-verified against Plaid's keys outside sandbox.

**Advisor framing:** the model is instructed it surfaces insights, not fiduciary advice. Q&A uses fixed read-only query tools — model-authored SQL never touches Postgres.

## Local dev

```sh
npm install
cp .env.example .env   # fill in DATABASE_URL, keys (see below)
npm run migrate
npm run dev            # server :3000 + vite :5173 (proxies /api)
```

## Railway deploy

1. New project → add **Postgres**; add a service from this repo. `railway.json` covers build/start; health check is `/api/health`.
2. Set service variables:
   - `DATABASE_URL` → `${{Postgres.DATABASE_URL}}` (use the internal URL; no `PGSSL` needed)
   - `LEDGER_ENCRYPTION_KEY` → `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`
   - `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`, default `claude-opus-4-8`)
   - `PLAID_WEBHOOK_URL` → `https://<your-domain>/api/plaid/webhook` (after first deploy)
   - Optional: `MONTHLY_BUDGET`, `MQD_TARGET` (default 15000), `MQD_TARGET_LABEL`, `BRIEFING_CRON`, `LEDGER_TZ`
3. Open the app → **Accounts → Connect an account** (Plaid Link). Initial link requests 730 days of history; the backfill lands via webhooks over the following minutes.
4. Flip to production: change `PLAID_SECRET` + `PLAID_ENV=production` (webhook verification turns on automatically).

## Sandbox validation

With `PLAID_ENV=sandbox`, link any sandbox institution (`user_good` / `pass_good`). Sandbox data won't match the real card lineup — card-art tiers match on account names, so expect the graphite default tile. Rewards math runs on whatever spend exists; real MQD/credit numbers appear once production data flows.

## Tuning the rewards rules

Everything program-specific is declarative in [server/src/rewards/config.js](server/src/rewards/config.js): MQD thresholds and driver attribution, per-card earn rates, and the card-credit lineup (amount, period, merchant matcher, nudge window). Category budgets are seeded in the `budgets` table.

## API surface

| Route | What |
|---|---|
| `POST /api/plaid/link-token` / `exchange` / `webhook` / `sync` | Ingestion |
| `GET /api/overview` `accounts` `categories` `insights` `transactions` | Screen data |
| `POST /api/insights/:id/dismiss` | Feed management |
| `GET /api/rewards` · `PUT /api/rewards/balances` | Rewards + manual point balances |
| `GET/POST /api/advisor/briefing` · `POST /api/advisor/ask` | Advisory layer |

The design handoff lives in [Personal Finance Dashboard/](Personal%20Finance%20Dashboard/).
