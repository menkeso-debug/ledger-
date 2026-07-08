import { useStore } from '../store';
import { useNav } from '../App';
import { money } from '../lib/format';
import { Panel, Sk, EmptyState } from '../components/ui';
import { CardTile } from '../components/CardTile';
import { Sparkline } from '../components/Sparkline';
import { PlaidLinkButton } from '../components/PlaidLinkButton';
import { AppleCardImport } from '../components/AppleCardImport';
import { TIER_ART } from '../lib/tiers';

export function Accounts() {
  const { accounts } = useStore();
  const { go } = useNav();

  if (accounts.status === 'loading') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,340px),1fr))', gap: 20 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => <Sk key={i} h={200} style={{ borderRadius: 22 }} />)}
      </div>
    );
  }

  if (accounts.status !== 'ready' || !accounts.data?.length) {
    return (
      <Panel>
        <EmptyState
          icon="＋"
          title="No accounts connected"
          body="Link your cards and checking through Plaid to start the 24-month backfill and daily sync."
          action={
            <span style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <PlaidLinkButton />
              <AppleCardImport />
            </span>
          }
        />
      </Panel>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,340px),1fr))', gap: 20 }}>
        {accounts.data.map((a) => {
          const isCard = a.type === 'credit';
          const bal = isCard ? -(a.current_balance ?? 0) : (a.available_balance ?? a.current_balance ?? 0);
          // Sparkline semantic color: checking favorable = balance up;
          // cards favorable = spend lower than usual (!up).
          const favorable = a.spark.series.length < 2 ? null : isCard ? !a.spark.up : a.spark.up;
          const trend = isCard
            ? a.spark.up ? '↑ higher than usual' : '↓ lower than usual'
            : a.spark.up ? '↑ trending up' : '↓ trending down';
          return (
            <div
              key={a.id}
              onClick={() => go('transactions', { accountId: a.id })}
              style={{
                background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 22,
                padding: 20, boxShadow: 'var(--shadow)', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 16,
              }}
            >
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Real card aspect ratio (CR80 ≈ 1.586:1), not the square from the prototype */}
                <CardTile
                  tier={a.tier}
                  height={112}
                  width={178}
                  small
                  issuer={a.tier === 'other' ? a.institution_name : undefined}
                />
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 'clamp(13.5px,1.4vw,15px)', fontWeight: 600, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>
                    {/* Chase returns generic names — use the pinned tier's real name */}
                    {/^credit card$/i.test(a.name) && a.tier !== 'other'
                      ? `${TIER_ART[a.tier].issuer} ${TIER_ART[a.tier].short}`
                      : a.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2, whiteSpace: 'nowrap' }}>
                    {a.subtype ? a.subtype.charAt(0).toUpperCase() + a.subtype.slice(1) : a.type}
                    {a.mask ? <> · •••• {a.mask}</> : null}
                  </div>
                  <div className="num" style={{ fontSize: 'clamp(18px,2vw,22px)', fontWeight: 660, letterSpacing: '-0.02em', marginTop: 8, whiteSpace: 'nowrap' }}>
                    {money(bal)}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid var(--hairline-2)', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {isCard ? 'Balance owed' : 'Available'}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5, fontWeight: 550, marginTop: 3,
                      color: favorable == null ? 'var(--text-3)' : favorable ? 'var(--pos)' : 'var(--neg)',
                    }}
                  >
                    {trend}
                  </div>
                </div>
                <Sparkline values={a.spark.series} favorable={favorable} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <PlaidLinkButton label="Connect another account" />
        <AppleCardImport />
      </div>
    </div>
  );
}
