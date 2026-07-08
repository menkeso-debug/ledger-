import React from 'react';

// Dependency-free mini-markdown for advisor output: headings, bold, lists, paragraphs.
function inline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={key++} style={{ margin: '6px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {list.map((item, i) => (
          <li key={i} style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55 }}>{inline(item)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = line.match(/^(-|\*|\d+\.)\s+(.*)/);
    if (m) { list.push(m[2]); continue; }
    flushList();
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      blocks.push(
        <div key={key++} style={{ fontSize: h[1].length <= 2 ? 16 : 14, fontWeight: 600, marginTop: 14, letterSpacing: '-0.01em' }}>
          {inline(h[2])}
        </div>
      );
    } else {
      blocks.push(
        <p key={key++} style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, margin: '6px 0' }}>
          {inline(line)}
        </p>
      );
    }
  }
  flushList();
  return <div>{blocks}</div>;
}
