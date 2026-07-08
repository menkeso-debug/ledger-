-- Manual-import accounts: ledger-sum balances miss anything before the export
-- window (and installment plans). A constant per-account offset corrects it:
-- balance = SUM(transactions) + balance_offset.
ALTER TABLE accounts ADD COLUMN balance_offset NUMERIC(14,2) NOT NULL DEFAULT 0;
