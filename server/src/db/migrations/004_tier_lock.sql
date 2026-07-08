-- Manual tier assignment for accounts whose institution returns generic names
-- (Chase returns "CREDIT CARD"). Locked tiers survive sync re-derivation.
ALTER TABLE accounts ADD COLUMN tier_locked BOOLEAN NOT NULL DEFAULT false;
