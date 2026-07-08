import { useState } from 'react';
import { useStore } from '../store';
import { money } from '../lib/format';
import { Panel, ChangeChip, Sk, EmptyState, Bar } from '../components/ui';

const GRID: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 130px', gap: 16, alignItems: 'center',
};

export function Categories() {
  const { categories } = useStore();
  const [open, setOpen] = useState<Record<string, boolean>>({ Dining: true });

  return (
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
                <span style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</span>
              </div>
              <span className="num" style={{ fontSize: 15, fontWeight: 600, textAlign: 'right' }}>{money(c.spend)}</span>
              <div className="catbudget">
                {c.budget != null ? (
                  <>
                    <Bar pct={pct} over={over} width={120} />
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
                      {money(c.spend)} / {money(c.budget)}
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No budget</span>
                )}
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
                    style={{ ...GRID, padding: '13px 24px 13px 60px', borderBottom: '1px solid var(--hairline-2)' }}
                  >
                    <span style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 450 }}>{s.name}</span>
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
  );
}
