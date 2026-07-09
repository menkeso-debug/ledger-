import { q } from './db/pool.js';
import { log } from './lib/log.js';
import { cashflowProjection } from './analytics/rollups.js';
import { creditsStatus } from './rewards/engine.js';

// Alert engine: checks run with the sync crons; each alert fires once per
// dedupe key. Delivery goes to whichever channel is configured — Telegram bot
// (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) and/or ntfy.sh (NTFY_TOPIC) — and
// every alert also lands in the insights feed so nothing is ever lost.

const LOW_CASH_THRESHOLD = Number(process.env.ALERT_LOW_CASH || 2000);
const BIG_CHARGE_THRESHOLD = Number(process.env.ALERT_BIG_CHARGE || 1000);

async function deliver(title, body) {
  const channels = [];
  const tg = { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID };
  if (tg.token && tg.chat) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tg.chat, text: `*${title}*\n${body}`, parse_mode: 'Markdown' }),
      });
      if (res.ok) channels.push('telegram');
      else log.warn('telegram delivery failed', { status: res.status });
    } catch (err) { log.warn('telegram delivery error', err); }
  }
  if (process.env.NTFY_TOPIC) {
    try {
      const res = await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
        method: 'POST',
        headers: { Title: title.replace(/[^\x20-\x7E]/g, '') },
        body,
      });
      if (res.ok) channels.push('ntfy');
    } catch (err) { log.warn('ntfy delivery error', err); }
  }
  return channels;
}

async function fire({ dedupeKey, title, body, tone = 'amber', tag = 'Alert', impact = null, impactSub = null }) {
  const { rows } = await q('SELECT 1 FROM alerts_log WHERE dedupe_key = $1', [dedupeKey]);
  if (rows.length) return false;
  const channels = await deliver(title, body);
  await q('INSERT INTO alerts_log (dedupe_key, title, channel) VALUES ($1, $2, $3)', [
    dedupeKey, title, channels.join(',') || null,
  ]);
  await q(
    `INSERT INTO insights (kind, tone, tag, title, body, impact, impact_sub, dedupe_key, data)
     VALUES ('alert', $1, $2, $3, $4, $5, $6, $7, '{}')
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [tone, tag, title, body, impact, impactSub, `alert:${dedupeKey}`]
  );
  log.info('alert fired', { dedupeKey, channels });
  return true;
}

export async function runAlerts() {
  const today = new Date().toISOString().slice(0, 10);
  let fired = 0;

  // 1. Low cash
  const { rows: cashRows } = await q(
    `SELECT COALESCE(SUM(COALESCE(available_balance, current_balance)), 0)::float AS cash
     FROM accounts WHERE type = 'depository'`
  );
  const cash = cashRows[0].cash;
  if (cash < LOW_CASH_THRESHOLD && cash > 0) {
    if (await fire({
      dedupeKey: `low_cash:${today.slice(0, 7)}:${Math.floor(cash / 500)}`,
      title: `Low cash: $${Math.round(cash).toLocaleString()}`,
      body: `Checking is below your $${LOW_CASH_THRESHOLD.toLocaleString()} threshold. Next expected deposits are on the Overview cash-flow panel.`,
      tone: 'neg', tag: 'Low cash', impact: `$${Math.round(cash).toLocaleString()}`, impactSub: 'available',
    })) fired++;
  }

  // 2. Large new charges (posted in the last 2 days)
  const { rows: bigCharges } = await q(
    `SELECT t.id, COALESCE(t.merchant_name, t.name) AS merchant, t.amount::float, a.name AS account
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE NOT t.removed AND t.amount >= $1
       AND t.category NOT IN ('Transfer','Business')
       AND t.date >= CURRENT_DATE - 2`,
    [BIG_CHARGE_THRESHOLD]
  );
  for (const c of bigCharges) {
    if (await fire({
      dedupeKey: `big_charge:${c.id}`,
      title: `Large charge: ${c.merchant} $${Math.round(c.amount).toLocaleString()}`,
      body: `On ${c.account}. If this isn't yours, dispute it now.`,
      tone: 'amber', tag: 'Large charge', impact: `$${Math.round(c.amount).toLocaleString()}`, impactSub: c.merchant,
    })) fired++;
  }

  // 3. Bills due in the next 3 days (from cadence prediction)
  try {
    const cf = await cashflowProjection();
    const soon = cf.upcomingBills.filter(
      (b) => (new Date(b.date) - new Date(today)) / 864e5 <= 3 && b.amount >= 50
    );
    for (const b of soon) {
      if (await fire({
        dedupeKey: `bill_due:${b.merchant}:${b.date}`,
        title: `Bill expected: ${b.merchant} ~$${Math.round(b.amount)}`,
        body: `Predicted for ${b.date} based on its usual cadence.`,
        tone: 'accent', tag: 'Bill due', impact: `$${Math.round(b.amount)}`, impactSub: b.date,
      })) fired++;
    }
  } catch (err) { log.warn('bill-due alerts skipped', err); }

  // 4. Card credits expiring within 7 days with money left
  try {
    const credits = await creditsStatus();
    for (const c of credits.filter((x) => x.remaining > 0 && x.daysLeft <= 7)) {
      if (await fire({
        dedupeKey: `credit_expiry:${c.id}:${c.periodKey}`,
        title: `$${Math.round(c.remaining)} expiring: ${c.name}`,
        body: `${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} left in the ${c.period} window.`,
        tone: 'amber', tag: 'Credit expiring', impact: `$${Math.round(c.remaining)}`, impactSub: `${c.daysLeft}d left`,
      })) fired++;
    }
  } catch (err) { log.warn('credit alerts skipped', err); }

  // 5. Paycheck landed (Income deposit >= $1000 in last 2 days)
  const { rows: paychecks } = await q(
    `SELECT t.id, COALESCE(t.merchant_name, t.name) AS merchant, (-t.amount)::float AS amount
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE NOT t.removed AND a.type = 'depository' AND t.amount <= -1000
       AND t.category = 'Income' AND t.date >= CURRENT_DATE - 2`
  );
  for (const p of paychecks) {
    if (await fire({
      dedupeKey: `paycheck:${p.id}`,
      title: `Deposit landed: $${Math.round(p.amount).toLocaleString()}`,
      body: `${p.merchant}. Cash position updated on the Overview.`,
      tone: 'pos', tag: 'Deposit', impact: `+$${Math.round(p.amount).toLocaleString()}`, impactSub: p.merchant,
    })) fired++;
  }

  if (fired) log.info('alerts run complete', { fired });
  return fired;
}

// Morning briefing delivery — pushes the daily read to the configured channel.
export async function deliverBriefing(content) {
  const summary = content.length > 3500 ? content.slice(0, 3500) + '\n…(full briefing in the app)' : content;
  const channels = await deliver('☀️ Ledger morning briefing', summary);
  return channels;
}
