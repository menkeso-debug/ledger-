import { q } from '../db/pool.js';
import { log } from '../lib/log.js';
import {
  categoryMoM, recurringCharges, categoryBaselines,
  newMerchants, unusualLargeTransactions,
} from './rollups.js';
import { creditsStatus } from '../rewards/engine.js';

const money = (n) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

async function upsertInsight(i) {
  await q(
    `INSERT INTO insights (kind, tone, tag, title, body, impact, impact_sub, cta, dedupe_key, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (dedupe_key) DO UPDATE SET
       title = EXCLUDED.title, body = EXCLUDED.body, impact = EXCLUDED.impact,
       impact_sub = EXCLUDED.impact_sub, data = EXCLUDED.data, updated_at = now()`,
    [i.kind, i.tone, i.tag, i.title, i.body, i.impact || null, i.impactSub || null,
     i.cta || null, i.dedupeKey, JSON.stringify(i.data || {})]
  );
}

// Recompute the full deterministic insight set. Idempotent per (kind, subject, month).
export async function computeInsights() {
  const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
  let count = 0;

  const { rows: budgetRows } = await q('SELECT category, monthly_budget::float AS budget FROM budgets');
  const budgets = new Map(budgetRows.map((r) => [r.category, r.budget]));

  // 1. Overspend vs budget
  const mom = await categoryMoM();
  for (const c of mom) {
    const budget = budgets.get(c.category);
    if (!budget || c.current_spend <= budget) continue;
    const over = c.current_spend - budget;
    const pctOver = Math.round((over / budget) * 100);
    await upsertInsight({
      kind: 'overspend', tone: 'neg', tag: 'Overspend',
      title: `${c.category} is ${pctOver}% over budget`,
      body: `${money(c.current_spend)} spent of your ${money(budget)} limit this month${
        c.mom_pct != null ? `, ${c.mom_pct >= 0 ? 'up' : 'down'} ${Math.abs(c.mom_pct)}% vs the same span last month` : ''
      }.`,
      impact: money(over), impactSub: 'over budget', cta: 'Set a lower limit',
      dedupeKey: `overspend:${c.category}:${ym}`,
      data: { category: c.category, spend: c.current_spend, budget, momPct: c.mom_pct },
    });
    count++;
  }

  // 2. Recurring charges: bill jumped + new recurring (bills only — a weekly
  // restaurant habit is not a subscription)
  const recurring = await recurringCharges();
  for (const r of recurring) {
    if (!r.is_bill) continue;
    if (r.is_new) {
      await upsertInsight({
        kind: 'new_recurring', tone: 'accent', tag: 'New recurring',
        title: `New subscription detected: ${r.merchant}`,
        body: `A ${money(r.median_amount)} recurring charge started ${new Date(r.first_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Estimated ${money(r.monthly_cost)}/mo.`,
        impact: money(r.monthly_cost), impactSub: '/mo · new', cta: 'Review subscriptions',
        dedupeKey: `new_recurring:${r.merchant}`,
        data: { merchant: r.merchant, amount: r.median_amount },
      });
      count++;
    } else if (r.latest_vs_median_pct >= 10 && r.latest_amount - r.median_amount >= 10) {
      await upsertInsight({
        kind: 'bill_jumped', tone: 'amber', tag: 'Bill jumped',
        title: `${r.merchant} rose ${money(r.latest_amount - r.median_amount)} vs usual`,
        body: `Latest charge was ${money(r.latest_amount)} against a typical ${money(r.median_amount)} — up ${r.latest_vs_median_pct}%.`,
        impact: `+${money(r.latest_amount - r.median_amount)}`, impactSub: 'vs usual', cta: 'View charge history',
        dedupeKey: `bill_jumped:${r.merchant}:${ym}`,
        data: { merchant: r.merchant, latest: r.latest_amount, median: r.median_amount },
      });
      count++;
    }
  }

  // 3. Category over rolling 3-month baseline (skip ones already flagged as over budget)
  const baselines = await categoryBaselines();
  for (const b of baselines) {
    const budget = budgets.get(b.category);
    const alreadyOverBudget = budget && b.mtd > budget;
    if (alreadyOverBudget) continue;
    if (b.over_baseline_pct != null && b.over_baseline_pct >= 25 && b.projected - b.avg3mo >= 100) {
      await upsertInsight({
        kind: 'baseline', tone: 'amber', tag: 'Trending high',
        title: `${b.category} is pacing ${b.over_baseline_pct}% above your usual`,
        body: `On pace for ${money(b.projected)} this month vs a ${money(b.avg3mo)} three-month average.`,
        impact: money(b.projected - b.avg3mo), impactSub: 'above baseline', cta: 'See breakdown',
        dedupeKey: `baseline:${b.category}:${ym}`,
        data: { category: b.category, projected: b.projected, avg3mo: b.avg3mo },
      });
      count++;
    }
  }

  // 4. New merchants with meaningful spend
  const fresh = await newMerchants(150);
  for (const m of fresh.slice(0, 3)) {
    await upsertInsight({
      kind: 'new_merchant', tone: 'accent', tag: 'New merchant',
      title: `First time spending at ${m.merchant}`,
      body: `${money(m.month_spend)} across ${m.n} transaction${m.n > 1 ? 's' : ''} this month at a merchant you haven't used before.`,
      impact: money(m.month_spend), impactSub: 'this month', cta: 'View transactions',
      dedupeKey: `new_merchant:${m.merchant}:${ym}`,
      data: { merchant: m.merchant, spend: m.month_spend },
    });
    count++;
  }

  // 5. Unusual large transactions
  const large = await unusualLargeTransactions();
  for (const t of large.slice(0, 3)) {
    await upsertInsight({
      kind: 'large_txn', tone: 'amber', tag: 'Large charge',
      title: `Unusually large charge at ${t.merchant}`,
      body: `${money(t.amount)} on ${t.account_name} (${t.category}) — well above this account's typical transaction size.`,
      impact: money(t.amount), impactSub: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      cta: 'View transaction',
      dedupeKey: `large_txn:${t.id}`,
      data: { merchant: t.merchant, amount: t.amount, date: t.date },
    });
    count++;
  }

  // 6. Streaming overlap opportunity — only merchants that are actually
  // recurring subscriptions (one-off theater tickets don't count)
  const recurringSet = new Set(recurring.filter((r) => r.is_bill).map((r) => r.merchant));
  const { rows: allStreaming } = await q(
    `SELECT COALESCE(merchant_name, name) AS merchant, SUM(amount)::float AS spend
     FROM transactions t
     WHERE NOT t.removed AND t.amount > 0 AND t.subcategory IN ('Streaming','Music')
       AND t.date >= CURRENT_DATE - interval '35 days'
     GROUP BY 1 ORDER BY spend DESC`
  );
  const streaming = allStreaming.filter((s) => recurringSet.has(s.merchant));
  if (streaming.length >= 4) {
    const total = streaming.reduce((s, r) => s + r.spend, 0);
    const names = streaming.slice(0, 4).map((r) => r.merchant).join(', ');
    await upsertInsight({
      kind: 'opportunity', tone: 'pos', tag: 'Opportunity',
      title: `You have ${streaming.length} overlapping streaming/music services`,
      body: `${names} total ${money(total)}/mo. Consolidating the least-used could save around ${money(total * 0.4)} a month.`,
      impact: money(total * 0.4), impactSub: '/mo saved', cta: 'See the plan',
      dedupeKey: `opportunity:streaming:${ym}`,
      data: { services: streaming },
    });
    count++;
  }

  // 7. Manual-import staleness: Apple Card only updates when a CSV is uploaded.
  const { rows: staleRows } = await q(
    `SELECT MAX(t.date) AS last_txn
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE a.plaid_account_id = 'manual-apple-card' AND NOT t.removed`
  );
  if (staleRows[0]?.last_txn) {
    const daysStale = Math.floor((Date.now() - new Date(staleRows[0].last_txn).getTime()) / 864e5);
    if (daysStale >= 21) {
      await upsertInsight({
        kind: 'stale_import', tone: 'amber', tag: 'Data gap',
        title: 'Apple Card data is going stale',
        body: `Newest Apple Card transaction is ${daysStale} days old. Export a fresh CSV from Wallet and upload it on the Accounts screen so spend and forecasts stay accurate.`,
        impact: `${daysStale}d`, impactSub: 'since last data', cta: 'Import Apple Card CSV',
        dedupeKey: `stale_import:apple:${ym}`,
        data: { daysStale },
      });
      count++;
    } else {
      // Fresh again — clear any standing nudge for this month
      await q(`UPDATE insights SET dismissed = true WHERE dedupe_key = $1`, [`stale_import:apple:${ym}`]);
    }
  }

  // 8. Card-credit nudges from the rewards layer (unused / near expiry)
  try {
    const credits = await creditsStatus();
    for (const c of credits) {
      if (!c.nudge) continue;
      await upsertInsight({
        kind: 'almost_there', tone: 'accent', tag: 'Almost there',
        title: c.nudgeTitle,
        body: c.nudgeBody,
        impact: money(c.remaining), impactSub: 'to unlock', cta: 'Find eligible merchants',
        dedupeKey: `credit:${c.id}:${c.periodKey}`,
        data: { credit: c.id, used: c.used, total: c.amount },
      });
      count++;
    }
  } catch (err) {
    log.warn('credit nudges skipped', err);
  }

  log.info('insights computed', { count });
  return count;
}
