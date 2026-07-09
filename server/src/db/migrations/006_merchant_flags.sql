-- User-declared spend nature per merchant, respected by the projection engine:
--   constant: always part of steady monthly spend (averaged over the window),
--             even if it hits irregularly (e.g. daycare billed per term)
--   one_off:  never part of steady spend, always listed as excluded
CREATE TABLE merchant_flags (
  merchant_key TEXT PRIMARY KEY,
  nature TEXT NOT NULL CHECK (nature IN ('constant', 'one_off')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
