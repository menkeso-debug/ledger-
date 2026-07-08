import { q } from '../db/pool.js';

// All "spend" rollups: outflows (amount > 0), excluding transfers/income/card payments,
// excluding removed rows. Plaid convention: positive amount = money out.

const SPEND_FILTER = `NOT t.removed AND t.amount > 0 AND t.category NOT IN ('Income','Transfer')`;

export function monthStart(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function prevMonthStart(d = new Date()) {
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return monthStart(p);
}

// --- Category rollups ------------------------------------------------------

export async function categorySpendForMonth(monthStartDate) {
  const { rows } = await q(
    `SELECT t.category, t.subcategory, SUM(t.amount)::float AS spend, COUNT(*)::int AS n
     FROM transactions t
     WHERE ${SPEND_FILTER}
       AND t.date >= $1::date AND t.date < ($1::date + interval '1 month')
     GROUP BY t.category, t.subcategory
     ORDER BY t.category, spend DESC`,
    [monthStartDate]
  );
  return rows;
}

// Month-over-month per category, comparing month-to-date against the same
// day-span of the previous month (fair MoM mid-month).
export async function categoryMoM() {
  const { rows } = await q(
    `WITH bounds AS (
       SELECT date_trunc('month', CURRENT_DATE)::date AS cur_start,
              (date_trunc('month', CURRENT_DATE) - interval '1 month')::date AS prev_start,
              (CURRENT_DATE - date_trunc('month', CURRENT_DATE)::date) AS day_offset
     ),
     cur AS (
       SELECT t.category, SUM(t.amount)::float AS spend
       FROM transactions t, bounds b
       WHERE ${SPEND_FILTER} AND t.date >= b.cur_start AND t.date <= CURRENT_DATE
       GROUP BY t.category
     ),
     prev AS (
       SELECT t.category, SUM(t.amount)::float AS spend
       FROM transactions t, bounds b
       WHERE ${SPEND_FILTER} AND t.date >= b.prev_start AND t.date <= b.prev_start + b.day_offset
       GROUP BY t.category
     ),
     prev_full AS (
       SELECT t.category, SUM(t.amount)::float AS spend
       FROM transactions t, bounds b
       WHERE ${SPEND_FILTER} AND t.date >= b.prev_start
         AND t.date < (b.prev_start + interval '1 month')
       GROUP BY t.category
     )
     SELECT COALESCE(c.category, p.category) AS category,
            COALESCE(c.spend, 0) AS current_spend,
            COALESCE(p.spend, 0) AS prev_same_span,
            COALESCE(pf.spend, 0) AS prev_full_month,
            CASE WHEN COALESCE(p.spend,0) > 0
                 THEN ROUND(((COALESCE(c.spend,0) - p.spend) / p.spend * 100)::numeric)::int
                 ELSE NULL END AS mom_pct
     FROM cur c
     FULL OUTER JOIN prev p ON p.category = c.category
     LEFT JOIN prev_full pf ON pf.category = COALESCE(c.category, p.category)
     ORDER BY current_spend DESC`
  );
  return rows;
}

export async function subcategoryMoM(category) {
  const { rows } = await q(
    `WITH bounds AS (
       SELECT date_trunc('month', CURRENT_DATE)::date AS cur_start,
              (date_trunc('month', CURRENT_DATE) - interval '1 month')::date AS prev_start,
              (CURRENT_DATE - date_trunc('month', CURRENT_DATE)::date) AS day_offset
     ),
     cur AS (
       SELECT t.subcategory, SUM(t.amount)::float AS spend
       FROM transactions t, bounds b
       WHERE ${SPEND_FILTER} AND t.category = $1 AND t.date >= b.cur_start
       GROUP BY t.subcategory
     ),
     prev AS (
       SELECT t.subcategory, SUM(t.amount)::float AS spend
       FROM transactions t, bounds b
       WHERE ${SPEND_FILTER} AND t.category = $1
         AND t.date >= b.prev_start AND t.date <= b.prev_start + b.day_offset
       GROUP BY t.subcategory
     )
     SELECT COALESCE(c.subcategory, p.subcategory) AS subcategory,
            COALESCE(c.spend, 0) AS current_spend,
            COALESCE(p.spend, 0) AS prev_spend,
            CASE WHEN COALESCE(p.spend,0) > 0
                 THEN ROUND(((COALESCE(c.spend,0) - p.spend) / p.spend * 100)::numeric)::int
                 ELSE NULL END AS mom_pct
     FROM cur c FULL OUTER JOIN prev p ON p.subcategory = c.subcategory
     ORDER BY current_spend DESC`,
    [category]
  );
  return rows;
}

// --- Merchant rollups ------------------------------------------------------

export async function merchantMoM(minSpend = 100) {
  const { rows } = await q(
    `WITH bounds AS (
       SELECT date_trunc('month', CURRENT_DATE)::date AS cur_start,
              (date_trunc('month', CURRENT_DATE) - interval '1 month')::date AS prev_start,
              (CURRENT_DATE - date_trunc('month', CURRENT_DATE)::date) AS day_offset
     ),
     cur AS (
       SELECT COALESCE(t.merchant_name, t.name) AS merchant, SUM(t.amount)::float AS spend, COUNT(*)::int AS n
       FROM transactions t, bounds b
       WHERE ${SPEND_FILTER} AND t.date >= b.cur_start
       GROUP BY 1
     ),
     prev AS (
       SELECT COALESCE(t.merchant_name, t.name) AS merchant, SUM(t.amount)::float AS spend
       FROM transactions t, bounds b
       WHERE ${SPEND_FILTER} AND t.date >= b.prev_start AND t.date <= b.prev_start + b.day_offset
       GROUP BY 1
     )
     SELECT c.merchant, c.spend AS current_spend, c.n AS txn_count,
            COALESCE(p.spend, 0) AS prev_spend,
            CASE WHEN COALESCE(p.spend,0) > 0
                 THEN ROUND(((c.spend - p.spend) / p.spend * 100)::numeric)::int
                 ELSE NULL END AS mom_pct
     FROM cur c LEFT JOIN prev p ON p.merchant = c.merchant
     WHERE c.spend >= $1
     ORDER BY c.spend DESC
     LIMIT 50`,
    [minSpend]
  );
  return rows;
}

// Merchants first seen this month (against full history), with meaningful spend.
export async function newMerchants(minSpend = 50) {
  const { rows } = await q(
    `WITH firsts AS (
       SELECT COALESCE(t.merchant_name, t.name) AS merchant,
              MIN(t.date) AS first_seen,
              SUM(t.amount) FILTER (
                WHERE t.date >= date_trunc('month', CURRENT_DATE)::date
              )::float AS month_spend,
              COUNT(*)::int AS n
       FROM transactions t
       WHERE ${SPEND_FILTER}
       GROUP BY 1
     )
     SELECT merchant, first_seen, month_spend, n
     FROM firsts
     WHERE first_seen >= date_trunc('month', CURRENT_DATE)::date
       AND month_spend >= $1
     ORDER BY month_spend DESC`,
    [minSpend]
  );
  return rows;
}

// --- Recurring detection ---------------------------------------------------

// Recurring = same merchant, >= 3 charges, stable amount (rel. stddev < 25%),
// cadence roughly weekly..monthly-and-a-bit (median interval 5..40 days),
// seen within the last 45 days. Flags % change of latest vs median amount.
export async function recurringCharges() {
  const { rows } = await q(
    `WITH tx AS (
       SELECT COALESCE(t.merchant_name, t.name) AS merchant, t.date, t.amount::float AS amount,
              t.account_id
       FROM transactions t
       WHERE ${SPEND_FILTER} AND t.date >= CURRENT_DATE - interval '13 months'
     ),
     stats AS (
       SELECT merchant,
              COUNT(*)::int AS n,
              AVG(amount)::float AS avg_amount,
              COALESCE(STDDEV_POP(amount), 0)::float AS sd_amount,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount)::float AS median_amount,
              MAX(date) AS last_date,
              MIN(date) AS first_date
       FROM tx GROUP BY merchant
     ),
     gaps AS (
       SELECT merchant,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap)::float AS median_gap
       FROM (
         SELECT merchant, (date - LAG(date) OVER (PARTITION BY merchant ORDER BY date))::int AS gap
         FROM tx
       ) g WHERE gap IS NOT NULL AND gap > 0
       GROUP BY merchant
     ),
     latest AS (
       SELECT DISTINCT ON (merchant) merchant, amount AS latest_amount, date AS latest_date
       FROM tx ORDER BY merchant, date DESC
     )
     SELECT s.merchant, s.n, s.avg_amount, s.median_amount, s.first_date, s.last_date,
            g.median_gap, l.latest_amount,
            CASE WHEN s.median_amount > 0
                 THEN ROUND(((l.latest_amount - s.median_amount) / s.median_amount * 100)::numeric)::int
                 ELSE 0 END AS latest_vs_median_pct
     FROM stats s
     JOIN gaps g ON g.merchant = s.merchant
     JOIN latest l ON l.merchant = s.merchant
     WHERE s.n >= 3
       AND s.avg_amount > 0
       AND (s.sd_amount / NULLIF(s.avg_amount, 0)) < 0.25
       AND g.median_gap BETWEEN 5 AND 40
       AND s.last_date >= CURRENT_DATE - interval '45 days'
     ORDER BY s.median_amount DESC`
  );
  return rows.map((r) => ({
    ...r,
    monthly_cost: r.median_gap <= 10 ? r.median_amount * 4 : r.median_amount,
    is_new: new Date(r.first_date) >= new Date(Date.now() - 45 * 864e5),
  }));
}

// --- Baselines & anomalies -------------------------------------------------

// Current-month projected spend per category vs rolling 3-full-month average.
export async function categoryBaselines() {
  const { rows } = await q(
    `WITH cur AS (
       SELECT t.category, SUM(t.amount)::float AS mtd
       FROM transactions t
       WHERE ${SPEND_FILTER} AND t.date >= date_trunc('month', CURRENT_DATE)::date
       GROUP BY t.category
     ),
     hist AS (
       SELECT t.category, date_trunc('month', t.date) AS m, SUM(t.amount)::float AS spend
       FROM transactions t
       WHERE ${SPEND_FILTER}
         AND t.date >= (date_trunc('month', CURRENT_DATE) - interval '3 months')::date
         AND t.date < date_trunc('month', CURRENT_DATE)::date
       GROUP BY t.category, 2
     ),
     baseline AS (
       SELECT category, AVG(spend)::float AS avg3mo, COUNT(*)::int AS months
       FROM hist GROUP BY category
     )
     SELECT c.category, c.mtd,
            b.avg3mo, b.months,
            (c.mtd / GREATEST(EXTRACT(DAY FROM CURRENT_DATE)::float, 1)
              * EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day'))::float
            ) AS projected
     FROM cur c
     JOIN baseline b ON b.category = c.category
     WHERE b.months >= 2
     ORDER BY c.mtd DESC`
  );
  return rows.map((r) => ({
    ...r,
    over_baseline_pct:
      r.avg3mo > 0 ? Math.round(((r.projected - r.avg3mo) / r.avg3mo) * 100) : null,
  }));
}

// Unusually large single transactions: > mean + 3σ of the account's last 6 months, and >= $200.
export async function unusualLargeTransactions() {
  const { rows } = await q(
    `WITH stats AS (
       SELECT t.account_id, AVG(t.amount)::float AS mean, COALESCE(STDDEV_POP(t.amount),0)::float AS sd
       FROM transactions t
       WHERE ${SPEND_FILTER} AND t.date >= CURRENT_DATE - interval '6 months'
       GROUP BY t.account_id
     )
     SELECT t.id, COALESCE(t.merchant_name, t.name) AS merchant, t.date, t.amount::float AS amount,
            t.category, a.name AS account_name
     FROM transactions t
     JOIN stats s ON s.account_id = t.account_id
     JOIN accounts a ON a.id = t.account_id
     WHERE ${SPEND_FILTER}
       AND t.date >= date_trunc('month', CURRENT_DATE)::date
       AND t.amount >= 200
       AND t.amount > s.mean + 3 * s.sd
     ORDER BY t.amount DESC`
  );
  return rows;
}

// --- Cash flow & series ----------------------------------------------------

export async function netCashFlow() {
  const { rows } = await q(
    `SELECT
       COALESCE(SUM(-t.amount) FILTER (WHERE t.amount < 0), 0)::float AS inflows,
       COALESCE(SUM(t.amount) FILTER (WHERE t.amount > 0), 0)::float AS outflows
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE NOT t.removed AND a.type = 'depository'
       AND t.date >= date_trunc('month', CURRENT_DATE)::date`
  );
  const { inflows, outflows } = rows[0];
  return { inflows, outflows, net: inflows - outflows };
}

// Cumulative daily spend series for current month + previous month (overview chart).
export async function dailySpendSeries() {
  const { rows } = await q(
    `SELECT date_trunc('month', t.date)::date AS month, t.date, SUM(t.amount)::float AS spend
     FROM transactions t
     WHERE ${SPEND_FILTER}
       AND t.date >= (date_trunc('month', CURRENT_DATE) - interval '1 month')::date
     GROUP BY 1, t.date ORDER BY t.date`
  );
  const cur = [];
  const prev = [];
  const curMonth = monthStart();
  const prvMonth = prevMonthStart();
  let curSum = 0, prevSum = 0;
  for (const r of rows) {
    const m = r.month.toISOString().slice(0, 10);
    const day = Number(String(r.date.toISOString()).slice(8, 10));
    if (m === curMonth) { curSum += r.spend; cur.push({ day, total: Math.round(curSum) }); }
    else if (m === prvMonth) { prevSum += r.spend; prev.push({ day, total: Math.round(prevSum) }); }
  }
  return { current: cur, previous: prev };
}

// Weekly series per account for sparklines: cards get weekly spend, the checking
// account gets a reconstructed balance walk (current balance minus later net flows).
export async function accountSparkSeries() {
  const { rows: accounts } = await q(`SELECT id, type, current_balance::float AS bal FROM accounts`);
  const result = {};
  for (const a of accounts) {
    if (a.type === 'credit') {
      const { rows } = await q(
        `SELECT date_trunc('week', d)::date AS wk, COALESCE(SUM(t.amount) FILTER (WHERE t.amount > 0), 0)::float AS spend
         FROM generate_series(date_trunc('week', CURRENT_DATE) - interval '8 weeks',
                              date_trunc('week', CURRENT_DATE), interval '1 week') d
         LEFT JOIN transactions t
           ON t.account_id = $1 AND NOT t.removed
          AND date_trunc('week', t.date) = date_trunc('week', d)
         GROUP BY 1 ORDER BY 1`,
        [a.id]
      );
      const series = rows.map((r) => r.spend);
      const recentAvg = series.slice(-3).reduce((s, v) => s + v, 0) / 3;
      const priorAvg = series.slice(0, -3).reduce((s, v) => s + v, 0) / Math.max(series.length - 3, 1);
      result[a.id] = { series, up: recentAvg > priorAvg };
    } else {
      const { rows } = await q(
        `SELECT date_trunc('week', t.date)::date AS wk, SUM(t.amount)::float AS net_out
         FROM transactions t
         WHERE t.account_id = $1 AND NOT t.removed
           AND t.date >= date_trunc('week', CURRENT_DATE) - interval '8 weeks'
         GROUP BY 1 ORDER BY 1 DESC`,
        [a.id]
      );
      // Walk back from current balance: balance_before_week = balance_after + net_out
      let bal = a.bal ?? 0;
      const back = [bal];
      for (const r of rows) { bal += r.net_out; back.push(bal); }
      const series = back.reverse();
      result[a.id] = { series, up: series[series.length - 1] >= series[0] };
    }
  }
  return result;
}

// Statements due: total owed across credit cards (Plaid Transactions doesn't expose
// due dates; we surface total card balances owed as the time-sensitive number).
export async function cardBalances() {
  const { rows } = await q(
    `SELECT COALESCE(SUM(current_balance), 0)::float AS owed FROM accounts WHERE type = 'credit'`
  );
  return rows[0].owed;
}
