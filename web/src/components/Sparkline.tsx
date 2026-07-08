// Sparkline — color = financial impact, not slope.
// favorable → --pos, unfavorable → --neg, ambiguous → neutral --text-3.
export function Sparkline({
  values, favorable,
}: {
  values: number[];
  favorable: boolean | null; // null = ambiguous → neutral
}) {
  if (!values || values.length < 2) return <svg width={120} height={34} />;
  const w = 120, h = 30;
  const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pts = values.map((v, i) => ({
    x: +((i / (values.length - 1)) * w).toFixed(1),
    y: +((h - ((v - min) / rng) * h)).toFixed(1),
  }));
  const last = pts[pts.length - 1];
  const color = favorable == null ? 'var(--text-3)' : favorable ? 'var(--pos)' : 'var(--neg)';
  return (
    <svg viewBox="0 0 120 34" width={120} height={34} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <polyline
        points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={2.6} fill={color} />
    </svg>
  );
}
