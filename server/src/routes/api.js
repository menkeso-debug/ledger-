import { Router } from 'express';
import { q } from '../db/pool.js';
import { config } from '../config.js';
import { suggestBudgets } from '../advisor/budgets.js';
import {
  categoryMoM, subcategoryMoM, netCashFlow, dailySpendSeries,
  accountSparkSeries, cardBalances, cashflowProjection,
} from '../analytics/rollups.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ ok: true }));

// --- Overview ---------------------------------------------------------------

apiRouter.get('/overview', async (_req, res, next) => {
  try {
    const [accounts, flow, owed, series, mom, insight] = await Promise.all([
      q(`SELECT id, name, type, subtype, tier, mask, current_balance::float, available_balance::float,
                credit_limit::float
         FROM accounts ORDER BY type DESC, name`).then((r) => r.rows),
      netCashFlow(),
      cardBalances(),
      dailySpendSeries(),
      categoryMoM(),
      q(`SELECT id, kind, tone, tag, title, body, impact, impact_sub, cta, data, created_at
         FROM insights WHERE NOT dismissed ORDER BY updated_at DESC LIMIT 1`).then((r) => r.rows[0] || null),
    ]);

    const checking = accounts.filter((a) => a.type === 'depository');
    const netCash = checking.reduce((s, a) => s + (a.available_balance ?? a.current_balance ?? 0), 0);
    const { rows: budgetSum } = await q('SELECT COALESCE(SUM(monthly_budget), 0)::float AS total FROM budgets');
    const totalBudget = budgetSum[0].total > 0 ? budgetSum[0].total : config.monthlyBudget;
    const spent = mom
      .filter((c) => !['Income', 'Transfer', 'Business'].includes(c.category))
      .reduce((s, c) => s + c.current_spend, 0);

    const topCats = mom
      .filter((c) => !['Income', 'Transfer', 'Business'].includes(c.category))
      .slice(0, 4)
      .map((c) => ({ name: c.category, spend: c.current_spend, momPct: c.mom_pct }));
    const maxCat = Math.max(...topCats.map((c) => c.spend), 1);

    const cards = accounts.filter((a) => a.type === 'credit');
    // Utilization only over cards that report a limit (Amex charge cards and
    // manual imports have none — including their balances would overstate).
    const limited = cards.filter((a) => a.credit_limit > 0);
    const totalLimit = limited.reduce((s, a) => s + a.credit_limit, 0);
    const owedOnLimited = limited.reduce((s, a) => s + (a.current_balance || 0), 0);
    res.json({
      netCash,
      netCashChange: { amount: flow.net, pct: netCash - flow.net > 0 ? +((flow.net / (netCash - flow.net)) * 100).toFixed(1) : null },
      cardBalancesOwed: owed,
      cardCount: cards.length,
      creditUtilization: totalLimit > 0
        ? { pct: Math.round((owedOnLimited / totalLimit) * 100), limit: totalLimit }
        : null,
      statementsDue: owed, // legacy field
      spent: { total: spent, budget: totalBudget },
      spendSeries: series,
      topCategories: topCats.map((c) => ({ ...c, pct: Math.round((c.spend / maxCat) * 100) })),
      heroInsight: insight,
      accountCount: accounts.length,
      hasData: accounts.length > 0,
    });
  } catch (err) { next(err); }
});

// --- 30-day cash flow projection ---------------------------------------------

apiRouter.get('/cashflow', async (_req, res, next) => {
  try {
    res.json(await cashflowProjection());
  } catch (err) { next(err); }
});

// --- Accounts ---------------------------------------------------------------

apiRouter.get('/accounts', async (_req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT a.id, a.name, a.official_name, a.type, a.subtype, a.tier, a.mask,
              a.current_balance::float, a.available_balance::float, a.credit_limit::float,
              i.institution_name, a.balances_updated_at
       FROM accounts a JOIN plaid_items i ON i.id = a.item_id
       ORDER BY a.type = 'depository', a.name`
    );
    const sparks = await accountSparkSeries();
    res.json(rows.map((a) => ({ ...a, spark: sparks[a.id] || { series: [], up: false } })));
  } catch (err) { next(err); }
});

// Manually pin an account's card tier (survives syncs). Body: { tier }
const VALID_TIERS = ['plat', 'gold', 'delta', 'csr', 'prime', 'cpc', 'capone', 'apple', 'other'];
apiRouter.put('/accounts/:id/tier', async (req, res, next) => {
  try {
    const { tier } = req.body || {};
    if (!VALID_TIERS.includes(tier)) {
      return res.status(400).json({ error: `tier must be one of ${VALID_TIERS.join(', ')}` });
    }
    const { rows } = await q(
      `UPDATE accounts SET tier = $2, tier_locked = true WHERE id = $1
       RETURNING id, name, mask, tier`,
      [req.params.id, tier]
    );
    if (!rows.length) return res.status(404).json({ error: 'account not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// --- Categories tree ---------------------------------------------------------

apiRouter.get('/categories', async (_req, res, next) => {
  try {
    const [mom, budgets] = await Promise.all([
      categoryMoM(),
      q('SELECT category, monthly_budget::float AS budget FROM budgets').then(
        (r) => new Map(r.rows.map((x) => [x.category, x.budget]))
      ),
    ]);
    const cats = mom.filter((c) => !['Income', 'Transfer', 'Business'].includes(c.category));
    const out = [];
    for (const c of cats) {
      const subs = await subcategoryMoM(c.category);
      out.push({
        name: c.category,
        spend: c.current_spend,
        budget: budgets.get(c.category) ?? null,
        momPct: c.mom_pct,
        subs: subs
          .filter((s) => s.current_spend > 0 || s.prev_spend > 0)
          .map((s) => ({ name: s.subcategory, spend: s.current_spend, momPct: s.mom_pct })),
      });
    }
    res.json(out);
  } catch (err) { next(err); }
});

// --- Recategorization -------------------------------------------------------
// Sets the category for one transaction, and (default) saves a merchant rule so
// every past and future transaction from that merchant follows it.

apiRouter.patch('/transactions/:id/category', async (req, res, next) => {
  try {
    const { category, subcategory, apply_to_merchant = true } = req.body || {};
    if (!category) return res.status(400).json({ error: 'category required' });
    const sub = subcategory || 'Other';

    const { rows } = await q(
      `UPDATE transactions SET category = $2, subcategory = $3, updated_at = now()
       WHERE id = $1 RETURNING COALESCE(merchant_name, name) AS merchant`,
      [req.params.id, category, sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'transaction not found' });

    let retro = 0;
    if (apply_to_merchant) {
      const key = rows[0].merchant.trim().toLowerCase();
      await q(
        `INSERT INTO category_overrides (merchant_key, category, subcategory)
         VALUES ($1, $2, $3)
         ON CONFLICT (merchant_key) DO UPDATE SET category = EXCLUDED.category, subcategory = EXCLUDED.subcategory`,
        [key, category, sub]
      );
      const r = await q(
        `UPDATE transactions SET category = $2, subcategory = $3, updated_at = now()
         WHERE lower(COALESCE(merchant_name, name)) = $1`,
        [key, category, sub]
      );
      retro = r.rowCount;
    }
    res.json({ ok: true, merchant: rows[0].merchant, category, subcategory: sub, retroactively_updated: retro });
  } catch (err) { next(err); }
});

// --- Category names: list, create, rename -------------------------------------
// Income/Transfer/Business are load-bearing (excluded from spend math) and
// Other is the classifier fallback — those four can't be renamed.
const RESERVED_CATEGORIES = ['Income', 'Transfer', 'Business', 'Other'];

apiRouter.get('/category-names', async (_req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT name FROM (
         SELECT DISTINCT category AS name FROM transactions WHERE category IS NOT NULL
         UNION SELECT category FROM budgets
         UNION SELECT name FROM custom_categories
       ) u ORDER BY name`
    );
    res.json(rows.map((r) => r.name));
  } catch (err) { next(err); }
});

apiRouter.post('/category-names', async (req, res, next) => {
  try {
    const name = (req.body?.name || '').trim();
    if (!name || name.length > 40) return res.status(400).json({ error: 'name required (max 40 chars)' });
    await q('INSERT INTO custom_categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
    res.json({ ok: true, name });
  } catch (err) { next(err); }
});

apiRouter.post('/category-names/rename', async (req, res, next) => {
  try {
    const from = (req.body?.from || '').trim();
    const to = (req.body?.to || '').trim();
    if (!from || !to || to.length > 40) return res.status(400).json({ error: 'from and to required (to max 40 chars)' });
    if (RESERVED_CATEGORIES.includes(from)) {
      return res.status(400).json({ error: `"${from}" is reserved and can't be renamed` });
    }
    const tx = await q(
      `UPDATE transactions SET category = $2, updated_at = now() WHERE category = $1`,
      [from, to]
    );
    await q('UPDATE category_overrides SET category = $2 WHERE category = $1', [from, to]);
    // Budgets: move, or merge into an existing target budget
    const { rows: toBudget } = await q('SELECT 1 FROM budgets WHERE category = $1', [to]);
    if (toBudget.length) await q('DELETE FROM budgets WHERE category = $1', [from]);
    else await q('UPDATE budgets SET category = $2 WHERE category = $1', [from, to]);
    await q('DELETE FROM custom_categories WHERE name = $1', [from]);
    await q('INSERT INTO custom_categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [to]);
    res.json({ ok: true, from, to, transactions_moved: tx.rowCount });
  } catch (err) { next(err); }
});

// --- Merchant spend nature (constant vs one-off, used by projection) ---------

apiRouter.put('/merchants/flag', async (req, res, next) => {
  try {
    const { merchant, nature, monthly_amount } = req.body || {};
    if (!merchant) return res.status(400).json({ error: 'merchant required' });
    const key = merchant.trim().toLowerCase();
    if (nature == null) {
      await q('DELETE FROM merchant_flags WHERE merchant_key = $1', [key]);
      return res.json({ ok: true, merchant, nature: null });
    }
    if (!['constant', 'one_off'].includes(nature)) {
      return res.status(400).json({ error: "nature must be 'constant', 'one_off', or null" });
    }
    const amount = nature === 'constant' && monthly_amount != null ? Number(monthly_amount) : null;
    if (amount != null && (Number.isNaN(amount) || amount < 0)) {
      return res.status(400).json({ error: 'monthly_amount must be a non-negative number' });
    }
    await q(
      `INSERT INTO merchant_flags (merchant_key, nature, monthly_amount) VALUES ($1, $2, $3)
       ON CONFLICT (merchant_key) DO UPDATE SET nature = EXCLUDED.nature, monthly_amount = EXCLUDED.monthly_amount`,
      [key, nature, amount]
    );
    res.json({ ok: true, merchant, nature, monthly_amount: amount });
  } catch (err) { next(err); }
});

// --- Budgets -------------------------------------------------------------------

apiRouter.get('/budgets', async (_req, res, next) => {
  try {
    const { rows } = await q('SELECT category, monthly_budget::float AS monthly_budget FROM budgets ORDER BY category');
    res.json(rows);
  } catch (err) { next(err); }
});

// Set (or clear with null) a single category budget.
apiRouter.put('/budgets', async (req, res, next) => {
  try {
    const { category, monthly_budget } = req.body || {};
    if (!category) return res.status(400).json({ error: 'category required' });
    if (monthly_budget == null) {
      await q('DELETE FROM budgets WHERE category = $1', [category]);
      return res.json({ ok: true, category, monthly_budget: null });
    }
    const n = Number(monthly_budget);
    if (Number.isNaN(n) || n < 0) return res.status(400).json({ error: 'monthly_budget must be a non-negative number' });
    const { rows } = await q(
      `INSERT INTO budgets (category, monthly_budget) VALUES ($1, $2)
       ON CONFLICT (category) DO UPDATE SET monthly_budget = EXCLUDED.monthly_budget
       RETURNING category, monthly_budget::float AS monthly_budget`,
      [category, n]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Replace the full budget set (used by "apply suggestions").
apiRouter.post('/budgets/apply', async (req, res, next) => {
  try {
    const { budgets } = req.body || {};
    if (!Array.isArray(budgets) || !budgets.length) return res.status(400).json({ error: 'budgets array required' });
    for (const b of budgets) {
      if (!b.category || Number.isNaN(Number(b.monthly_budget))) {
        return res.status(400).json({ error: 'each budget needs category + numeric monthly_budget' });
      }
    }
    await q('DELETE FROM budgets');
    for (const b of budgets) {
      await q('INSERT INTO budgets (category, monthly_budget) VALUES ($1, $2)', [b.category, Math.round(Number(b.monthly_budget))]);
    }
    res.json({ ok: true, count: budgets.length });
  } catch (err) { next(err); }
});

// AI budget proposal from real income + spending behavior (does not apply).
apiRouter.post('/budgets/suggest', async (_req, res, next) => {
  try {
    res.json(await suggestBudgets());
  } catch (err) { next(err); }
});

// --- Insights feed ------------------------------------------------------------

apiRouter.get('/insights', async (_req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT id, kind, tone, tag, title, body, impact, impact_sub, cta, data, updated_at, created_at
       FROM insights WHERE NOT dismissed
       ORDER BY CASE tone WHEN 'neg' THEN 0 WHEN 'amber' THEN 1 WHEN 'accent' THEN 2 ELSE 3 END,
                updated_at DESC
       LIMIT 30`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

apiRouter.post('/insights/:id/dismiss', async (req, res, next) => {
  try {
    await q('UPDATE insights SET dismissed = true, updated_at = now() WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// --- Transactions ---------------------------------------------------------------

apiRouter.get('/transactions', async (req, res, next) => {
  try {
    const { query, category, subcategory, account_id, month, limit } = req.query;
    const params = [];
    const where = ['NOT t.removed'];
    if (query) { params.push(`%${query}%`); where.push(`(t.merchant_name ILIKE $${params.length} OR t.name ILIKE $${params.length})`); }
    if (category) { params.push(category); where.push(`t.category = $${params.length}`); }
    if (subcategory) { params.push(subcategory); where.push(`t.subcategory = $${params.length}`); }
    if (account_id) { params.push(account_id); where.push(`t.account_id = $${params.length}`); }
    if (month) { params.push(`${month}-01`); where.push(`t.date >= $${params.length}::date AND t.date < ($${params.length}::date + interval '1 month')`); }
    params.push(Math.min(Number(limit) || 100, 500));
    const { rows } = await q(
      `SELECT t.id, t.date, COALESCE(t.merchant_name, t.name) AS merchant, t.name AS description,
              t.amount::float, t.category, t.subcategory, t.pending, a.name AS account_name, a.tier
       FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});
