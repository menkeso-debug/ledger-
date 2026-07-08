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
        description: 'Two-to-four sentence plain-language explanation of the overall plan: income basis, total budget, savings margin, and where the cuts are.',
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
    required: ['summary', 'monthly_income_estimate', 'total_budget', 'budgets'],
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
- Detected income streams (cadence + typical amount): ${JSON.stringify(income.map(s => ({ merchant: s.merchant, cadence: s.cadence, typicalAmount: s.typicalAmount })))}
- Recurring commitments: ${JSON.stringify(recurring.map(r => ({ merchant: r.merchant, monthly: Math.round(r.monthly_cost) })))}
- Current budgets (placeholder defaults, being replaced): ${JSON.stringify(current)}

Rules:
- Estimate monthly income from the detected streams (biweekly ≈ amount × 26/12, weekly × 52/12, monthly × 1).
- Base each category on its median month, not the max. Fixed costs (Housing) budget at actual. For categories trending high or clearly discretionary, set the budget slightly BELOW the median to create pressure — say so in the rationale.
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
  const income = proposal.monthly_income_estimate || 0;
  const cap = income * 0.9;
  let total = proposal.budgets.reduce((s, b) => s + b.monthly_budget, 0);
  if (income > 0 && total > cap) {
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
