import { anthropic, ADVISOR_SYSTEM } from './anthropic.js';
import { config } from '../config.js';
import { q } from '../db/pool.js';
import { log } from '../lib/log.js';
import { recurringCharges } from '../analytics/rollups.js';

// Proactive category audit: finds suspiciously-bucketed merchants (dumped in
// "Other"/"Uncategorized", or one-off charges sitting under Subscriptions),
// asks the advisor to classify them, and auto-applies high-confidence fixes
// as merchant rules. User overrides are never touched. Runs with the daily
// cron and on demand — this is the "don't wait for me to ask" loop.

const ALLOWED = [
  'Housing', 'Travel', 'Dining', 'Groceries', 'Shopping', 'Subscriptions',
  'Kids', 'Transport', 'Health', 'Entertainment', 'Business', 'Income', 'Transfer', 'Other',
];

const AUDIT_SCHEMA = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      fixes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            merchant: { type: 'string' },
            category: { type: 'string', enum: ALLOWED },
            subcategory: { type: 'string' },
            confidence: { type: 'number', description: '0-1; only >= 0.8 gets auto-applied' },
            reason: { type: 'string' },
          },
          required: ['merchant', 'category', 'subcategory', 'confidence', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['fixes'],
    additionalProperties: false,
  },
};

export async function auditCategories() {
  const recurring = await recurringCharges();
  const billMerchants = recurring.filter((r) => r.is_bill).map((r) => r.merchant.toLowerCase());

  // Suspicious merchants — skipping anything the user already ruled on.
  const { rows: suspects } = await q(
    `SELECT COALESCE(t.merchant_name, t.name) AS merchant,
            MODE() WITHIN GROUP (ORDER BY t.category) AS category,
            MODE() WITHIN GROUP (ORDER BY t.subcategory) AS subcategory,
            COUNT(*)::int AS n, SUM(t.amount)::float AS total,
            MAX(t.name) AS sample_description
     FROM transactions t
     WHERE NOT t.removed AND t.amount > 0
       AND t.date >= CURRENT_DATE - interval '4 months'
       AND (t.category = 'Other' OR t.subcategory = 'Uncategorized' OR t.category = 'Subscriptions')
       AND NOT EXISTS (
         SELECT 1 FROM category_overrides o
         WHERE o.merchant_key = lower(COALESCE(t.merchant_name, t.name))
       )
     GROUP BY 1
     HAVING SUM(t.amount) >= 20
     ORDER BY total DESC
     LIMIT 40`
  );

  const candidates = suspects.filter(
    (s) => !(s.category === 'Subscriptions' && billMerchants.includes(s.merchant.toLowerCase()))
  );
  if (!candidates.length) return { reviewed: 0, applied: 0, fixes: [] };

  const stream = anthropic().messages.stream({
    model: config.anthropic.model,
    max_tokens: 3000,
    system: ADVISOR_SYSTEM,
    output_config: { format: AUDIT_SCHEMA },
    messages: [
      {
        role: 'user',
        content: `Audit these merchant categorizations from my transaction data. Each is either dumped in Other/Uncategorized or sitting under Subscriptions without being a recurring bill.

${JSON.stringify(candidates, null, 1)}

Classify each merchant into the correct category (${ALLOWED.join(', ')}). Guidance:
- Theme parks, museums, events, arcades → Entertainment (or Kids if clearly child-focused).
- Schools, daycare, kids' activities/sports (e.g. youth soccer) → Kids.
- Interest charges, bank fees → Other with subcategory "Fees & interest".
- Marketplaces used for reselling inventory (auction/collectibles platforms) → Business only if clearly resale-scale.
- Keep a merchant where it is (same category, confidence < 0.8) when genuinely ambiguous — do not guess.`,
      },
    ],
  });
  const message = await stream.finalMessage();
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const { fixes } = JSON.parse(text);

  const applied = [];
  for (const f of fixes) {
    const current = candidates.find((c) => c.merchant.toLowerCase() === f.merchant.toLowerCase());
    if (!current || f.confidence < 0.8 || !ALLOWED.includes(f.category)) continue;
    if (current.category === f.category && current.subcategory === f.subcategory) continue;
    const key = f.merchant.trim().toLowerCase();
    await q(
      `INSERT INTO category_overrides (merchant_key, category, subcategory)
       VALUES ($1, $2, $3) ON CONFLICT (merchant_key) DO NOTHING`,
      [key, f.category, f.subcategory]
    );
    await q(
      `UPDATE transactions SET category = $2, subcategory = $3, updated_at = now()
       WHERE lower(COALESCE(merchant_name, name)) = $1`,
      [key, f.category, f.subcategory]
    );
    applied.push({ merchant: f.merchant, to: `${f.category}/${f.subcategory}`, reason: f.reason });
  }

  if (applied.length) {
    const listing = applied.slice(0, 6).map((a) => `${a.merchant} → ${a.to}`).join('; ');
    await q(
      `INSERT INTO insights (kind, tone, tag, title, body, impact, impact_sub, cta, dedupe_key, data)
       VALUES ('auto_recat', 'accent', 'Auto-tidied', $1, $2, $3, 'merchants fixed', 'Review transactions', $4, $5)
       ON CONFLICT (dedupe_key) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body,
         impact = EXCLUDED.impact, data = EXCLUDED.data, dismissed = false, updated_at = now()`,
      [
        `Recategorized ${applied.length} merchant${applied.length > 1 ? 's' : ''} automatically`,
        `${listing}${applied.length > 6 ? ` and ${applied.length - 6} more` : ''}. Click any category pill on the Transactions screen to correct one.`,
        String(applied.length),
        `auto_recat:${new Date().toISOString().slice(0, 10)}`,
        JSON.stringify({ applied }),
      ]
    );
  }

  log.info('category audit', { reviewed: candidates.length, applied: applied.length });
  return { reviewed: candidates.length, applied: applied.length, fixes: applied };
}
