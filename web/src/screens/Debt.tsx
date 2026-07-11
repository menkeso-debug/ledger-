import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { Panel, Sk, Bar, FilledButton } from '../components/ui';
import { CardTile } from '../components/CardTile';
import type { Tier } from '../lib/types';

interface DebtCard {
  id: string; name: string; tier: Tier; mask: string | null;
  balance: number; credit_limit: number | null; apr: number | null; min_payment: number | null;
  utilization: number | null; est_monthly_interest: number | null; interest_paid_30d: number;
}
interface PayoffPlan {
  feasible: boolean; reason?: string; minimumViableBudget?: number;
  months?: number; debtFreeBy?: string; totalInterest?: number;
  order?: { id: string; name: string; tier: Tier; mask: string | null; apr: number; aprAssumed: boolean; paidOffMonth: number | null; interestPaid: number }[];
}
interface DebtData {
  cards: DebtCard[];
  totalDebt: number;
  estMonthlyInterest: number;
  actualInterestLast30d: number;
  aprsMissing: number;
  interestByMonth: { month: string; interest: number }[];
  plan: PayoffPlan | null;
  minOnly: PayoffPlan | null;
}

function TermsCell({ card, onSaved }: { card: DebtCard; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [apr, setApr] = useState(card.apr != null ? String(card.apr) : '');
  const [minPay, setMinPay] = useState(card.min_payment != null ? String(card.min_payment) : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/accounts/${card.id}/terms`, {
        apr: apr.trim() === '' ? null : Number(apr),
        min_payment: minPay.trim() === '' ? null : Number(minPay),
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <input
          autoFocus value={apr} onChange={(e) => setApr(e.target.value)} placeholder="APR %"
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="num"
          style={{ width: 64, fontSize: 13, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
        />
        <input
          value={minPay} onChange={(e) => setMinPay(e.target.value)} placeholder="Min $"
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="num"
          style={{ width: 64, fontSize: 13, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
        />
        <span onClick={save} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>
          {saving ? '…' : 'Save'}
        </span>
      </span>
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to set APR and minimum payment (from your card statement)"
      style={{ cursor: 'pointer', borderBottom: '1px dashed var(--hairline)', fontSize: 13.5 }}
      className="num"
    >
      {card.apr != null ? `${card.apr}% APR` : <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Set APR</span>}
      {card.min_payment != null && <span style={{ color: 'var(--text-3)' }}> · min {money(card.min_payment)}</span>}
    </span>
  );
}

export function Debt() {
  const [data, setData] = useState<DebtData | null>(null);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState<string>(() => localStorage.getItem('ledger-payoff-budget') || '3000');

  const load = async (withBudget = true) => {
    setLoading(true);
    try {
      const b = Number(budget.replace(/[$,\s]/g, ''));
      const qs = withBudget && b > 0 ? `?budget=${b}` : '';
      setData(await api.get<DebtData>(`/api/debt${qs}`));
      if (b > 0) localStorage.setItem('ledger-payoff-budget', String(b));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Sk h={120} style={{ borderRadius: 22 }} />
        <Sk h={300} style={{ borderRadius: 22 }} />
      </div>
    );
  }
  if (!data) return null;

  const maxInterest = Math.max(...data.interestByMonth.map((m) => m.interest), 1);
  const stat = (label: string, value: string, color?: string, sub?: string) => (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>{label}</div>
      <div className="num" style={{ fontSize: 'clamp(20px,2.2vw,26px)', fontWeight: 660, letterSpacing: '-0.02em', marginTop: 4, color: color || 'var(--text)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Hero stats + interest trend */}
      <Panel style={{ padding: '26px 28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,170px),1fr))', gap: 20, alignItems: 'start' }}>
          {stat('Total card debt', money(data.totalDebt), 'var(--neg)')}
          {stat('Interest paid · last 30d', money(data.actualInterestLast30d), 'var(--amber)', 'from your actual charges')}
          {data.estMonthlyInterest > 0
            ? stat('Est. interest / mo at your APRs', money(data.estMonthlyInterest), 'var(--amber)', data.aprsMissing ? `${data.aprsMissing} card${data.aprsMissing > 1 ? 's' : ''} missing APR` : undefined)
            : stat('Est. interest / mo', '—', undefined, 'set APRs below to compute')}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500, marginBottom: 6 }}>Interest &amp; fees by month</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 54 }}>
              {data.interestByMonth.map((m) => (
                <div key={m.month} style={{ textAlign: 'center', flex: 1 }} title={`${m.month}: ${money(m.interest)}`}>
                  <div style={{ height: Math.max((m.interest / maxInterest) * 44, 2), background: 'var(--amber)', opacity: 0.75, borderRadius: 3 }} />
                  <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 3 }}>
                    {new Date(m.month + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* Per-card table, avalanche-ordered */}
      <Panel style={{ overflow: 'hidden' }}>
        <div style={{ padding: '15px 24px', borderBottom: '1px solid var(--hairline)', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Cards · avalanche order (highest APR first) — click terms to edit
        </div>
        {data.cards.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px', borderBottom: '1px solid var(--hairline-2)', flexWrap: 'wrap' }}>
            <CardTile tier={c.tier} height={44} width={70} mini />
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{/^credit card$/i.test(c.name) ? `Card ···${c.mask}` : c.name}</div>
              <TermsCell card={c} onSaved={() => load()} />
            </div>
            <div style={{ width: 130 }}>
              {c.utilization != null && (
                <>
                  <Bar pct={c.utilization} over={c.utilization > 90} width={120} />
                  <div className="num" style={{ fontSize: 11, color: c.utilization > 30 ? 'var(--amber)' : 'var(--text-3)', marginTop: 4 }}>
                    {c.utilization}% utilized
                  </div>
                </>
              )}
            </div>
            <div style={{ textAlign: 'right', minWidth: 110 }}>
              <div className="num" style={{ fontSize: 16, fontWeight: 650 }}>{money(c.balance)}</div>
              <div className="num" style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 2 }}>
                {c.est_monthly_interest != null ? `~${money(c.est_monthly_interest)}/mo interest` : c.interest_paid_30d > 0 ? `${money(c.interest_paid_30d)} interest 30d` : ''}
              </div>
            </div>
          </div>
        ))}
      </Panel>

      {/* Payoff plan */}
      <Panel style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Avalanche payoff plan</div>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>If I put</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            className="num"
            style={{ width: 90, fontSize: 14, fontWeight: 600, padding: '6px 10px', borderRadius: 10, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--text)', outline: 'none', textAlign: 'right' }}
          />
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>/month toward cards →</span>
          <FilledButton onClick={() => load()}>{loading ? 'Computing…' : 'Compute'}</FilledButton>
        </div>

        {data.plan && !data.plan.feasible && (
          <div style={{ fontSize: 13.5, color: 'var(--neg)', fontWeight: 500 }}>
            {data.plan.reason} Minimum workable budget: <span className="num">{money(data.plan.minimumViableBudget || 0)}</span>/mo.
          </div>
        )}

        {data.plan?.feasible && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))', gap: 18, marginBottom: 16 }}>
              {stat('Debt-free by', new Date(data.plan.debtFreeBy + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), 'var(--pos)')}
              {stat('Months', String(data.plan.months))}
              {stat('Total interest on this plan', money(data.plan.totalInterest || 0), 'var(--amber)')}
              {data.minOnly?.feasible && data.minOnly.totalInterest != null && data.plan.totalInterest != null &&
                stat('Saved vs minimum payments', money(Math.max(data.minOnly.totalInterest - data.plan.totalInterest, 0)), 'var(--pos)', `min-only takes ${data.minOnly.months} months`)}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
              Payoff order
            </div>
            {data.plan.order?.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--hairline-2)' }}>
                <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', width: 20 }}>{i + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 550, flex: 1 }}>
                  {/^credit card$/i.test(c.name) ? `Card ···${c.mask}` : c.name}
                  <span className="num" style={{ fontSize: 12, color: c.aprAssumed ? 'var(--amber)' : 'var(--text-3)', fontWeight: 500 }}>
                    {' '}· {c.apr}%{c.aprAssumed ? ' (assumed — set the real APR)' : ''}
                  </span>
                </span>
                <span className="num" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  paid off month {c.paidOffMonth ?? '—'} · {money(c.interestPaid)} interest
                </span>
              </div>
            ))}
          </>
        )}
        {!data.plan && (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Enter a monthly amount and hit Compute. Set each card's real APR above first — the plan assumes 24.99% for any card without one.
          </div>
        )}
      </Panel>
    </div>
  );
}
