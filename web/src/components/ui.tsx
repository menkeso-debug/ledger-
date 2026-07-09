import React from 'react';

// --- Panel -------------------------------------------------------------------

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 22,
        boxShadow: 'var(--shadow)', ...style,
      }}
    >
      {children}
    </div>
  );
}

// --- ChangeChip — pill: ↑/↓ N%, semantic color; invert flips good/bad for spend ----

export function ChangeChip({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct == null || pct === 0) {
    return (
      <span
        className="num"
        style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right', color: 'var(--text-3)', padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}
      >
        {pct === 0 ? '0%' : '—'}
      </span>
    );
  }
  const up = pct > 0;
  const good = invert ? !up : up;
  const color = good ? 'var(--pos)' : 'var(--neg)';
  const bg = good ? 'var(--pos-soft)' : 'var(--neg-soft)';
  return (
    <span
      className="num"
      style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right', color, background: bg, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}
    >
      {up ? '↑' : '↓'} {Math.abs(pct).toLocaleString('en-US')}%
    </span>
  );
}

// --- Skeleton ------------------------------------------------------------------

export function Sk({ w, h, style }: { w?: number | string; h?: number | string; style?: React.CSSProperties }) {
  return <div className="sk" style={{ width: w, height: h, ...style }} />;
}

// --- EmptyState ------------------------------------------------------------------

export function EmptyState({
  icon = '✦', title, body, tint = 'accent', action,
}: {
  icon?: string; title: string; body: string; tint?: 'accent' | 'neutral'; action?: React.ReactNode;
}) {
  const fg = tint === 'accent' ? 'var(--accent)' : 'var(--text-3)';
  const bg = tint === 'accent' ? 'var(--accent-soft)' : 'var(--surface-3)';
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
      <div
        style={{
          width: 46, height: 46, borderRadius: 14, background: bg, color: fg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px', fontSize: 19,
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 6, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>
        {body}
      </div>
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

// --- Buttons -----------------------------------------------------------------

export function FilledButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <span
      onClick={disabled ? undefined : onClick}
      style={{
        fontSize: 13, fontWeight: 550, color: '#fff', background: 'var(--accent)',
        padding: '9px 16px', borderRadius: 11, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1, display: 'inline-block', userSelect: 'none',
      }}
    >
      {children}
    </span>
  );
}

export function OutlineButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        fontSize: 13, fontWeight: 550, color: 'var(--text)', background: 'var(--surface)',
        border: '1px solid var(--hairline)', padding: '9px 16px', borderRadius: 11,
        cursor: 'pointer', display: 'inline-block', userSelect: 'none',
      }}
    >
      {children}
    </span>
  );
}

// --- Progress bar (budget bars) ----------------------------------------------

export function Bar({ pct, over = false, height = 5, width }: { pct: number; over?: boolean; height?: number; width?: number | string }) {
  return (
    <div style={{ height, borderRadius: 20, background: 'var(--surface-3)', overflow: 'hidden', width }}>
      <div
        style={{
          width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 20,
          background: over ? 'var(--neg)' : 'linear-gradient(90deg,var(--accent-2),var(--accent))',
        }}
      />
    </div>
  );
}
