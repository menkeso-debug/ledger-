import { q } from '../db/pool.js';

// Debt command center: per-card terms, actual interest paid from the ledger,
// and an avalanche payoff simulation.

export async function interestPaidByMonth(months = 6) {
  const { rows } = await q(
    `SELECT to_char(date_trunc('month', t.date), 'YYYY-MM') AS month,
            SUM(t.amount)::float AS interest
     FROM transactions t
     WHERE NOT t.removed AND t.amount > 0
       AND (t.name ~* 'interest charge|purchase interest|interest charged|plan fee')
       AND t.date >= (date_trunc('month', CURRENT_DATE) - make_interval(months => $1))::date
     GROUP BY 1 ORDER BY 1`,
    [months]
  );
  return rows;
}

export async function debtOverview() {
  const { rows: cards } = await q(
    `SELECT id, name, tier, mask, current_balance::float AS balance,
            credit_limit::float, apr::float, min_payment::float
     FROM accounts WHERE type = 'credit' AND COALESCE(current_balance, 0) > 0
     ORDER BY apr DESC NULLS LAST, current_balance DESC`
  );
  const { rows: interestRows } = await q(
    `SELECT a.id AS account_id, SUM(t.amount)::float AS paid
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE NOT t.removed AND t.amount > 0
       AND (t.name ~* 'interest charge|purchase interest|interest charged|plan fee')
       AND t.date >= CURRENT_DATE - interval '30 days'
     GROUP BY 1`
  );
  const recentInterest = new Map(interestRows.map((r) => [r.account_id, r.paid]));

  const enriched = cards.map((c) => ({
    ...c,
    utilization: c.credit_limit > 0 ? Math.round((c.balance / c.credit_limit) * 100) : null,
    est_monthly_interest: c.apr != null ? +(c.balance * (c.apr / 100) / 12).toFixed(2) : null,
    interest_paid_30d: +(recentInterest.get(c.id) || 0).toFixed(2),
  }));

  const totalDebt = enriched.reduce((s, c) => s + c.balance, 0);
  const estMonthlyInterest = enriched.reduce((s, c) => s + (c.est_monthly_interest || 0), 0);
  const aprsMissing = enriched.filter((c) => c.apr == null).length;

  return {
    cards: enriched,
    totalDebt: +totalDebt.toFixed(2),
    estMonthlyInterest: +estMonthlyInterest.toFixed(2),
    actualInterestLast30d: +[...recentInterest.values()].reduce((s, v) => s + v, 0).toFixed(2),
    aprsMissing,
    interestByMonth: await interestPaidByMonth(6),
  };
}

// Avalanche simulation: minimums on everything, all extra budget to the
// highest-APR card. Cards without an APR assume `assumedApr` (flagged).
export function simulatePayoff(cards, monthlyBudget, assumedApr = 24.99) {
  const state = cards
    .filter((c) => c.balance > 0)
    .map((c) => ({
      id: c.id, name: c.name, tier: c.tier, mask: c.mask,
      balance: c.balance,
      apr: c.apr ?? assumedApr,
      aprAssumed: c.apr == null,
      minPayment: c.min_payment ?? null,
      paidOffMonth: null,
      interestPaid: 0,
    }))
    .sort((a, b) => b.apr - a.apr);

  const minFor = (c) => c.minPayment ?? Math.max(35, c.balance * 0.01 + (c.balance * c.apr / 100) / 12);
  const totalMins = state.reduce((s, c) => s + minFor(c), 0);
  const firstMonthInterest = state.reduce((s, c) => s + (c.balance * c.apr / 100) / 12, 0);
  if (monthlyBudget <= firstMonthInterest) {
    return {
      feasible: false,
      reason: `A ${Math.round(monthlyBudget)}/mo budget doesn't cover the ~${Math.round(firstMonthInterest)}/mo of interest — the balance would grow forever.`,
      minimumViableBudget: Math.ceil(Math.max(firstMonthInterest * 1.1, totalMins)),
    };
  }

  let months = 0;
  let totalInterest = 0;
  while (state.some((c) => c.balance > 0) && months < 600) {
    months++;
    let budget = monthlyBudget;
    // Accrue interest
    for (const c of state) {
      if (c.balance <= 0) continue;
      const interest = (c.balance * c.apr / 100) / 12;
      c.balance += interest;
      c.interestPaid += interest;
      totalInterest += interest;
    }
    // Minimums
    for (const c of state) {
      if (c.balance <= 0) continue;
      const pay = Math.min(minFor(c), c.balance, budget);
      c.balance -= pay;
      budget -= pay;
      if (c.balance <= 0.01 && c.paidOffMonth == null) { c.balance = 0; c.paidOffMonth = months; }
      if (budget <= 0) break;
    }
    // Avalanche the rest
    for (const c of state) {
      if (budget <= 0) break;
      if (c.balance <= 0) continue;
      const pay = Math.min(budget, c.balance);
      c.balance -= pay;
      budget -= pay;
      if (c.balance <= 0.01 && c.paidOffMonth == null) { c.balance = 0; c.paidOffMonth = months; }
    }
  }

  const done = new Date();
  done.setMonth(done.getMonth() + months);
  return {
    feasible: months < 600,
    months,
    debtFreeBy: done.toISOString().slice(0, 7),
    totalInterest: Math.round(totalInterest),
    order: state.map((c) => ({
      id: c.id, name: c.name, tier: c.tier, mask: c.mask, apr: +c.apr.toFixed(2),
      aprAssumed: c.aprAssumed,
      paidOffMonth: c.paidOffMonth,
      interestPaid: Math.round(c.interestPaid),
    })),
  };
}
