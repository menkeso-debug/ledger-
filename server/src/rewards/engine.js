import { q } from '../db/pool.js';
import { MQD, MQD_DRIVERS, EARN_RATES, CREDITS, periodBounds } from './config.js';

// Spend transactions joined with the card tier, in a date range.
async function spendWithTier(fromDate, toDate = null) {
  const { rows } = await q(
    `SELECT COALESCE(t.merchant_name, t.name) AS merchant, t.name AS raw_name,
            t.amount::float AS amount, t.date, t.category, t.subcategory, a.tier, a.id AS account_id
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE NOT t.removed AND t.amount > 0
       AND t.category NOT IN ('Income','Transfer')
       AND t.date >= $1::date
       ${toDate ? 'AND t.date <= $2::date' : ''}`,
    toDate ? [fromDate, toDate] : [fromDate]
  );
  return rows;
}

// --- MQD pace toward Delta status -------------------------------------------

export async function mqdStatus() {
  const yearStart = MQD.qualificationYearStart();
  const txns = await spendWithTier(yearStart);

  const drivers = MQD_DRIVERS.map((d) => ({ key: d.key, name: d.name, note: d.note, mqd: 0 }));
  let earned = 0;
  for (const t of txns) {
    for (let i = 0; i < MQD_DRIVERS.length; i++) {
      if (MQD_DRIVERS[i].match(t)) {
        const v = MQD_DRIVERS[i].mqd(t);
        drivers[i].mqd += v;
        earned += v;
        break;
      }
    }
  }
  for (const d of drivers) d.mqd = Math.round(d.mqd);
  earned = Math.round(earned);

  // Pace projection: MQDs per day so far → month the target is reached.
  const start = new Date(yearStart);
  const now = new Date();
  const daysElapsed = Math.max((now - start) / 864e5, 1);
  const perDay = earned / daysElapsed;
  let onTrackBy = null;
  if (perDay > 0 && earned < MQD.target) {
    const daysToGo = (MQD.target - earned) / perDay;
    const eta = new Date(now.getTime() + daysToGo * 864e5);
    onTrackBy = eta.getFullYear() === now.getFullYear()
      ? eta.toLocaleDateString('en-US', { month: 'long' })
      : `${eta.toLocaleDateString('en-US', { month: 'short' })} ${eta.getFullYear()}`;
  }

  return {
    target: MQD.target,
    targetLabel: MQD.targetLabel,
    earned,
    remaining: Math.max(MQD.target - earned, 0),
    pct: Math.min(earned / MQD.target, 1),
    onTrackBy,
    drivers: drivers.sort((a, b) => b.mqd - a.mqd),
  };
}

// --- Points earned per card (current month, estimated from earn rates) ------

export async function pointsEarnedThisMonth() {
  const monthStart = new Date();
  monthStart.setDate(1);
  const txns = await spendWithTier(monthStart.toISOString().slice(0, 10));

  const byTier = {};
  for (const t of txns) {
    const card = EARN_RATES[t.tier];
    if (!card || !card.program) continue;
    const pts = Math.round(t.amount * card.rate(t));
    if (!byTier[t.tier]) byTier[t.tier] = { tier: t.tier, label: card.label, program: card.program, points: 0, spend: 0 };
    byTier[t.tier].points += pts;
    byTier[t.tier].spend += t.amount;
  }
  return Object.values(byTier).sort((a, b) => b.points - a.points);
}

// --- Card credit usage -------------------------------------------------------

export async function creditsStatus() {
  const now = new Date();
  const results = [];
  for (const credit of CREDITS) {
    const { start, end, key } = periodBounds(credit.period, now);
    const txns = await spendWithTier(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
    const matched = txns
      .filter((t) => t.tier === credit.tier && credit.match.test(`${t.merchant} ${t.raw_name}`))
      .reduce((s, t) => s + t.amount, 0);
    const used = Math.min(matched, credit.amount);
    const remaining = credit.amount - used;
    const daysLeft = Math.ceil((end - now) / 864e5);
    const nudge = remaining > 0 && daysLeft <= credit.nudgeDays;
    results.push({
      id: credit.id,
      name: credit.name,
      tier: credit.tier,
      amount: credit.amount,
      period: credit.period,
      periodKey: key,
      used: Math.round(used * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
      daysLeft,
      nudge,
      nudgeTitle: `$${Math.round(remaining)} left on your ${credit.name}`,
      nudgeBody: `Use it in the next ${daysLeft} day${daysLeft === 1 ? '' : 's'} or the ${credit.period} credit resets unused.`,
    });
  }
  return results;
}

// --- Manual point balances ----------------------------------------------------

export async function getBalances() {
  const { rows } = await q(
    'SELECT program, display_name, note, balance::float AS balance, updated_at FROM rewards_balances ORDER BY balance DESC'
  );
  return rows;
}

export async function setBalance(program, balance) {
  const { rows } = await q(
    `UPDATE rewards_balances SET balance = $2, updated_at = now()
     WHERE program = $1
     RETURNING program, display_name, note, balance::float AS balance, updated_at`,
    [program, Math.round(Number(balance))]
  );
  if (!rows.length) throw new Error(`unknown rewards program: ${program}`);
  return rows[0];
}

export async function rewardsSummary() {
  const [mqd, points, credits, balances] = await Promise.all([
    mqdStatus(), pointsEarnedThisMonth(), creditsStatus(), getBalances(),
  ]);
  return { mqd, pointsThisMonth: points, credits, balances };
}
