import { plaid } from './client.js';
import { q } from '../db/pool.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { log } from '../lib/log.js';
import { categorize, matchTier } from '../categories.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Link + token exchange
// ---------------------------------------------------------------------------

export async function createLinkToken() {
  const req = {
    user: { client_user_id: 'ledger-single-user' },
    client_name: 'Ledger',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
    transactions: { days_requested: 730 }, // 24-month backfill for baselines
  };
  if (config.plaid.webhookUrl) req.webhook = config.plaid.webhookUrl;
  if (config.plaid.redirectUri) req.redirect_uri = config.plaid.redirectUri;
  const { data } = await plaid().linkTokenCreate(req);
  return data; // { link_token, expiration }
}

export async function exchangePublicToken(publicToken) {
  const { data } = await plaid().itemPublicTokenExchange({ public_token: publicToken });
  const accessToken = data.access_token;
  const itemId = data.item_id;

  // Institution metadata
  let institutionId = null;
  let institutionName = null;
  try {
    const { data: itemData } = await plaid().itemGet({ access_token: accessToken });
    institutionId = itemData.item.institution_id || null;
    if (institutionId) {
      const { data: inst } = await plaid().institutionsGetById({
        institution_id: institutionId,
        country_codes: ['US'],
      });
      institutionName = inst.institution.name;
    }
  } catch (err) {
    log.warn('institution lookup failed', err);
  }

  const { rows } = await q(
    `INSERT INTO plaid_items (plaid_item_id, institution_id, institution_name, access_token_enc)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (plaid_item_id) DO UPDATE
       SET access_token_enc = EXCLUDED.access_token_enc,
           institution_id = EXCLUDED.institution_id,
           institution_name = EXCLUDED.institution_name,
           status = 'active', last_error = NULL
     RETURNING id`,
    [itemId, institutionId, institutionName, encrypt(accessToken)]
  );
  const item = { id: rows[0].id, plaid_item_id: itemId };

  await refreshAccounts(item.id, accessToken);
  // Initial sync kicks off the historical backfill; Plaid will also fire
  // SYNC_UPDATES_AVAILABLE webhooks as more history lands.
  await syncItem(item.id).catch((err) => log.error('initial sync failed', err));
  return item;
}

// ---------------------------------------------------------------------------
// Accounts + balances
// ---------------------------------------------------------------------------

async function getAccessToken(itemUuid) {
  const { rows } = await q('SELECT access_token_enc FROM plaid_items WHERE id = $1', [itemUuid]);
  if (!rows.length) throw new Error(`unknown item ${itemUuid}`);
  return decrypt(rows[0].access_token_enc);
}

export async function refreshAccounts(itemUuid, accessToken = null) {
  const token = accessToken || (await getAccessToken(itemUuid));
  const { data } = await plaid().accountsBalanceGet({ access_token: token });
  for (const a of data.accounts) {
    const tier = matchTier({
      name: a.name,
      officialName: a.official_name,
      subtype: a.subtype,
      type: a.type,
    });
    await q(
      `INSERT INTO accounts (item_id, plaid_account_id, name, official_name, mask, type, subtype, tier,
                             current_balance, available_balance, credit_limit, iso_currency_code, balances_updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (plaid_account_id) DO UPDATE SET
         name = EXCLUDED.name, official_name = EXCLUDED.official_name, mask = EXCLUDED.mask,
         type = EXCLUDED.type, subtype = EXCLUDED.subtype, tier = EXCLUDED.tier,
         current_balance = EXCLUDED.current_balance, available_balance = EXCLUDED.available_balance,
         credit_limit = EXCLUDED.credit_limit, balances_updated_at = now()`,
      [
        itemUuid, a.account_id, a.name, a.official_name, a.mask, a.type, a.subtype, tier,
        a.balances.current, a.balances.available, a.balances.limit, a.balances.iso_currency_code || 'USD',
      ]
    );
  }
  return data.accounts.length;
}

// ---------------------------------------------------------------------------
// /transactions/sync — cursor per item
// ---------------------------------------------------------------------------

async function upsertTransaction(t, accountIdByPlaidId) {
  const accountId = accountIdByPlaidId.get(t.account_id);
  if (!accountId) return; // account not tracked (shouldn't happen)
  const { category, subcategory } = categorize({
    merchantName: t.merchant_name,
    name: t.name,
    pfcPrimary: t.personal_finance_category?.primary,
    pfcDetailed: t.personal_finance_category?.detailed,
  });
  await q(
    `INSERT INTO transactions (account_id, plaid_transaction_id, pending_transaction_id, date, authorized_date,
                               name, merchant_name, amount, iso_currency_code, pending, payment_channel,
                               pfc_primary, pfc_detailed, category, subcategory)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (plaid_transaction_id) DO UPDATE SET
       date = EXCLUDED.date, authorized_date = EXCLUDED.authorized_date,
       name = EXCLUDED.name, merchant_name = EXCLUDED.merchant_name,
       amount = EXCLUDED.amount, pending = EXCLUDED.pending,
       payment_channel = EXCLUDED.payment_channel,
       pfc_primary = EXCLUDED.pfc_primary, pfc_detailed = EXCLUDED.pfc_detailed,
       category = EXCLUDED.category, subcategory = EXCLUDED.subcategory,
       removed = false, updated_at = now()`,
    [
      accountId, t.transaction_id, t.pending_transaction_id, t.date, t.authorized_date,
      t.name, t.merchant_name, t.amount, t.iso_currency_code || 'USD', t.pending, t.payment_channel,
      t.personal_finance_category?.primary || null, t.personal_finance_category?.detailed || null,
      category, subcategory,
    ]
  );
  // A posted transaction replaces its pending twin; soft-remove the pending row.
  if (t.pending_transaction_id) {
    await q(
      `UPDATE transactions SET removed = true, updated_at = now()
       WHERE plaid_transaction_id = $1`,
      [t.pending_transaction_id]
    );
  }
}

export async function syncItem(itemUuid) {
  const token = await getAccessToken(itemUuid);
  const { rows } = await q('SELECT transactions_cursor FROM plaid_items WHERE id = $1', [itemUuid]);
  let cursor = rows[0]?.transactions_cursor || undefined;

  const { rows: accountRows } = await q(
    'SELECT id, plaid_account_id FROM accounts WHERE item_id = $1',
    [itemUuid]
  );
  const accountIdByPlaidId = new Map(accountRows.map((r) => [r.plaid_account_id, r.id]));

  let added = 0, modified = 0, removed = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await plaid().transactionsSync({
      access_token: token,
      cursor,
      count: 500,
    });

    // New accounts can appear mid-stream (e.g. after item add); refresh mapping if needed.
    const unknown = [...data.added, ...data.modified].some((t) => !accountIdByPlaidId.has(t.account_id));
    if (unknown) {
      await refreshAccounts(itemUuid, token);
      const { rows: fresh } = await q('SELECT id, plaid_account_id FROM accounts WHERE item_id = $1', [itemUuid]);
      accountIdByPlaidId.clear();
      for (const r of fresh) accountIdByPlaidId.set(r.plaid_account_id, r.id);
    }

    for (const t of data.added) { await upsertTransaction(t, accountIdByPlaidId); added++; }
    for (const t of data.modified) { await upsertTransaction(t, accountIdByPlaidId); modified++; }
    for (const r of data.removed) {
      await q(
        'UPDATE transactions SET removed = true, updated_at = now() WHERE plaid_transaction_id = $1',
        [r.transaction_id]
      );
      removed++;
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
    // Persist cursor after each page so a crash never re-processes from scratch.
    await q('UPDATE plaid_items SET transactions_cursor = $1 WHERE id = $2', [cursor, itemUuid]);
  }

  await q(
    `UPDATE plaid_items SET last_synced_at = now(), status = 'active', last_error = NULL WHERE id = $1`,
    [itemUuid]
  );
  await refreshAccounts(itemUuid, token);
  log.info('item synced', { itemUuid, added, modified, removed });
  return { added, modified, removed };
}

export async function syncItemByPlaidId(plaidItemId) {
  const { rows } = await q('SELECT id FROM plaid_items WHERE plaid_item_id = $1', [plaidItemId]);
  if (!rows.length) {
    log.warn('webhook for unknown item', { plaidItemId });
    return null;
  }
  return syncItem(rows[0].id);
}

export async function syncAllItems() {
  const { rows } = await q(`SELECT id FROM plaid_items WHERE status NOT IN ('login_required', 'manual')`);
  const results = [];
  for (const r of rows) {
    try {
      results.push(await syncItem(r.id));
    } catch (err) {
      const code = err?.response?.data?.error_code;
      if (code === 'ITEM_LOGIN_REQUIRED') {
        await q(`UPDATE plaid_items SET status = 'login_required', last_error = $2 WHERE id = $1`, [r.id, code]);
      } else {
        await q(`UPDATE plaid_items SET status = 'error', last_error = $2 WHERE id = $1`, [r.id, code || String(err.message)]);
      }
      log.error('sync failed for item', { itemId: r.id, code });
    }
  }
  return results;
}
