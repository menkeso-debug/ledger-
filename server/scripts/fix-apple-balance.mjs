// One-time: anchor the Apple Card balance to the Jun 2026 statement.
// Ledger sum (imported CSV window) was $11,643.09; true balance incl. July
// activity and installments is $7,811.71 → constant offset -3,831.38.
// Future CSV imports compute balance = SUM(transactions) + balance_offset.
import { migrate } from '../src/db/migrate.js';
import { q, pool } from '../src/db/pool.js';

await migrate(); // ensures the balance_offset column exists
const { rows } = await q(
  `UPDATE accounts
   SET balance_offset = -3831.38,
       current_balance = 7811.71,
       balances_updated_at = now()
   WHERE plaid_account_id = 'manual-apple-card'
   RETURNING name, current_balance::float AS balance, balance_offset::float AS offset`
);
console.log(rows[0] || 'Apple Card account not found');
await pool.end();
