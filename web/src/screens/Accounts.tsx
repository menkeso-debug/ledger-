import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store';
import { useNav } from '../App';
import { money } from '../lib/format';
import { Panel, Sk, EmptyState, FilledButton } from '../components/ui';
import { CardTile } from '../components/CardTile';
import { Sparkline } from '../components/Sparkline';
import { PlaidLinkButton } from '../components/PlaidLinkButton';
import { AppleCardImport } from '../components/AppleCardImport';
import { TIER_ART } from '../lib/tiers';

interface Asset { id: string; name: string; value: number }

// Manual assets (brokerage, external savings, equity) — feed net worth.
function AssetsPanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get<Asset[]>('/api/assets').then(setAssets).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async () => {
    const v = Number(value.replace(/[$,\s]/g, ''));
    if (!name.trim() || Number.isNaN(v)) return;
    setBusy(true);
    try {
      await api.post('/api/assets', { name: name.trim(), value: v });
      setName(''); setValue('');
      await load();
    } finally { setBusy(false); }
  };

  const update = async (a: Asset, newValue: string) => {
    const v = Number(newValue.replace(/[$,\s]/g, ''));
    if (Number.isNaN(v)) return;
    await api.post('/api/assets', { id: a.id, name: a.name, value: v });
    await load();
  };

  return (
    <Panel style={{ padding: '22px 24px', marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Other assets
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}> · manual — counted in net worth (brokerage, savings, equity)</span>
        </div>
      </div>
      {assets.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--hairline-2)' }}>
          <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{a.name}</span>
          <AssetValue asset={a} onSave={update} />
          <span
            onClick={async () => { await fetch(`/api/assets/${a.id}`, { method: 'DELETE' }); await load(); }}
            title="Remove"
            style={{ fontSize: 13, color: 'var(--text-3)', cursor: 'pointer' }}
          >✕</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Asset name (e.g. Webull)"
          style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
        />
        <input
          value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value $" className="num"
          onKeyDown={(e) => e.key === 'Enter' && add()}
          style={{ width: 110, fontSize: 13, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--hairline)', background: 'var(--surface)', color: 'var(--text)', outline: 'none', textAlign: 'right' }}
        />
        <FilledButton onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add asset'}</FilledButton>
      </div>
    </Panel>
  );
}

function AssetValue({ asset, onSave }: { asset: Asset; onSave: (a: Asset, v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(asset.value));
  if (editing) {
    return (
      <input
        autoFocus className="num" value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={async (e) => { if (e.key === 'Enter') { await onSave(asset, v); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
        onBlur={() => setEditing(false)}
        style={{ width: 110, fontSize: 14, fontWeight: 600, textAlign: 'right', border: '1px solid var(--accent)', borderRadius: 8, padding: '4px 8px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
      />
    );
  }
  return (
    <span className="num" onClick={() => { setV(String(asset.value)); setEditing(true); }} title="Click to update" style={{ fontSize: 15, fontWeight: 640, cursor: 'pointer', borderBottom: '1px dashed var(--hairline)' }}>
      {money(asset.value)}
    </span>
  );
}

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
      <AssetsPanel />
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <PlaidLinkButton label="Connect another account" />
        <AppleCardImport />
      </div>
    </div>
  );
}
