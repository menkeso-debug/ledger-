import { Router } from 'express';
import { q } from '../db/pool.js';
import { config } from '../config.js';
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
      q(`SELECT id, name, type, subtype, tier, mask, current_balance::float, available_balance::float
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
    const spent = mom
      .filter((c) => !['Income', 'Transfer'].includes(c.category))
      .reduce((s, c) => s + c.current_spend, 0);

    const topCats = mom
      .filter((c) => !['Income', 'Transfer'].includes(c.category))
      .slice(0, 4)
      .map((c) => ({ name: c.category, spend: c.current_spend, momPct: c.mom_pct }));
    const maxCat = Math.max(...topCats.map((c) => c.spend), 1);

    res.json({
      netCash,
      netCashChange: { amount: flow.net, pct: netCash - flow.net > 0 ? +((flow.net / (netCash - flow.net)) * 100).toFixed(1) : null },
      cardBalancesOwed: owed,
      statementsDue: owed, // Plaid Transactions doesn't expose statement due dates; total owed shown
      spent: { total: spent, budget: config.monthlyBudget },
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
    const cats = mom.filter((c) => !['Income', 'Transfer'].includes(c.category));
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
