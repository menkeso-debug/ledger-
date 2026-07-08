import crypto from 'node:crypto';
import { Router } from 'express';
import { q } from '../db/pool.js';
import { encrypt } from '../lib/crypto.js';
import { log } from '../lib/log.js';
import { computeInsights } from '../analytics/engine.js';
import { loadCategoryOverrides } from '../plaid/sync.js';
import { merchantKey } from '../categories.js';

export const importRouter = Router();

// Minimal CSV parser handling quoted fields and embedded commas/newlines.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row); }
  return rows;
}

// Apple Card statement categories → Ledger taxonomy.
const APPLE_CATEGORY_MAP = {
  'restaurants': ['Dining', 'Restaurants'],
  'grocery': ['Groceries', 'Groceries'],
  'shopping': ['Shopping', 'Other'],
  'transportation': ['Transport', 'Other'],
  'travel': ['Travel', 'Other travel'],
  'entertainment': ['Subscriptions', 'Entertainment'],
  'health': ['Health', 'Medical'],
  'gas': ['Transport', 'Gas'],
  'hotels': ['Travel', 'Hotels'],
  'airlines': ['Travel', 'Flights'],
  'other': ['Other', 'Uncategorized'],
};

function mapAppleCategory(raw) {
  const key = (raw || '').trim().toLowerCase();
  return APPLE_CATEGORY_MAP[key] || ['Other', 'Uncategorized'];
}

function parseUsDate(s) {
  // Apple exports MM/DD/YYYY
  const m = (s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

async function ensureAppleAccount() {
  const { rows: existing } = await q(
    `SELECT id FROM accounts WHERE plaid_account_id = 'manual-apple-card'`
  );
  if (existing.length) return existing[0].id;
  const { rows: [item] } = await q(
    `INSERT INTO plaid_items (plaid_item_id, institution_name, access_token_enc, status)
     VALUES ('manual-apple-card', 'Apple Card (CSV import)', $1, 'manual')
     ON CONFLICT (plaid_item_id) DO UPDATE SET institution_name = EXCLUDED.institution_name
     RETURNING id`,
    [encrypt('manual-import-no-token')]
  );
  const { rows: [acct] } = await q(
    `INSERT INTO accounts (item_id, plaid_account_id, name, official_name, type, subtype, tier)
     VALUES ($1, 'manual-apple-card', 'Apple Card', 'Apple Card', 'credit', 'credit card', 'apple')
     RETURNING id`,
    [item.id]
  );
  return acct.id;
}

// POST /api/import/apple-card  body: { csv: "<statement export text>" }
// Idempotent: rows are keyed by a content hash, so re-uploading a statement
// (or overlapping months) never duplicates.
importRouter.post('/apple-card', async (req, res, next) => {
  try {
    const { csv } = req.body || {};
    if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv text required' });

    const rows = parseCsv(csv);
    if (rows.length < 2) return res.status(400).json({ error: 'no data rows found in CSV' });

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name) => header.findIndex((h) => h.includes(name));
    const iDate = col('transaction date');
    const iDesc = col('description');
    const iMerchant = col('merchant');
    const iCategory = col('category');
    const iType = col('type');
    const iAmount = col('amount');
    if (iDate < 0 || iAmount < 0) {
      return res.status(400).json({ error: 'not an Apple Card export (need "Transaction Date" and "Amount (USD)" columns)' });
    }

    const accountId = await ensureAppleAccount();
    const overrides = await loadCategoryOverrides();
    let inserted = 0, skipped = 0, failed = 0;

    for (const r of rows.slice(1)) {
      const date = parseUsDate(r[iDate]);
      const rawAmount = parseFloat((r[iAmount] || '').replace(/[$,]/g, ''));
      if (!date || Number.isNaN(rawAmount)) { failed++; continue; }
      const type = (iType >= 0 ? r[iType] : '').trim().toLowerCase();
      const merchant = ((iMerchant >= 0 && r[iMerchant]) || (iDesc >= 0 && r[iDesc]) || 'Apple Card').trim();
      const description = ((iDesc >= 0 && r[iDesc]) || merchant).trim();
      const isPayment = type.includes('payment');
      // Ledger/Plaid convention: positive = money out. Purchases are outflows;
      // payments to the card are inflows (and categorized Transfer).
      const amount = isPayment ? -Math.abs(rawAmount) : Math.abs(rawAmount);
      const override = !isPayment && overrides.get(merchantKey(merchant, description));
      const [category, subcategory] = isPayment
        ? ['Transfer', 'Card payment']
        : override
          ? [override.category, override.subcategory || 'Other']
          : mapAppleCategory(iCategory >= 0 ? r[iCategory] : '');

      const hash = crypto.createHash('sha256')
        .update(`${date}|${merchant}|${description}|${rawAmount}|${type}`)
        .digest('hex').slice(0, 32);

      const result = await q(
        `INSERT INTO transactions (account_id, plaid_transaction_id, date, name, merchant_name,
                                   amount, category, subcategory, pending)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
         ON CONFLICT (plaid_transaction_id) DO NOTHING`,
        [accountId, `apple-${hash}`, date, description, merchant, amount, category, subcategory]
      );
      if (result.rowCount) inserted++; else skipped++;
    }

    // Balance owed = imported ledger sum + manual offset (covers pre-window
    // balance and installment plans the export never shows).
    await q(
      `UPDATE accounts SET current_balance = (
         SELECT COALESCE(SUM(amount), 0) FROM transactions
         WHERE account_id = $1 AND NOT removed
       ) + balance_offset, balances_updated_at = now()
       WHERE id = $1`,
      [accountId]
    );

    computeInsights().catch((err) => log.error('insights after import failed', err));
    log.info('apple card import', { inserted, skipped, failed });
    res.json({ ok: true, inserted, skipped, failed });
  } catch (err) { next(err); }
});
