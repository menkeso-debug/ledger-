import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/api';
import { relTime } from '../lib/format';
import { Panel, Sk, EmptyState } from '../components/ui';
import { Markdown } from '../components/Markdown';

const TONE: Record<string, [string, string]> = {
  neg: ['var(--neg)', 'var(--neg-soft)'],
  amber: ['var(--amber)', 'var(--amber-soft)'],
  accent: ['var(--accent)', 'var(--accent-soft)'],
  pos: ['var(--pos)', 'var(--pos-soft)'],
};

const SUGGESTIONS = [
  'Where can I cut $500?',
  'Compare this month to last',
  'Biggest recurring charges',
  'How am I tracking to Platinum?',
];

function InsightSkeleton({ widths }: { widths: [string, string, string, string?] }) {
  return (
    <Panel style={{ borderRadius: 18, padding: '22px 24px' }}>
      <Sk w={widths[0]} h={14} style={{ marginBottom: 14 }} />
      <Sk w={widths[1]} h={18} style={{ marginBottom: 11 }} />
      <Sk w={widths[2]} h={12} style={{ marginBottom: widths[3] ? 7 : 0 }} />
      {widths[3] && <Sk w={widths[3]} h={12} />}
    </Panel>
  );
}

export function Insights() {
  const { insights, briefing, dismissInsight, refresh } = useStore();
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [askedQ, setAskedQ] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const submit = async (qText?: string) => {
    const text = (qText ?? question).trim();
    if (!text || asking) return;
    setAsking(true);
    setAskedQ(text);
    setAnswer(null);
    setQuestion('');
    try {
      const res = await api.post<{ answer: string }>('/api/advisor/ask', { question: text });
      setAnswer(res.answer);
    } catch {
      setAnswer('Something went wrong reaching the advisor. Try again.');
    } finally {
      setAsking(false);
    }
  };

  const generateBriefing = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      await api.post('/api/advisor/briefing');
      await refresh();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820 }}>
      {/* Ask-anything input */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)',
          border: '1px solid var(--hairline)', borderRadius: 16, padding: '6px 6px 6px 18px',
          boxShadow: 'var(--shadow)',
        }}
      >
        <span style={{ color: 'var(--accent)', fontSize: 16 }}>✦</span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Ask about your spending — &ldquo;How much on coffee this quarter?&rdquo;"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--text)', padding: '12px 0' }}
        />
        <span
          onClick={() => submit()}
          style={{
            fontSize: 13, fontWeight: 550, color: '#fff', background: 'var(--accent)',
            padding: '10px 18px', borderRadius: 11, cursor: 'pointer', opacity: asking ? 0.6 : 1, userSelect: 'none',
          }}
        >
          {asking ? 'Thinking…' : 'Ask'}
        </span>
      </div>

      {/* Suggestion chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {SUGGESTIONS.map((s) => (
          <span
            key={s}
            onClick={() => submit(s)}
            style={{
              fontSize: 13, color: 'var(--text-2)', background: 'var(--surface)',
              border: '1px solid var(--hairline)', padding: '7px 13px', borderRadius: 20, cursor: 'pointer',
            }}
          >
            {s}
          </span>
        ))}
      </div>

      {/* Q&A answer */}
      {(asking || answer) && (
        <Panel style={{ borderRadius: 18, padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '2px 8px', borderRadius: 6, color: 'var(--accent)', background: 'var(--accent-soft)' }}>
              You asked
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{askedQ}</span>
          </div>
          {asking ? (
            <>
              <Sk w="88%" h={13} style={{ marginBottom: 8 }} />
              <Sk w="72%" h={13} style={{ marginBottom: 8 }} />
              <Sk w="80%" h={13} />
            </>
          ) : (
            answer && <Markdown text={answer} />
          )}
        </Panel>
      )}

      {/* Daily briefing */}
      {briefing.status === 'ready' && briefing.data && (
        <Panel style={{ borderRadius: 18, padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '2px 8px', borderRadius: 6, color: 'var(--accent)', background: 'var(--accent-soft)' }}>
              Daily briefing
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{relTime(briefing.data.created_at)}</span>
            <span
              onClick={generateBriefing}
              style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}
            >
              {generating ? 'Writing…' : 'Regenerate →'}
            </span>
          </div>
          <Markdown text={briefing.data.content} />
        </Panel>
      )}
      {briefing.status === 'empty' && (
        <Panel style={{ borderRadius: 18, padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 14, color: 'var(--text-2)' }}>
            No briefing yet — it runs every morning, or generate one now.
          </div>
          <span onClick={generateBriefing} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {generating ? 'Writing…' : 'Generate briefing →'}
          </span>
        </Panel>
      )}

      {/* Advisory feed */}
      {insights.status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <InsightSkeleton widths={['96px', '62%', '100%', '82%']} />
          <InsightSkeleton widths={['80px', '54%', '94%', '70%']} />
          <InsightSkeleton widths={['110px', '48%', '88%']} />
        </div>
      )}

      {insights.status === 'empty' && (
        <Panel style={{ borderRadius: 18 }}>
          <EmptyState
            title="You're all caught up"
            body="No insights need your attention right now. We'll surface overspend, new bills, and savings as they come up."
          />
        </Panel>
      )}

      {insights.status === 'ready' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {insights.data!.map((i) => {
            const [c, bg] = TONE[i.tone] || TONE.accent;
            return (
              <Panel key={i.id} style={{ borderRadius: 18, padding: '22px 24px', display: 'flex', gap: 22, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '2px 8px', borderRadius: 6, color: c, background: bg }}>
                      {i.tag}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{relTime(i.updated_at)}</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em' }}>{i.title}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55, marginTop: 6 }}>{i.body}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'center' }}>
                    {i.cta && (
                      <span
                        onClick={() => submit(`${i.title} — tell me more and what to do about it.`)}
                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}
                      >
                        {i.cta} →
                      </span>
                    )}
                    <span
                      onClick={() => dismissInsight(i.id)}
                      style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)', cursor: 'pointer' }}
                    >
                      Dismiss
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 96 }}>
                  <div className="num" style={{ fontSize: 30, fontWeight: 680, letterSpacing: '-0.03em', color: c, lineHeight: 1 }}>
                    {i.impact}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{i.impact_sub}</div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
