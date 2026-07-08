-- User recategorizations: merchant-level rules that stick. Applied at sync time
-- for new transactions and retroactively when created.
CREATE TABLE category_overrides (
  merchant_key TEXT PRIMARY KEY,   -- lower-cased merchant name
  category TEXT NOT NULL,
  subcategory TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
