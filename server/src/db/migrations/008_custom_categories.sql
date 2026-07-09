-- User-created category names (available in pickers before any transaction uses them).
CREATE TABLE custom_categories (
  name TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
