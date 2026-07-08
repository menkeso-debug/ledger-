import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/api';
import { money, pts } from '../lib/format';
import { PROGRAM_BADGES } from '../lib/tiers';
import { Panel, Sk } from '../components/ui';
import { ProgressRing } from '../components/ProgressRing';
import type { Rewards as RewardsData } from '../lib/types';

function BalanceRow({
  program, name, note, balance, onSaved,
}: {
  program: string; name: string; note: string | null; balance: number;
  onSaved: (b: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(balance));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = Number(value.replace(/[,\s]/g, ''));
    if (Number.isNaN(n)) return setEditing(false);
    setSaving(true);
    try {
      await api.put('/api/rewards/balances', { program, balance: n });
      onSaved(n);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: PROGRAM_BADGES[program] || 'var(--surface-3)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 550 }}>{name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{note}</div>
      </div>
      {editing ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            autoFocus
            className="num"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            style={{
              width: 110, fontSize: 15, fontWeight: 600, textAlign: 'right',
              border: '1px solid var(--accent)', borderRadius: 8, padding: '5px 8px',
              background: 'var(--surface)', color: 'var(--text)', outline: 'none',
            }}
          />
          <span onClick={save} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>
            {saving ? '…' : 'Save'}
          </span>
        </span>
      ) : (
        <span
          className="num"
          onClick={() => { setValue(String(balance)); setEditing(true); }}
          title="Click to update balance"
          style={{ fontSize: 18, fontWeight: 640, letterSpacing: '-0.02em', cursor: 'pointer', borderBottom: '1px dashed var(--hairline)' }}
        >
          {pts(balance)}
        </span>
      )}
    </div>
  );
}

export function Rewards() {
  const { rewards } = useStore();
  const [local, setLocal] = useState<Record<string, number>>({});

  if (rewards.status === 'loading' || !rewards.data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 22 }}>
          <Sk h={180} style={{ borderRadius: 22 }} />
          <Sk h={180} style={{ borderRadius: 22 }} />
        </div>
        <Sk h={260} style={{ borderRadius: 22 }} />
      </div>
    );
  }

  const r: RewardsData = rewards.data;
  const maxDriver = Math.max(...r.mqd.drivers.map((d) => d.mqd), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 22 }}>
        {/* Delta Medallion status card — fixed dark gradient */}
        <div
          style={{
            background: 'linear-gradient(155deg,#12203C,#0A1424)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 22, padding: '28px 30px', boxShadow: 'var(--shadow-lg)', color: '#fff',
            position: 'relative', overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 100% 0%, rgba(120,160,255,0.18), transparent 60%)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 22, minWidth: 0 }}>
            <ProgressRing pct={r.mqd.pct} label={`${Math.round(r.mqd.pct * 100)}%`} sub={`to ${r.mqd.targetLabel}`} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
                Delta Medallion
              </div>
              <div style={{ fontSize: 22, fontWeight: 680, letterSpacing: '-0.02em', marginTop: 4 }}>
                {r.mqd.targetLabel} pace
              </div>
              <div className="num" style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 1.55 }}>
                {pts(r.mqd.earned)} / {pts(r.mqd.target)} MQDs · {pts(r.mqd.remaining)} to go.
                {r.mqd.onTrackBy ? ` On track by ${r.mqd.onTrackBy}.` : r.mqd.remaining === 0 ? ' Target reached.' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Manual point balances */}
        <Panel style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Rewards balances</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Manual — click a value to update</div>
          </div>
          {r.balances.map((b) => (
            <BalanceRow
              key={b.program}
              program={b.program}
              name={b.display_name}
              note={b.note}
              balance={local[b.program] ?? b.balance}
              onSaved={(n) => setLocal((s) => ({ ...s, [b.program]: n }))}
            />
          ))}
        </Panel>
      </div>

      {/* MQD drivers */}
      <Panel style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>What's driving your MQDs</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>This qualification year</div>
        </div>
        {r.mqd.drivers.map((d) => (
          <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--hairline-2)' }}>
            <div style={{ width: 150, flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 550 }}>{d.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{d.note}</div>
            </div>
            <div style={{ flex: 1, height: 10, borderRadius: 20, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.round((d.mqd / maxDriver) * 100)}%`, height: '100%',
                  borderRadius: 20, background: 'linear-gradient(90deg,#3A4E8C,#7FB2FF)',
                }}
              />
            </div>
            <div className="num" style={{ width: 80, textAlign: 'right', fontSize: 15, fontWeight: 600 }}>{pts(d.mqd)}</div>
          </div>
        ))}
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 22 }}>
        {/* Points earned this month (calculated live from Plaid spend) */}
        <Panel style={{ padding: '24px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Points earned this month</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Estimated from spend</div>
          </div>
          {r.pointsThisMonth.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '14px 0' }}>
              No card spend recorded yet this month.
            </div>
          )}
          {r.pointsThisMonth.map((p) => (
            <div key={p.tier} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--hairline-2)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 550 }}>{p.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{money(p.spend)} spend</div>
              </div>
              <div className="num" style={{ fontSize: 16, fontWeight: 640 }}>+{pts(p.points)}</div>
            </div>
          ))}
        </Panel>

        {/* Card credits */}
        <Panel style={{ padding: '24px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Card credits</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>This period</div>
          </div>
          {r.credits.map((c) => {
            const done = c.remaining <= 0;
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--hairline-2)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 550 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: done ? 'var(--pos)' : c.nudge ? 'var(--amber)' : 'var(--text-3)' }}>
                    {done
                      ? 'Fully used ✓'
                      : `${money(c.remaining)} left · ${c.daysLeft}d remaining`}
                  </div>
                </div>
                <div style={{ width: 90 }}>
                  <div style={{ height: 6, borderRadius: 20, background: 'var(--surface-3)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.round((c.used / c.amount) * 100)}%`, height: '100%', borderRadius: 20,
                        background: done ? 'var(--pos)' : 'linear-gradient(90deg,var(--accent-2),var(--accent))',
                      }}
                    />
                  </div>
                  <div className="num" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, textAlign: 'right' }}>
                    {money(c.used)} / {money(c.amount)}
                  </div>
                </div>
              </div>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}
