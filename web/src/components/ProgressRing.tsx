// ProgressRing — r=58, stroke 12, blue→violet gradient stroke, rotated -90°.
export function ProgressRing({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const C = 2 * Math.PI * 58;
  const dash = `${(C * Math.min(Math.max(pct, 0), 1)).toFixed(1)} ${C.toFixed(1)}`;
  return (
    <svg viewBox="0 0 140 140" width={120} height={120} style={{ flexShrink: 0 }}>
      <circle cx="70" cy="70" r="58" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="12" />
      <circle
        cx="70" cy="70" r="58" fill="none" stroke="url(#ringGrad)" strokeWidth="12"
        strokeLinecap="round" transform="rotate(-90 70 70)" strokeDasharray={dash}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7FB2FF" />
          <stop offset="100%" stopColor="#C7A2FF" />
        </linearGradient>
      </defs>
      <text x="70" y="66" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="700" fontFamily="Inter" className="num">
        {label}
      </text>
      <text x="70" y="86" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="11" fontFamily="Inter">
        {sub}
      </text>
    </svg>
  );
}
