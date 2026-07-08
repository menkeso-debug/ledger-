import React from 'react';
import { TIER_ART } from '../lib/tiers';
import type { Tier } from '../lib/types';

// Premium metal card art: glow + sheen + tier base gradient, edge inset + emboss.
export function CardTile({
  tier, last4, height = 112, width, small = false,
}: {
  tier: Tier; last4?: string | null; height?: number; width?: number; small?: boolean;
}) {
  const a = TIER_ART[tier];
  const tileStyle: React.CSSProperties = {
    height,
    width,
    borderRadius: 15,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    color: a.fg,
    textShadow: a.emboss,
    background: `${a.glow}, ${a.sheen}, ${a.base}`,
    boxShadow: `${a.edge}, var(--shadow)`,
    flexShrink: 0,
  };
  const chipStyle: React.CSSProperties = {
    width: 30, height: 22, borderRadius: 5, background: a.chip,
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1), inset 0 1px 1px rgba(255,255,255,.4)',
  };
  return (
    <div style={tileStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: small ? 10 : 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.82 }}>
          {a.issuer}
        </span>
        <span style={chipStyle} />
      </div>
      {!small && (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, opacity: 0.9 }}>{a.short}</div>
          {last4 && (
            <div className="num" style={{ fontSize: 13, opacity: 0.72, marginTop: 2, letterSpacing: '.08em' }}>
              •••• {last4}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
