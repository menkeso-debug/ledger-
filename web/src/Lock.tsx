import React, { useEffect, useState } from 'react';

// Password gate. Checks the session cookie once on load; after a successful
// login the server sets a long-lived HttpOnly cookie so this never asks again
// on the same device.
export function Lock({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking');
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/check')
      .then((r) => r.json())
      .then((d) => setState(d.authed ? 'open' : 'locked'))
      .catch(() => setState('locked'));
  }, []);

  const submit = async () => {
    if (!pw || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) setState('open');
      else { setError(true); setPw(''); }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (state === 'open') return <>{children}</>;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--canvas)', color: 'var(--text)', padding: 24,
    }}>
      {state === 'locked' && (
        <div style={{
          width: 340, maxWidth: '100%', background: 'var(--surface)', border: '1px solid var(--hairline)',
          borderRadius: 22, padding: '36px 32px', boxShadow: 'var(--shadow)', textAlign: 'center',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13, margin: '0 auto 16px',
            background: 'linear-gradient(150deg,var(--accent-2),var(--accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px -3px var(--accent-soft)',
          }}>
            <div style={{ width: 17, height: 17, borderRadius: 4, background: '#fff', opacity: 0.95 }} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>Ledger</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4, marginBottom: 22 }}>Enter your password to unlock</div>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Password"
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '11px 14px',
              borderRadius: 12, border: `1px solid ${error ? 'var(--neg)' : 'var(--hairline)'}`,
              background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', textAlign: 'center',
            }}
          />
          {error && <div style={{ fontSize: 12.5, color: 'var(--neg)', marginTop: 10 }}>Wrong password — try again</div>}
          <div
            onClick={submit}
            style={{
              marginTop: 14, padding: '11px 0', borderRadius: 12, fontSize: 14.5, fontWeight: 600,
              background: 'var(--accent)', color: '#fff', cursor: 'pointer', userSelect: 'none',
              opacity: busy || !pw ? 0.6 : 1,
            }}
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </div>
        </div>
      )}
    </div>
  );
}
