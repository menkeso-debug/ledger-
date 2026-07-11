import { Router } from 'express';
import { q } from '../db/pool.js';
import { config } from '../config.js';
import { suggestBudgets } from '../advisor/budgets.js';
import { debtOverview, simulatePayoff } from '../analytics/debt.js';
import {
  categoryMoM, subcategoryMoM, netCashFlow, dailySpendSeries,
  accountSparkSeries, cardBalances, cashflowProjection, monthlyPnl,
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

// --- Household P&L (income vs spend by month) + runway -------------------------

apiRouter.get('/pnl', async (_req, res, next) => {
  try {
    const months = await monthlyPnl(6);
    const { rows: cash } = await q(
      `SELECT COALESCE(SUM(COALESCE(available_balance, current_balance)), 0)::float AS net_cash
       FROM accounts WHERE type = 'depository'`
    );
    const netCash = cash[0].net_cash;
    // Runway: cash ÷ average monthly burn over the last 3 FULL months.
    const full = months.filter((m) => !m.is_current).slice(-3);
    const avgNet = full.length ? full.reduce((s, m) => s + m.net, 0) / full.length : 0;
    const runwayMonths = avgNet < 0 && netCash > 0 ? +(netCash / -avgNet).toFixed(1) : null;
    res.json({
      months,
      netCash,
      avgMonthlyNet: Math.round(avgNet),
      runwayMonths, // null = not burning (or no cash data)
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

// --- Debt command center -------------------------------------------------------

// Manual card terms (Plaid Transactions doesn't expose APR/min payment)
apiRouter.put('/accounts/:id/terms', async (req, res, next) => {
  try {
    const { apr, min_payment } = req.body || {};
    const aprN = apr == null ? null : Number(apr);
    const minN = min_payment == null ? null : Number(min_payment);
    if (aprN != null && (Number.isNaN(aprN) || aprN < 0 || aprN > 100)) {
      return res.status(400).json({ error: 'apr must be 0-100' });
    }
    if (minN != null && (Number.isNaN(minN) || minN < 0)) {
      return res.status(400).json({ error: 'min_payment must be >= 0' });
    }
    const { rows } = await q(
      `UPDATE accounts SET apr = $2, min_payment = $3 WHERE id = $1
       RETURNING id, name, mask, apr::float, min_payment::float`,
      [req.params.id, aprN, minN]
    );
    if (!rows.length) return res.status(404).json({ error: 'account not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

apiRouter.get('/debt', async (req, res, next) => {
  try {
    const overview = await debtOverview();
    const budget = Number(req.query.budget) || null;
    const plan = budget ? simulatePayoff(overview.cards, budget) : null;
    // Comparison: minimum payments only — what avalanche + budget saves against
    let minOnly = null;
    if (plan?.feasible) {
      const mins = overview.cards.reduce(
        (s, c) => s + (c.min_payment ?? Math.max(35, c.balance * 0.01 + (c.balance * (c.apr ?? 24.99) / 100) / 12)),
        0
      );
      minOnly = simulatePayoff(overview.cards, Math.ceil(mins));
    }
    res.json({ ...overview, plan, minOnly });
  } catch (err) { next(err); }
});

// --- Net worth: manual assets + snapshots ---------------------------------------

apiRouter.get('/assets', async (_req, res, next) => {
  try {
    const { rows } = await q('SELECT id, name, value::float, updated_at FROM assets ORDER BY value DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

apiRouter.post('/assets', async (req, res, next) => {
  try {
    const { id, name, value } = req.body || {};
    const v = Number(value);
    if (!name || Number.isNaN(v)) return res.status(400).json({ error: 'name and numeric value required' });
    const { rows } = id
      ? await q('UPDATE assets SET name = $2, value = $3, updated_at = now() WHERE id = $1 RETURNING id, name, value::float', [id, name, v])
      : await q('INSERT INTO assets (name, value) VALUES ($1, $2) RETURNING id, name, value::float', [name, v]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

apiRouter.delete('/assets/:id', async (req, res, next) => {
  try {
    await q('DELETE FROM assets WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export async function computeNetWorth() {
  const { rows } = await q(
    `SELECT
      (SELECT COALESCE(SUM(COALESCE(available_balance, current_balance)), 0) FROM accounts WHERE type = 'depository')::float AS cash,
      (SELECT COALESCE(SUM(current_balance), 0) FROM accounts WHERE type = 'credit')::float AS card_debt,
      (SELECT COALESCE(SUM(value), 0) FROM assets)::float AS assets`
  );
  const { cash, card_debt, assets } = rows[0];
  return { cash, cardDebt: card_debt, assets, net: +(cash + assets - card_debt).toFixed(2) };
}

export async function snapshotNetWorth() {
  const nw = await computeNetWorth();
  await q(
    `INSERT INTO networth_snapshots (date, cash, card_debt, assets, net)
     VALUES (CURRENT_DATE, $1, $2, $3, $4)
     ON CONFLICT (date) DO UPDATE SET cash = $1, card_debt = $2, assets = $3, net = $4`,
    [nw.cash, nw.cardDebt, nw.assets, nw.net]
  );
  return nw;
}

apiRouter.get('/networth', async (_req, res, next) => {
  try {
    const now = await computeNetWorth();
    const { rows: series } = await q(
      `SELECT date, net::float FROM networth_snapshots
       WHERE date >= CURRENT_DATE - interval '180 days' ORDER BY date`
    );
    res.json({ ...now, series });
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
    // A refund is a property of one transaction, not of the merchant — a rule
    // would flip the merchant's regular purchases to Refunds too.
    const applyToMerchant = category === 'Refunds' ? false : apply_to_merchant;

    const { rows } = await q(
      `UPDATE transactions SET category = $2, subcategory = $3, updated_at = now()
       WHERE id = $1 RETURNING COALESCE(merchant_name, name) AS merchant`,
      [req.params.id, category, sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'transaction not found' });

    let retro = 0;
    if (applyToMerchant) {
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
const RESERVED_CATEGORIES = ['Income', 'Transfer', 'Business', 'Other', 'Refunds'];

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
      `SELECT t.id, t.account_id, t.date, COALESCE(t.merchant_name, t.name) AS merchant, t.name AS description,
              t.amount::float, t.category, t.subcategory, t.pending, a.name AS account_name, a.tier
       FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    // Fees and installment charges get traced back to what they're tied to,
    // so a "PLAN FEE - SAFEBOUND MOVI" row explains itself.
    for (const r of rows) {
      const desc = r.description || r.merchant || '';
      const planFee = desc.match(/^plan fee\s*[-–]\s*(.{4,})$/i);
      if (planFee) {
        const frag = planFee[1].trim().replace(/[%_]/g, '');
        const { rows: origin } = await q(
          `SELECT COALESCE(merchant_name, name) AS merchant, SUM(amount)::float AS total,
                  MIN(date) AS first_date, COUNT(*)::int AS n
           FROM transactions
           WHERE account_id = $1 AND NOT removed AND amount >= 100
             AND (merchant_name ILIKE $2 OR name ILIKE $2)
           GROUP BY 1 ORDER BY total DESC LIMIT 1`,
          [r.account_id, `${frag}%`]
        );
        if (origin.length) {
          r.linked = {
            kind: 'plan_fee',
            merchant: origin[0].merchant,
            total: origin[0].total,
            first_date: origin[0].first_date,
            note: `Installment plan fee (My Chase Plan) for ${origin[0].merchant}`,
          };
        } else {
          r.linked = { kind: 'plan_fee', note: `Installment plan fee for "${frag}"` };
        }
      } else if (/purchase interest charge|interest charged/i.test(desc)) {
        r.linked = { kind: 'interest', note: `Interest on carried balance — ${r.account_name}` };
      } else if (/annual (membership )?fee/i.test(desc)) {
        r.linked = { kind: 'annual_fee', note: `Card annual fee — ${r.account_name}` };
      } else if (/late fee/i.test(desc)) {
        r.linked = { kind: 'late_fee', note: `Late payment fee — ${r.account_name}` };
      }
      delete r.account_id;
    }
    res.json(rows);
  } catch (err) { next(err); }
});
