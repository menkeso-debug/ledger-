import { useState } from 'react';
import { useStore } from '../store';
import { useNav } from '../App';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { Panel, ChangeChip, Sk, EmptyState, Bar, FilledButton, OutlineButton } from '../components/ui';

const GRID: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 130px', gap: 16, alignItems: 'center',
};

interface BudgetProposal {
  summary: string;
  income_reasoning: string;
  income_breakdown: { source: string; cadence: string; per_deposit: number; monthly_equivalent: number }[];
  monthly_income_estimate: number;
  total_budget: number;
  budgets: { category: string; monthly_budget: number; rationale: string }[];
}

function BudgetAdvisor() {
  const { refresh, categories } = useStore();
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<BudgetProposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentByCat = new Map((categories.data || []).map((c) => [c.name, c.budget]));

  const suggest = async () => {
    setBusy(true);
    setError(null);
    try {
      setProposal(await api.post<BudgetProposal>('/api/budgets/suggest'));
    } catch {
      setError('Suggestion failed — needs at least a month of transaction history.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!proposal) return;
    setApplying(true);
    try {
      await api.post('/api/budgets/apply', { budgets: proposal.budgets });
      await refresh();
      setProposal(null);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {!proposal && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <FilledButton onClick={suggest} disabled={busy}>
            {busy ? 'Analyzing your behavior…' : '✦ Suggest budgets from my behavior'}
          </FilledButton>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            Reads your income streams and 6 months of spending, proposes a budget per category. Click any budget figure below to edit it manually.
          </span>
          {error && <span style={{ fontSize: 12.5, color: 'var(--neg)' }}>{error}</span>}
        </div>
      )}
      {proposal && (
        <Panel style={{ borderRadius: 18, padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '2px 8px', borderRadius: 6, color: 'var(--accent)', background: 'var(--accent-soft)' }}>
              Proposed budgets
            </span>
            <span className="num" style={{ fontSize: 12, color: 'var(--text-3)' }}>
              income ~{money(proposal.monthly_income_estimate)}/mo · total budget {money(proposal.total_budget)}
            </span>
          </div>
          {/* Income derivation — the basis the user is approving */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--hairline-2)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
              How income was calculated
            </div>
            {proposal.income_breakdown?.map((s, i) => (
              <div key={i} className="num" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '4px 0', color: 'var(--text-2)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.source} · {money(s.per_deposit)} {s.cadence}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>≈ {money(s.monthly_equivalent)}/mo</span>
              </div>
            ))}
            <div className="num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 8, marginTop: 4, borderTop: '1px solid var(--hairline-2)', fontWeight: 600 }}>
              <span>Monthly income basis</span>
              <span>{money(proposal.monthly_income_estimate)}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 8 }}>{proposal.income_reasoning}</div>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 14 }}>{proposal.summary}</div>
          {proposal.budgets.map((b) => {
            const cur = currentByCat.get(b.category);
            return (
              <div key={b.category} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--hairline-2)' }}>
                <span style={{ fontSize: 14, fontWeight: 550, width: 120, flexShrink: 0 }}>{b.category}</span>
                <span className="num" style={{ fontSize: 14, fontWeight: 600, width: 150, flexShrink: 0 }}>
                  {cur != null && <span style={{ color: 'var(--text-3)', textDecoration: 'line-through', fontWeight: 500 }}>{money(cur)}</span>}
                  {' '}→ {money(b.monthly_budget)}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.4 }}>{b.rationale}</span>
              </div>
            );
          })}
          <div className="num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600, padding: '12px 0 0' }}>
            <span>Total budget {money(proposal.total_budget)} of {money(proposal.monthly_income_estimate)} income</span>
            <span style={{ color: 'var(--pos)' }}>
              → {money(Math.max(proposal.monthly_income_estimate - proposal.total_budget, 0))}/mo savings margin
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <FilledButton onClick={apply} disabled={applying}>{applying ? 'Applying…' : 'Apply these budgets'}</FilledButton>
            <OutlineButton onClick={() => setProposal(null)}>Discard</OutlineButton>
          </div>
        </Panel>
      )}
    </div>
  );
}

// North-star strip: total spent vs total budget across all categories.
function TotalBudgetBar() {
  const { overview, categories } = useStore();
  const ov = overview.data;
  if (!ov || overview.status !== 'ready') return null;
  const budgeted = (categories.data ?? []).filter((c) => c.budget != null);
  const over = ov.spent.total > ov.spent.budget;
  const pct = Math.min(100, Math.round((ov.spent.total / ov.spent.budget) * 100));
  return (
    <Panel style={{ padding: '18px 24px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          Total budget
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
            {' '}· {budgeted.length} categor{budgeted.length === 1 ? 'y' : 'ies'} budgeted
          </span>
        </div>
        <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>
          {money(ov.spent.total)}
          <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> of {money(ov.spent.budget)}</span>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Bar pct={pct} over={over} height={8} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 12, color: over ? 'var(--neg)' : 'var(--text-3)' }}>
          <span>{Math.round((ov.spent.total / ov.spent.budget) * 100)}% used</span>
          <span className="num">
            {over
              ? `${money(ov.spent.total - ov.spent.budget)} over budget`
              : `${money(ov.spent.budget - ov.spent.total)} left this month`}
          </span>
        </div>
      </div>
    </Panel>
  );
}

const RESERVED = ['Income', 'Transfer', 'Business', 'Other'];

// Click a category's name to rename it — moves every transaction, budget,
// and merchant rule under the new name.
function CategoryName({ name }: { name: string }) {
  const { renameCategory } = useStore();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const reserved = RESERVED.includes(name);

  const save = async () => {
    const to = value.trim();
    if (!to || to === name) return setEditing(false);
    setSaving(true);
    try {
      await renameCategory(name, to);
      setEditing(false);
    } catch {
      setValue(name);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(name); setEditing(false); } }}
        onBlur={save}
        maxLength={40}
        style={{
          fontSize: 15, fontWeight: 600, width: 150,
          border: '1px solid var(--accent)', borderRadius: 8, padding: '3px 8px',
          background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
        }}
      />
    );
  }
  return (
    <span
      onClick={(e) => {
        if (reserved) return;
        e.stopPropagation();
        setValue(name);
        setEditing(true);
      }}
      title={reserved ? `"${name}" is reserved` : 'Click to rename category'}
      style={{
        fontSize: 15, fontWeight: 600, cursor: reserved ? 'default' : 'pointer',
        borderBottom: reserved ? 'none' : '1px dashed transparent', opacity: saving ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!reserved) e.currentTarget.style.borderBottomColor = 'var(--hairline)'; }}
      onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = 'transparent')}
    >
      {saving ? 'Renaming…' : name}
    </span>
  );
}

function BudgetCell({ category, spend, budget }: { category: string; spend: number; budget: number | null }) {
  const { refresh } = useStore();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = Number(value.replace(/[$,\s]/g, ''));
    if (Number.isNaN(n)) return setEditing(false);
    setSaving(true);
    try {
      await api.put('/api/budgets', { category, monthly_budget: n });
      await refresh();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="num"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          style={{
            width: 90, fontSize: 13, fontWeight: 600, textAlign: 'right',
            border: '1px solid var(--accent)', borderRadius: 8, padding: '4px 8px',
            background: 'var(--surface)', color: 'var(--text)', outline: 'none',
          }}
        />
        <span onClick={save} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>
          {saving ? '…' : 'Save'}
        </span>
      </span>
    );
  }

  const over = budget != null && spend > budget;
  const pct = budget ? Math.min(100, Math.round((spend / budget) * 100)) : 0;
  return (
    <span
      onClick={(e) => { e.stopPropagation(); setValue(budget != null ? String(budget) : ''); setEditing(true); }}
      title="Click to edit budget"
      style={{ cursor: 'pointer', display: 'inline-block' }}
    >
      {budget != null ? (
        <>
          <Bar pct={pct} over={over} width={120} />
          <span className="num" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5, display: 'block', borderBottom: '1px dashed var(--hairline)', width: 'fit-content' }}>
            {money(spend)} / {money(budget)}
          </span>
        </>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--text-3)', borderBottom: '1px dashed var(--hairline)' }}>Set budget</span>
      )}
    </span>
  );
}

export function Categories() {
  const { categories } = useStore();
  const { go } = useNav();
  const [open, setOpen] = useState<Record<string, boolean>>({ Dining: true });

  return (
    <div>
    <TotalBudgetBar />
    <BudgetAdvisor />
    <Panel style={{ overflow: 'hidden' }}>
      {/* Header row */}
      <div
        className="catgrid"
        style={{
          ...GRID, padding: '15px 24px', borderBottom: '1px solid var(--hairline)',
          fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        <span>Category</span>
        <span style={{ textAlign: 'right' }}>Spent</span>
        <span className="catbudget">Budget</span>
        <span style={{ textAlign: 'right' }}>vs last mo.</span>
      </div>

      {categories.status === 'loading' &&
        [1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ padding: '16px 24px', borderBottom: '1px solid var(--hairline-2)' }}>
            <Sk h={20} />
          </div>
        ))}

      {categories.status !== 'loading' && !categories.data?.length && (
        <EmptyState
          icon="◫"
          tint="neutral"
          title="No spending yet"
          body="Once transactions sync, your categorized spending appears here with budgets and month-over-month change."
        />
      )}

      {categories.data?.map((c) => {
        const isOpen = !!open[c.name];
        const over = c.budget != null && c.spend > c.budget;
        const pct = c.budget ? Math.min(100, Math.round((c.spend / c.budget) * 100)) : 0;
        return (
          <div key={c.name}>
            <div
              className="catgrid"
              onClick={() => setOpen((s) => ({ ...s, [c.name]: !s[c.name] }))}
              style={{ ...GRID, padding: '16px 24px', cursor: 'pointer', borderBottom: '1px solid var(--hairline-2)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    display: 'inline-block', fontSize: 16, color: 'var(--text-3)',
                    transition: 'transform .2s', transform: `rotate(${isOpen ? 90 : 0}deg)`,
                  }}
                >
                  ›
                </span>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--text-3)', opacity: 0.5 }} />
                <CategoryName name={c.name} />
              </div>
              <span
                className="num"
                title={`See ${c.name} transactions`}
                onClick={(e) => { e.stopPropagation(); go('transactions', { category: c.name }); }}
                style={{ fontSize: 15, fontWeight: 600, textAlign: 'right', cursor: 'pointer', textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: 'var(--hairline)', textUnderlineOffset: 3 }}
              >
                {money(c.spend)}
              </span>
              <div className="catbudget">
                <BudgetCell category={c.name} spend={c.spend} budget={c.budget} />
              </div>
              <span style={{ textAlign: 'right' }}>
                <ChangeChip pct={c.momPct} invert />
              </span>
            </div>
            {isOpen && (
              <div style={{ background: 'var(--surface-2)', boxShadow: 'inset 3px 0 0 rgba(10,132,255,0.28)' }}>
                {c.subs.map((s) => (
                  <div
                    key={s.name}
                    className="catgrid"
                    onClick={() => go('transactions', { category: c.name, subcategory: s.name })}
                    title={`See ${s.name} transactions`}
                    style={{ ...GRID, padding: '13px 24px 13px 60px', borderBottom: '1px solid var(--hairline-2)', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 450 }}>{s.name} <span style={{ color: 'var(--text-3)' }}>›</span></span>
                    <span className="num" style={{ fontSize: 14, fontWeight: 500, textAlign: 'right', color: 'var(--text-2)' }}>
                      {money(s.spend)}
                    </span>
                    <span className="catbudget" style={{ fontSize: 13, color: 'var(--text-3)' }} />
                    <span style={{ textAlign: 'right' }}>
                      <ChangeChip pct={s.momPct} invert />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Panel>
    </div>
  );
}
