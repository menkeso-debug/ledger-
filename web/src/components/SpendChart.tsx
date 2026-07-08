import { money } from '../lib/format';

// Spend area chart — SVG viewBox 320×96, gridlines + baseline, accent-gradient
// area fill, dashed prev-month line, current line stroke 3, haloed end dot,
// $0 bottom-left, current value label left of the dot.
export function SpendChart({
  current, previous, total,
}: {
  current: { day: number; total: number }[];
  previous: { day: number; total: number }[];
  total: number;
}) {
  const W = 320, H = 92;
  const all = [...current.map((p) => p.total), ...previous.map((p) => p.total), 1];
  const max = Math.max(...all);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const today = new Date().getDate();

  const toPts = (series: { day: number; total: number }[], span: number) =>
    series.map((p) => ({
      x: +(((p.day - 1) / Math.max(span - 1, 1)) * W).toFixed(1),
      y: +((H - (p.total / max) * H)).toFixed(1),
    }));

  // Current month plots over days 1..today; previous over the full month.
  const curPts = toPts(current, Math.max(today, 2));
  const prevPts = toPts(previous, daysInMonth);

  const line = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  const area = (pts: { x: number; y: number }[]) =>
    pts.length
      ? `M${pts[0].x} ${H} ${pts.map((p) => `L${p.x} ${p.y}`).join(' ')} L${pts[pts.length - 1].x} ${H} Z`
      : '';

  const monthShort = new Date().toLocaleDateString('en-US', { month: 'short' });

  return (
    <div>
      <div style={{ position: 'relative', height: 98 }}>
        <svg viewBox="0 0 320 96" width="100%" height={96} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, display: 'block' }}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <line x1="0" y1="31" x2="320" y2="31" stroke="var(--hairline)" strokeWidth="1" strokeDasharray="2 5" />
          <line x1="0" y1="62" x2="320" y2="62" stroke="var(--hairline)" strokeWidth="1" strokeDasharray="2 5" />
          <line x1="0" y1="94" x2="320" y2="94" stroke="var(--hairline)" strokeWidth="1.2" />
          {curPts.length > 1 && <path d={area(curPts)} fill="url(#areaFill)" />}
          {prevPts.length > 1 && (
            <path d={line(prevPts)} fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeOpacity="0.55" strokeDasharray="4 4" />
          )}
          {curPts.length > 1 && (
            <path d={line(curPts)} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
        <span className="num" style={{ position: 'absolute', left: 0, bottom: 2, fontSize: 11, color: 'var(--text-3)', background: 'var(--surface)', padding: '0 3px', borderRadius: 4 }}>
          $0
        </span>
        <span style={{ position: 'absolute', right: 1, top: -3, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{money(total)}</span>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' }} />
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 11, fontSize: 11, color: 'var(--text-3)' }}>
        <span>{monthShort} 1</span>
        <span style={{ display: 'flex', gap: 14 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 2, background: 'var(--accent)', borderRadius: 2 }} />This month
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, borderTop: '2px dashed var(--text-3)' }} />Last month
          </span>
        </span>
        <span>{monthShort} {today}</span>
      </div>
    </div>
  );
}
