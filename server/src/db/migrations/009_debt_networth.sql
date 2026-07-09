-- Debt command center + net worth + alert delivery log

-- Per-card debt terms (manual entry — Plaid Transactions doesn't expose APR)
ALTER TABLE accounts ADD COLUMN apr NUMERIC(5,2);
ALTER TABLE accounts ADD COLUMN min_payment NUMERIC(12,2);

-- Manual assets (brokerage, savings elsewhere, property equity...) for net worth
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  value NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily net worth snapshots (taken by the morning cron)
CREATE TABLE networth_snapshots (
  date DATE PRIMARY KEY,
  cash NUMERIC(14,2) NOT NULL,
  card_debt NUMERIC(14,2) NOT NULL,
  assets NUMERIC(14,2) NOT NULL,
  net NUMERIC(14,2) NOT NULL
);

-- Alert delivery dedupe (an alert fires once per dedupe key)
CREATE TABLE alerts_log (
  dedupe_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  channel TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
