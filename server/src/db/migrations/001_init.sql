-- Ledger core schema

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid

-- One row per Plaid Item (institution login). Access token encrypted at rest (AES-256-GCM).
CREATE TABLE plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id TEXT UNIQUE NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  access_token_enc TEXT NOT NULL,          -- encrypted; never stored or logged in plaintext
  transactions_cursor TEXT,                -- /transactions/sync cursor, per item
  status TEXT NOT NULL DEFAULT 'active',   -- active | login_required | error
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  official_name TEXT,
  mask TEXT,                               -- last 4 only; Plaid never returns full numbers
  type TEXT NOT NULL,                      -- depository | credit
  subtype TEXT,
  tier TEXT,                               -- card-art tier: plat|gold|delta|csr|prime|cpc (matched on name)
  current_balance NUMERIC(14,2),
  available_balance NUMERIC(14,2),
  credit_limit NUMERIC(14,2),
  iso_currency_code TEXT DEFAULT 'USD',
  balances_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX accounts_item_idx ON accounts(item_id);

-- Plaid convention: amount > 0 = money out (spend), amount < 0 = money in.
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT UNIQUE NOT NULL,
  pending_transaction_id TEXT,
  date DATE NOT NULL,
  authorized_date DATE,
  name TEXT NOT NULL,
  merchant_name TEXT,
  amount NUMERIC(14,2) NOT NULL,
  iso_currency_code TEXT DEFAULT 'USD',
  pending BOOLEAN NOT NULL DEFAULT false,
  payment_channel TEXT,
  pfc_primary TEXT,                        -- Plaid personal_finance_category.primary
  pfc_detailed TEXT,                       -- Plaid personal_finance_category.detailed
  category TEXT,                           -- Ledger display category (Housing, Dining, ...)
  subcategory TEXT,                        -- Ledger display subcategory (Restaurants, Coffee, ...)
  removed BOOLEAN NOT NULL DEFAULT false,  -- soft delete on Plaid "removed"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_account_date_idx ON transactions(account_id, date DESC);
CREATE INDEX transactions_date_idx ON transactions(date DESC) WHERE NOT removed;
CREATE INDEX transactions_category_idx ON transactions(category, date DESC) WHERE NOT removed;
CREATE INDEX transactions_merchant_idx ON transactions(merchant_name, date DESC) WHERE NOT removed;

-- Deterministic analytics output, rendered on the Insights screen and read by the advisor.
CREATE TABLE insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,                      -- overspend | bill_jumped | new_recurring | opportunity | almost_there | large_txn | new_merchant | baseline
  tone TEXT NOT NULL,                      -- neg | amber | accent | pos
  tag TEXT NOT NULL,                       -- display tag, e.g. "Overspend"
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  impact TEXT,                             -- anchor figure, e.g. "$620"
  impact_sub TEXT,                         -- e.g. "over budget"
  cta TEXT,
  dedupe_key TEXT UNIQUE NOT NULL,         -- e.g. "overspend:Dining:2026-07"
  data JSONB NOT NULL DEFAULT '{}',
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX insights_active_idx ON insights(created_at DESC) WHERE NOT dismissed;

-- Manual rewards point balances (Plaid can't pull loyalty balances).
CREATE TABLE rewards_balances (
  program TEXT PRIMARY KEY,                -- amex_mr | chase_ur | delta_skymiles
  display_name TEXT NOT NULL,
  note TEXT,
  balance BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO rewards_balances (program, display_name, note, balance) VALUES
  ('amex_mr',        'Amex Membership Rewards', 'Platinum + Gold',  0),
  ('chase_ur',       'Chase Ultimate Rewards',  'Sapphire Reserve + Prime Visa', 0),
  ('delta_skymiles', 'Delta SkyMiles',          'Delta Reserve',    0);

-- Per-category monthly budgets (drives Categories screen + overspend flags).
CREATE TABLE budgets (
  category TEXT PRIMARY KEY,
  monthly_budget NUMERIC(12,2) NOT NULL
);

INSERT INTO budgets (category, monthly_budget) VALUES
  ('Housing',       6800),
  ('Travel',        5000),
  ('Dining',        2500),
  ('Shopping',      1800),
  ('Groceries',     1200),
  ('Subscriptions',  450),
  ('Transport',      400),
  ('Health',         400),
  ('Other',         1000);

-- Stored proactive briefings from the advisory layer.
CREATE TABLE briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  model TEXT NOT NULL,
  input_snapshot JSONB,                    -- rollups the model saw, for auditability
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
