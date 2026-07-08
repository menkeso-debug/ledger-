import { anthropic, ADVISOR_SYSTEM } from './anthropic.js';
import { config } from '../config.js';
import { q } from '../db/pool.js';
import { log } from '../lib/log.js';
import {
  categoryMoM, merchantMoM, recurringCharges, categoryBaselines,
  netCashFlow, cardBalances,
} from '../analytics/rollups.js';
import { rewardsSummary } from '../rewards/engine.js';

// Snapshot of everything the briefing reasons over. Stored alongside the
// briefing for auditability.
export async function buildBriefingContext() {
  const [mom, merchants, recurring, baselines, cashFlow, owed, rewards, activeInsights, budgets] =
    await Promise.all([
      categoryMoM(),
      merchantMoM(100),
      recurringCharges(),
      categoryBaselines(),
      netCashFlow(),
      cardBalances(),
      rewardsSummary(),
      q(`SELECT kind, tag, title, body, impact, impact_sub FROM insights
         WHERE NOT dismissed ORDER BY created_at DESC LIMIT 20`).then((r) => r.rows),
      q('SELECT category, monthly_budget::float AS budget FROM budgets').then((r) => r.rows),
    ]);
  return {
    asOf: new Date().toISOString(),
    categoryMonthOverMonth: mom,
    topMerchants: merchants.slice(0, 20),
    recurringCharges: recurring,
    categoryBaselines: baselines,
    netCashFlowThisMonth: cashFlow,
    totalCardBalancesOwed: owed,
    rewards,
    budgets,
    activeInsightFlags: activeInsights,
  };
}

export async function generateBriefing() {
  const context = await buildBriefingContext();

  const stream = anthropic().messages.stream({
    model: config.anthropic.model,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system: ADVISOR_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Here is today's data snapshot (deterministic rollups from my real transactions, rewards engine output, and active analytics flags):

\`\`\`json
${JSON.stringify(context, null, 1)}
\`\`\`

Write my morning financial briefing. Structure:
1. One-line headline — the single most important thing today.
2. Where I'm overspending and what specifically to cut (merchants/subcategories with numbers).
3. Bills and recurring charges that changed or appeared.
4. Rewards & credits actions worth taking now (MQD pace, expiring card credits, points notes).
5. Net cash flow read.

Keep it tight — a two-minute read. Plain language, real numbers, markdown.`,
      },
    ],
  });

  const message = await stream.finalMessage();
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const { rows } = await q(
    `INSERT INTO briefings (content, model, input_snapshot)
     VALUES ($1, $2, $3) RETURNING id, created_at`,
    [text, config.anthropic.model, JSON.stringify(context)]
  );
  log.info('briefing generated', { id: rows[0].id, chars: text.length });
  return { id: rows[0].id, content: text, created_at: rows[0].created_at };
}

export async function latestBriefing() {
  const { rows } = await q(
    'SELECT id, content, model, created_at FROM briefings ORDER BY created_at DESC LIMIT 1'
  );
  return rows[0] || null;
}
