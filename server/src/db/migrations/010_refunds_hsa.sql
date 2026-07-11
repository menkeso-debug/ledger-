-- Refunds becomes a first-class category (always offered in the picker even
-- with zero transactions), and HSA/FSA reimbursements get their own Income
-- subcategory. The matching merchant rule in categories.js covers new syncs;
-- this fixes rows already stored.

INSERT INTO custom_categories (name) VALUES ('Refunds') ON CONFLICT DO NOTHING;

UPDATE transactions
SET category = 'Income', subcategory = 'HSA / FSA', updated_at = now()
WHERE COALESCE(merchant_name, name) ILIKE '%employee benefit%'
  AND amount < 0
  AND category IN ('Income', 'Transfer', 'Other');
