-- Constant merchants can carry a user-declared monthly amount, used verbatim
-- by the projection when transaction history under-represents the true cost
-- (e.g. daycare billed under multiple descriptors).
ALTER TABLE merchant_flags ADD COLUMN monthly_amount NUMERIC(12,2);
