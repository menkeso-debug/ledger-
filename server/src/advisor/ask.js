import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { anthropic, ADVISOR_SYSTEM } from './anthropic.js';
import { config } from '../config.js';
import { q } from '../db/pool.js';
import {
  categoryMoM, subcategoryMoM, merchantMoM, recurringCharges,
  categoryBaselines, netCashFlow, categorySpendForMonth, cashflowProjection, monthlyPnl,
} from '../analytics/rollups.js';
import { rewardsSummary } from '../rewards/engine.js';

// On-demand Q&A: the model reasons over real numbers via a fixed set of
// read-only query tools. No model-authored SQL ever touches Postgres.

const asJson = (v) => JSON.stringify(v);

const tools = [
  betaTool({
    name: 'spend_by_category',
    description:
      'Total spend grouped by category and subcategory for a calendar month. month format YYYY-MM; defaults to the current month.',
    inputSchema: {
      type: 'object',
      properties: { month: { type: 'string', description: 'YYYY-MM' } },
      additionalProperties: false,
    },
    run: async ({ month }) => {
      const start = month ? `${month}-01` : `${new Date().toISOString().slice(0, 7)}-01`;
      return asJson(await categorySpendForMonth(start));
    },
  }),
  betaTool({
    name: 'category_month_over_month',
    description:
      'Per-category spend this month vs the same day-span last month, with % change. Optionally drill into subcategories of one category.',
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string', description: 'Drill into this category' } },
      additionalProperties: false,
    },
    run: async ({ category }) =>
      asJson(category ? await subcategoryMoM(category) : await categoryMoM()),
  }),
  betaTool({
    name: 'search_transactions',
    description:
      'Search individual transactions by merchant text, category, date range, or minimum amount. Returns newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring match on merchant/description' },
        category: { type: 'string' },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        min_amount: { type: 'number' },
        limit: { type: 'integer', description: 'Default 50, max 200' },
      },
      additionalProperties: false,
    },
    run: async ({ query, category, from, to, min_amount, limit }) => {
      const params = [];
      const where = ['NOT t.removed'];
      if (query) { params.push(`%${query}%`); where.push(`(t.merchant_name ILIKE $${params.length} OR t.name ILIKE $${params.length})`); }
      if (category) { params.push(category); where.push(`t.category = $${params.length}`); }
      if (from) { params.push(from); where.push(`t.date >= $${params.length}::date`); }
      if (to) { params.push(to); where.push(`t.date <= $${params.length}::date`); }
      if (min_amount != null) { params.push(min_amount); where.push(`t.amount >= $${params.length}`); }
      params.push(Math.min(limit || 50, 200));
      const { rows } = await q(
        `SELECT t.date, COALESCE(t.merchant_name, t.name) AS merchant, t.amount::float AS amount,
                t.category, t.subcategory, t.pending, a.name AS account
         FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE ${where.join(' AND ')}
         ORDER BY t.date DESC LIMIT $${params.length}`,
        params
      );
      return asJson(rows);
    },
  }),
  betaTool({
    name: 'recurring_charges',
    description:
      'Detected recurring charges (subscriptions/bills): typical amount, cadence, latest amount, and % change vs usual.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => asJson(await recurringCharges()),
  }),
  betaTool({
    name: 'category_baselines',
    description:
      'Current-month projected spend per category vs the rolling 3-month average, with % over/under baseline.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => asJson(await categoryBaselines()),
  }),
  betaTool({
    name: 'top_merchants',
    description: 'Top merchants by spend this month with month-over-month change.',
    inputSchema: {
      type: 'object',
      properties: { min_spend: { type: 'number', description: 'Default 100' } },
      additionalProperties: false,
    },
    run: async ({ min_spend }) => asJson(await merchantMoM(min_spend ?? 100)),
  }),
  betaTool({
    name: 'monthly_pnl',
    description:
      'Household P&L: per-month income vs personal spend (Business/Transfer excluded) with net, for the last N months. The profitability trend.',
    inputSchema: {
      type: 'object',
      properties: { months: { type: 'integer', description: 'Default 6, max 24' } },
      additionalProperties: false,
    },
    run: async ({ months }) => asJson(await monthlyPnl(Math.min(months || 6, 24))),
  }),
  betaTool({
    name: 'cash_flow_projection',
    description:
      '30-day forward cash flow: detected income streams (salary cadence + predicted next paydays), upcoming recurring bills, discretionary run-rate, projected spend vs expected income, and whether the user is on track.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => asJson(await cashflowProjection()),
  }),
  betaTool({
    name: 'rewards_state',
    description:
      'Full rewards picture: MQD pace toward Delta status with driver breakdown, points earned per card this month, card-credit usage/expiry, and manual point balances.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => asJson(await rewardsSummary()),
  }),
  betaTool({
    name: 'account_balances',
    description: 'Current balances for all connected accounts (cards + checking) and net cash flow this month.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const { rows } = await q(
        `SELECT name, type, subtype, mask, tier, current_balance::float, available_balance::float,
                credit_limit::float, balances_updated_at
         FROM accounts ORDER BY type, name`
      );
      return asJson({ accounts: rows, netCashFlowThisMonth: await netCashFlow() });
    },
  }),
];

export async function ask(question, history = []) {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  const runner = anthropic().beta.messages.toolRunner({
    model: config.anthropic.model,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system: `${ADVISOR_SYSTEM}

Answer the user's question by querying their real data with the tools provided. Query before answering — never estimate what a tool can tell you exactly. Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    tools,
    messages,
    max_iterations: 12,
  });

  const finalMessage = await runner;
  const text = finalMessage.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return { answer: text };
}
