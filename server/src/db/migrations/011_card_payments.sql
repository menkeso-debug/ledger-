-- Plaid files card payments under LOAN_PAYMENTS; relabel stored rows as card
-- payments. The user has no loans — every Transfer/"Loan payments" row is a
-- payment toward a credit card. Future real loans still map to Loan payments
-- via the primary PFC fallback; card payments now hit the detailed mapping.

UPDATE transactions
SET subcategory = 'Card payment', updated_at = now()
WHERE category = 'Transfer' AND subcategory = 'Loan payments';
