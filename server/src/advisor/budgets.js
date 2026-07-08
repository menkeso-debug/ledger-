import { anthropic, ADVISOR_SYSTEM } from './anthropic.js';
import { config } from '../config.js';
import { q } from '../db/pool.js';
import { monthlyCategoryHistory, incomeStreams, recurringCharges } from '../analytics/rollups.js';

const BUDGET_SCHEMA = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Two-to-four sentence plain-language explanation of the overall plan: total budget, savings margin, and where the cuts are.',
      },
      income_reasoning: {
        type: 'string',
        description: 'How monthly income was derived: name each stream, its cadence, the per-deposit amount, and the monthly-equivalent math (e.g. "$9,425 biweekly × 26 / 12 ≈ $20,421/mo").',
      },
      income_breakdown: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            cadence: { type: 'string' },
            per_deposit: { type: 'number' },
            monthly_equivalent: { type: 'number' },
          },
          required: ['source', 'cadence', 'per_deposit', 'monthly_equivalent'],
          additionalProperties: false,
        },
      },
      monthly_income_estimate: { type: 'number' },
      total_budget: { type: 'number' },
      budgets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            monthly_budget: { type: 'number' },
            rationale: { type: 'string', description: 'One short sentence: why this number.' },
          },
          required: ['category', 'monthly_budget', 'rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'income_reasoning', 'income_breakdown', 'monthly_income_estimate', 'total_budget', 'budgets'],
    additionalProperties: false,
  },
};

export async function suggestBudgets() {
  const [history, income, recurring, current] = await Promise.all([
    monthlyCategoryHistory(6),
    incomeStreams(),
    recurringCharges(),
    q('SELECT category, monthly_budget::float AS budget FROM budgets').then((r) => r.rows),
  ]);

  const stream = anthropic().messages.stream({
    model: config.anthropic.model,
    max_tokens: 3000,
    system: ADVISOR_SYSTEM,
    output_config: { format: BUDGET_SCHEMA },
    messages: [
      {
        role: 'user',
        content: `Propose monthly budgets per spending category based on my real behavior.

Data:
- Per-category spend by month (last full months): ${JSON.stringify(history)}
- Detected income streams (active = still depositing; ended streams are history only): ${JSON.stringify(income.map(s => ({ merchant: s.merchant, cadence: s.cadence, typicalAmount: s.typicalAmount, active: s.active, lastDeposit: s.lastDate })))}
- Recurring commitments: ${JSON.stringify(recurring.map(r => ({ merchant: r.merchant, monthly: Math.round(r.monthly_cost) })))}
- Current budgets (placeholder defaults, being replaced): ${JSON.stringify(current)}

Rules:
- Estimate monthly income from ACTIVE detected streams only (biweekly ≈ amount × 26/12, weekly × 52/12, monthly × 1). Show your math per stream in income_breakdown and income_reasoning.
- Base each category on its median month, not the max. Fixed costs (Housing) budget at actual. For categories trending high or clearly discretionary, set the budget slightly BELOW the median to create pressure. Each category's rationale must cite the numbers it came from (e.g. "median $520/mo over 5 months, trimmed 10%").
- Leave a savings margin: total budget should come in around 80–90% of monthly income. If spending exceeds income, prioritize cuts in the most discretionary categories and be explicit about it.
- Only budget categories that appear in the data. Skip Income and Transfer. Round to sensible figures.`,
      },
    ],
  });
  const message = await stream.finalMessage();
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const proposal = JSON.parse(text);

  // Hard guarantee, independent of the model: total budget never exceeds 90%
  // of estimated income. Fixed Housing is preserved; everything else scales.
  const estIncome = proposal.monthly_income_estimate || 0;
  const cap = estIncome * 0.9;
  let total = proposal.budgets.reduce((s, b) => s + b.monthly_budget, 0);
  if (estIncome > 0 && total > cap) {
    const housing = proposal.budgets.find((b) => b.category === 'Housing')?.monthly_budget || 0;
    const scalable = total - housing;
    const factor = Math.max((cap - housing) / Math.max(scalable, 1), 0.1);
    for (const b of proposal.budgets) {
      if (b.category !== 'Housing') b.monthly_budget = Math.round(b.monthly_budget * factor);
    }
    total = proposal.budgets.reduce((s, b) => s + b.monthly_budget, 0);
    proposal.summary += ` (Adjusted: proposed totals exceeded 90% of income, so non-housing budgets were scaled down to fit.)`;
  }
  proposal.total_budget = Math.round(total);
  return proposal;
}
