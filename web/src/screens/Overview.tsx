import { useStore } from '../store';
import { useNav } from '../App';
import { money } from '../lib/format';
import { Panel, ChangeChip, Sk, FilledButton, OutlineButton, Bar } from '../components/ui';
import { CardTile } from '../components/CardTile';
import { SpendChart } from '../components/SpendChart';
import { PlaidLinkButton } from '../components/PlaidLinkButton';

export function Overview() {
  const { overview, accounts, briefing } = useStore();
  const { go } = useNav();
  const ov = overview.data;
  const isLoading = overview.status === 'loading';
  const isEmpty = overview.status === 'empty' || overview.status === 'error';

  const [dollars, cents] = ov
    ? money(ov.netCash, 2).split('.')
    : ['$0', '00'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* ---- Hero row ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 22 }}>
        {/* Net cash card */}
        <Panel style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>Net cash available</div>
            {isLoading ? (
              <Sk w="60%" h={52} style={{ marginTop: 8 }} />
            ) : (
              <div className="num" style={{ fontSize: 'clamp(38px,9vw,52px)', fontWeight: 680, letterSpacing: '-0.035em', marginTop: 8, lineHeight: 1 }}>
                {dollars}
                <span style={{ fontSize: 26, color: 'var(--text-3)', fontWeight: 600 }}>.{cents}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              {ov && ov.netCashChange.pct != null && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600,
                    color: ov.netCashChange.amount >= 0 ? 'var(--pos)' : 'var(--neg)',
                    background: ov.netCashChange.amount >= 0 ? 'var(--pos-soft)' : 'var(--neg-soft)',
                    padding: '3px 9px', borderRadius: 20,
                  }}
                >
                  {ov.netCashChange.amount >= 0 ? '↑' : '↓'} {Math.abs(ov.netCashChange.pct)}%
                </span>
              )}
              {ov && (
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  {ov.netCashChange.amount >= 0 ? '+' : '−'}{money(Math.abs(ov.netCashChange.amount))} this month
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 26, marginTop: 26, paddingTop: 20, borderTop: '1px solid var(--hairline-2)' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>Card balances owed</div>
              <div className="num" style={{ fontSize: 19, fontWeight: 600, marginTop: 4 }}>
                {ov ? money(ov.cardBalancesOwed) : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>Statements due</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <div className="num" style={{ fontSize: 19, fontWeight: 660, color: 'var(--amber)' }}>
                  {ov ? money(ov.statementsDue) : '—'}
                </div>
                {ov && ov.statementsDue > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', background: 'var(--amber-soft)', padding: '2px 8px', borderRadius: 20 }}>
                    This cycle
                  </span>
                )}
              </div>
            </div>
          </div>
        </Panel>

        {/* Spent this month */}
        <Panel style={{ padding: '26px 28px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
              Spent in {new Date().toLocaleDateString('en-US', { month: 'long' })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>of {ov ? money(ov.spent.budget) : '—'} budget</div>
          </div>
          {isLoading ? (
            <Sk w="40%" h={34} style={{ marginTop: 6 }} />
          ) : (
            <div className="num" style={{ fontSize: 34, fontWeight: 660, letterSpacing: '-0.03em', marginTop: 6 }}>
              {ov ? money(ov.spent.total) : '$0'}
            </div>
          )}
          <div style={{ marginTop: 14, marginBottom: 'auto' }}>
            <Bar pct={ov ? (ov.spent.total / ov.spent.budget) * 100 : 0} over={!!ov && ov.spent.total > ov.spent.budget} height={8} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 12, color: 'var(--text-3)' }}>
              <span>{ov ? Math.round((ov.spent.total / ov.spent.budget) * 100) : 0}% used</span>
              <span>{ov ? money(Math.max(ov.spent.budget - ov.spent.total, 0)) : '—'} left</span>
            </div>
          </div>
          <div style={{ position: 'relative', marginTop: 16 }}>
            {isLoading && <Sk h={96} style={{ borderRadius: 12 }} />}
            {!isLoading && isEmpty && (
              <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13, border: '1px dashed var(--hairline)', borderRadius: 12 }}>
                Spend history appears after a few days
              </div>
            )}
            {!isLoading && !isEmpty && ov && (
              <SpendChart current={ov.spendSeries.current} previous={ov.spendSeries.previous} total={ov.spent.total} />
            )}
          </div>
        </Panel>
      </div>

      {/* ---- Card tiles row ---- */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Cards</div>
          <span onClick={() => go('accounts')} style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}>
            All accounts →
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6 }}>
          {accounts.status === 'loading' &&
            [1, 2, 3, 4].map((i) => <Sk key={i} w={200} h={112} style={{ borderRadius: 15, flexShrink: 0 }} />)}
          {accounts.status === 'empty' && (
            <div style={{ padding: '20px 0' }}>
              <PlaidLinkButton label="Connect your first account" />
            </div>
          )}
          {accounts.data?.map((a) => {
            const bal = a.type === 'credit' ? -(a.current_balance ?? 0) : (a.available_balance ?? a.current_balance ?? 0);
            return (
              <div key={a.id} onClick={() => go('transactions', { accountId: a.id })} style={{ flex: '0 0 200px', cursor: 'pointer' }}>
                <CardTile tier={a.tier} last4={a.mask} />
                <div style={{ padding: '11px 4px 0' }}>
                  <div className="num" style={{ fontSize: 18, fontWeight: 640, letterSpacing: '-0.02em' }}>{money(bal)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                    {a.type === 'credit' ? 'Balance owed' : 'Available'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Intelligence + top categories ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 22 }}>
        <div
          style={{
            background: 'linear-gradient(155deg,var(--surface),var(--surface-2))',
            border: '1px solid var(--hairline)', borderRadius: 22, padding: '26px 28px',
            boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: 13, fontWeight: 700 }}>
              ✦
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Ledger Intelligence</span>
          </div>
          {overview.status === 'loading' || briefing.status === 'loading' ? (
            <>
              <Sk w="92%" h={20} style={{ marginBottom: 10 }} />
              <Sk w="78%" h={20} style={{ marginBottom: 22 }} />
              <Sk w={130} h={36} style={{ borderRadius: 11 }} />
            </>
          ) : ov?.heroInsight ? (
            <>
              <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.32 }}>
                {ov.heroInsight.title}{' '}
                <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{ov.heroInsight.body}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <FilledButton onClick={() => go('insights')}>See breakdown</FilledButton>
                <OutlineButton onClick={() => go('categories')}>View categories</OutlineButton>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Warming up your daily read</div>
              <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 6 }}>
                Once we've seen a few days of activity, your morning insight lands right here.
              </div>
            </>
          )}
        </div>

        <Panel style={{ padding: '22px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Top categories</div>
          {overview.status === 'loading' &&
            [1, 2, 3, 4].map((i) => <Sk key={i} h={40} style={{ marginTop: 11 }} />)}
          {ov?.topCategories.map((c) => (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--hairline-2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                  <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>{money(c.spend)}</span>
                </div>
                <div style={{ height: 5, borderRadius: 20, background: 'var(--surface-3)', marginTop: 7, overflow: 'hidden' }}>
                  <div style={{ width: `${c.pct}%`, height: '100%', borderRadius: 20, background: 'linear-gradient(90deg,var(--accent-2),var(--accent))', opacity: c.pct === 100 ? 1 : 0.72 }} />
                </div>
              </div>
              <ChangeChip pct={c.momPct} invert />
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
