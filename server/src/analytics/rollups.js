import { q } from '../db/pool.js';

// All "spend" rollups: outflows (amount > 0), excluding transfers/income/card payments,
// excluding removed rows. Plaid convention: positive amount = money out.

const SPEND_FILTER = `NOT t.removed AND t.amount > 0 AND t.category NOT IN ('Income','Transfer','Business')`;

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

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
              t.account_id, t.category
       FROM transactions t
       WHERE ${SPEND_FILTER} AND t.date >= CURRENT_DATE - interval '13 months'
     ),
     stats AS (
       SELECT merchant,
              COUNT(*)::int AS n,
              AVG(amount)::float AS avg_amount,
              COALESCE(STDDEV_POP(amount), 0)::float AS sd_amount,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount)::float AS median_amount,
              MODE() WITHIN GROUP (ORDER BY category) AS category,
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
     SELECT s.merchant, s.category, s.n, s.avg_amount, s.median_amount, s.first_date, s.last_date,
            g.median_gap, l.latest_amount,
            CASE WHEN s.median_amount > 0
                 THEN ROUND(((l.latest_amount - s.median_amount) / s.median_amount * 100)::numeric)::int
                 ELSE 0 END AS latest_vs_median_pct
     FROM stats s
     JOIN gaps g ON g.merchant = s.merchant
     JOIN latest l ON l.merchant = s.merchant
     WHERE s.n >= 2
       AND s.avg_amount > 0
       AND (s.sd_amount / NULLIF(s.avg_amount, 0)) < 0.25
       AND g.median_gap BETWEEN 5 AND 40
       AND (s.n >= 3 OR (s.n = 2 AND g.median_gap BETWEEN 26 AND 38 AND s.median_amount >= 500))
       AND s.last_date >= CURRENT_DATE - interval '45 days'
     ORDER BY s.median_amount DESC`
  );
  return rows.map((r) => ({
    ...r,
    monthly_cost: r.median_gap <= 10 ? r.median_amount * 4 : r.median_amount,
    is_new: new Date(r.first_date) >= new Date(Date.now() - 45 * 864e5),
    // A regular restaurant/grocery habit recurs but is NOT a bill/subscription.
    is_bill: !['Dining', 'Groceries', 'Shopping', 'Travel', 'Transport'].includes(r.category),
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

// Per-category monthly spend for the last N *full* months (budget baselines).
export async function monthlyCategoryHistory(months = 6) {
  const { rows } = await q(
    `SELECT t.category, to_char(date_trunc('month', t.date), 'YYYY-MM') AS month,
            SUM(t.amount)::float AS spend
     FROM transactions t
     WHERE ${SPEND_FILTER}
       AND t.date >= (date_trunc('month', CURRENT_DATE) - make_interval(months => $1))::date
       AND t.date < date_trunc('month', CURRENT_DATE)::date
     GROUP BY t.category, 2
     ORDER BY t.category, 2`,
    [months]
  );
  const byCat = {};
  for (const r of rows) {
    if (!byCat[r.category]) byCat[r.category] = {};
    byCat[r.category][r.month] = Math.round(r.spend);
  }
  return byCat;
}

// --- Income streams & 30-day cash flow projection ---------------------------

const classifyCadence = (gap) => {
  if (gap >= 5 && gap <= 9) return 'weekly';
  if (gap >= 11 && gap <= 18) return 'biweekly';
  if (gap >= 26 && gap <= 35) return 'monthly';
  return null;
};

// US payroll convention: deposits scheduled on a weekend/holiday land the
// preceding business day (matches ADP/most processors).
const FEDERAL_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19',
  '2026-07-03', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-18',
  '2027-07-05', '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25', '2027-12-24',
]);

function snapToBusinessDay(d) {
  const out = new Date(d);
  for (let i = 0; i < 7; i++) {
    const dow = out.getUTCDay();
    const iso = out.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !FEDERAL_HOLIDAYS.has(iso)) return out;
    out.setUTCDate(out.getUTCDate() - 1);
  }
  return out;
}

// Detect recurring income deposits (salary etc.): regular inflows on checking.
// Predicts upcoming pay dates from median cadence.
export async function incomeStreams() {
  const { rows } = await q(
    `SELECT COALESCE(t.merchant_name, t.name) AS merchant, t.date, (-t.amount)::float AS amount
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE NOT t.removed AND a.type = 'depository' AND t.amount < 0
       AND t.category = 'Income'
       AND t.date >= CURRENT_DATE - interval '7 months'
     ORDER BY merchant, t.date`
  );
  const byMerchant = new Map();
  for (const r of rows) {
    if (!byMerchant.has(r.merchant)) byMerchant.set(r.merchant, []);
    byMerchant.get(r.merchant).push(r);
  }

  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };

  const streams = [];
  const today = new Date(new Date().toISOString().slice(0, 10));
  for (const [merchant, txns] of byMerchant) {
    if (txns.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < txns.length; i++) {
      gaps.push(Math.round((txns[i].date - txns[i - 1].date) / 864e5));
    }
    const gap = median(gaps.filter((g) => g > 0));
    const cadence = classifyCadence(gap);
    if (!cadence) continue;
    const amount = median(txns.map((t) => t.amount));
    const lastDate = txns[txns.length - 1].date;
    // A stream with no deposit in ~2 pay cycles has ended (job change, closed
    // payout source) — keep it in history but never project paydays from it.
    const daysSinceLast = Math.round((today - lastDate) / 864e5);
    const active = daysSinceLast <= gap * 2 + 7;
    const upcoming = [];
    if (active) {
      // Regular cadences project on an exact grid (biweekly = 14, weekly = 7)
      // anchored to the last real deposit, then snap to the preceding business
      // day — mirrors how ADP-style payroll actually lands.
      const gridGap = cadence === 'biweekly' ? 14 : cadence === 'weekly' ? 7 : gap;
      let next = new Date(lastDate.getTime() + gridGap * 864e5);
      while (upcoming.length < 6 && next <= new Date(today.getTime() + 60 * 864e5)) {
        const snapped = snapToBusinessDay(next);
        if (snapped >= today) upcoming.push({ date: snapped.toISOString().slice(0, 10), amount });
        next = new Date(next.getTime() + gridGap * 864e5);
      }
    }
    streams.push({
      merchant, cadence, gapDays: gap,
      typicalAmount: amount,
      lastDate: lastDate.toISOString().slice(0, 10),
      occurrences: txns.length,
      active,
      upcoming,
    });
  }
  return streams.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

// 30-day forward projection: expected income (from detected streams) vs projected
// spend (upcoming recurring bills + discretionary run-rate from the last 60 days).
export async function cashflowProjection() {
  const [streams, recurring] = await Promise.all([incomeStreams(), recurringCharges()]);
  const today = new Date(new Date().toISOString().slice(0, 10));
  const horizon = new Date(today.getTime() + 30 * 864e5);

  const nextPaydays = streams
    .flatMap((s) => s.upcoming.map((u) => ({ ...u, merchant: s.merchant, cadence: s.cadence })))
    .filter((u) => new Date(u.date) <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date));
  const expectedIncome = nextPaydays.reduce((s, p) => s + p.amount, 0);

  // Upcoming recurring bills inside the window, projected from cadence.
  // Habitual dining/groceries recur too but belong to the discretionary
  // run-rate, not the bill list.
  const upcomingBills = [];
  for (const r of recurring) {
    if (!r.is_bill) continue;
    const gap = Math.round(r.median_gap);
    if (!gap || gap < 2) continue;
    let next = new Date(new Date(r.last_date).getTime() + gap * 864e5);
    while (next <= horizon && upcomingBills.length < 200) {
      if (next >= today) {
        upcomingBills.push({
          merchant: r.merchant,
          date: next.toISOString().slice(0, 10),
          amount: r.median_amount,
        });
      }
      next = new Date(next.getTime() + gap * 864e5);
    }
  }
  upcomingBills.sort((a, b) => a.date.localeCompare(b.date));
  const recurringTotal = upcomingBills.reduce((s, b) => s + b.amount, 0);

  // Steady spend: per-category MONTHLY pattern over the last 3 full months.
  // For each category, take the median month — a constant expense shows up in
  // every month and survives; a one-off inflates a single month and gets
  // discounted. Individual anomaly transactions (single occurrence, >= $1,500)
  // are excluded from the baseline entirely and surfaced separately — flagged,
  // never baked in. Bill merchants are excluded here (projected from their own
  // cadence above).
  const recurringMerchants = recurring.filter((r) => r.is_bill).map((r) => r.merchant);

  // User-declared spend nature beats every heuristic.
  const { rows: flagRows } = await q('SELECT merchant_key, nature, monthly_amount::float AS monthly_amount FROM merchant_flags');
  const oneOffKeys = flagRows.filter((f) => f.nature === 'one_off').map((f) => f.merchant_key);
  const constantKeys = flagRows.filter((f) => f.nature === 'constant').map((f) => f.merchant_key);
  const declaredAmounts = new Map(
    flagRows.filter((f) => f.nature === 'constant' && f.monthly_amount != null)
      .map((f) => [f.merchant_key, f.monthly_amount])
  );

  const { rows: catMonths } = await q(
    `WITH window_tx AS (
       SELECT t.category, COALESCE(t.merchant_name, t.name) AS merchant,
              date_trunc('month', t.date) AS m, t.amount::float AS amount, t.date
       FROM transactions t
       WHERE ${SPEND_FILTER}
         AND t.date >= (date_trunc('month', CURRENT_DATE) - interval '3 months')::date
         AND t.date < date_trunc('month', CURRENT_DATE)::date
         AND COALESCE(t.merchant_name, t.name) != ALL($1::text[])
         AND lower(COALESCE(t.merchant_name, t.name)) != ALL($2::text[])
         AND lower(COALESCE(t.merchant_name, t.name)) != ALL($3::text[])
     ),
     merchant_counts AS (
       SELECT merchant, COUNT(*)::int AS n FROM window_tx GROUP BY merchant
     ),
     anomalies AS (
       SELECT w.merchant, w.amount, w.date
       FROM window_tx w JOIN merchant_counts mc ON mc.merchant = w.merchant
       WHERE mc.n = 1 AND w.amount >= 1500
     )
     SELECT w.category, to_char(w.m, 'YYYY-MM') AS month,
            SUM(w.amount) FILTER (
              WHERE NOT EXISTS (
                SELECT 1 FROM anomalies a
                WHERE a.merchant = w.merchant AND a.amount = w.amount AND a.date = w.date
              )
            )::float AS steady_spend,
            (SELECT json_agg(json_build_object('merchant', a.merchant, 'amount', a.amount, 'date', a.date))
             FROM anomalies a) AS all_anomalies
     FROM window_tx w
     GROUP BY w.category, 2`,
    [recurringMerchants, oneOffKeys, constantKeys]
  );

  // Constant-flagged merchants: averaged over the window regardless of how
  // irregularly they bill (daycare per term, tuition, etc.).
  const { rows: constants } = await q(
    `SELECT COALESCE(t.merchant_name, t.name) AS merchant, (SUM(t.amount) / 3.0)::float AS monthly,
            MODE() WITHIN GROUP (ORDER BY t.category) AS category
     FROM transactions t
     WHERE ${SPEND_FILTER}
       AND t.date >= (date_trunc('month', CURRENT_DATE) - interval '6 months')::date
       AND lower(COALESCE(t.merchant_name, t.name)) = ANY($1::text[])
     GROUP BY 1`,
    [constantKeys]
  );
  // User-declared monthly amount wins over the window average; constants with
  // a declared amount but no window transactions still count. Each one folds
  // into its own category — it's ordinary recurring spend, not a special case.
  const pinnedByCategory = new Map();
  const seenKeys = new Set();
  for (const c of constants) {
    seenKeys.add(c.merchant.toLowerCase());
    const monthly = Math.round(declaredAmounts.get(c.merchant.toLowerCase()) ?? c.monthly);
    const cat = c.category || 'Other';
    pinnedByCategory.set(cat, (pinnedByCategory.get(cat) || 0) + monthly);
  }
  for (const [key, amount] of declaredAmounts) {
    if (!seenKeys.has(key)) pinnedByCategory.set('Other', (pinnedByCategory.get('Other') || 0) + Math.round(amount));
  }

  const byCategory = new Map();
  for (const r of catMonths) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r.steady_spend || 0);
  }
  const categoryMedians = [...byCategory.entries()]
    .map(([category, months]) => {
      // A category absent in a month = $0 that month; pad to 3 samples
      while (months.length < 3) months.push(0);
      return { category, monthly: Math.round(median(months)) };
    })
    .filter((c) => c.monthly > 0);
  // Fold user-pinned recurring costs into their categories — they're ordinary
  // spend, just declared rather than inferred.
  for (const [cat, monthly] of pinnedByCategory) {
    const entry = categoryMedians.find((c) => c.category === cat);
    if (entry) entry.monthly += monthly;
    else categoryMedians.push({ category: cat, monthly });
  }
  categoryMedians.sort((a, b) => b.monthly - a.monthly);
  const steadyMonthly = categoryMedians.reduce((s, c) => s + c.monthly, 0);

  const anomalies = (catMonths[0]?.all_anomalies || [])
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((a) => ({ merchant: a.merchant, amount: Math.round(a.amount), date: String(a.date).slice(0, 10) }));

  const projectedSpend = recurringTotal + steadyMonthly;
  const net = expectedIncome - projectedSpend;

  return {
    horizonDays: 30,
    expectedIncome,
    nextPaydays,
    incomeStreams: streams,
    projectedSpend,
    recurringTotal,
    discretionaryRunRate: steadyMonthly, // legacy field name for the UI
    projectionBasis: {
      method: 'per-category median month, last 3 full months, one-offs excluded',
      months: 3,
      categoryMedians, // full list — the panel must reconcile with the total
      anomaliesExcluded: anomalies,
    },
    upcomingBills: upcomingBills.slice(0, 12),
    net,
    onTrack: net >= 0,
  };
}

// Statements due: total owed across credit cards (Plaid Transactions doesn't expose
// due dates; we surface total card balances owed as the time-sensitive number).
export async function cardBalances() {
  const { rows } = await q(
    `SELECT COALESCE(SUM(current_balance), 0)::float AS owed FROM accounts WHERE type = 'credit'`
  );
  return rows[0].owed;
}
