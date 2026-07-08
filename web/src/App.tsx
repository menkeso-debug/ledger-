import React, { useEffect, useState } from 'react';
import { DataProvider, useStore } from './store';
import { greeting, monthName } from './lib/format';
import { Overview } from './screens/Overview';
import { Accounts } from './screens/Accounts';
import { Categories } from './screens/Categories';
import { Insights } from './screens/Insights';
import { Transactions } from './screens/Transactions';
import { Rewards } from './screens/Rewards';

export type ScreenId = 'overview' | 'accounts' | 'categories' | 'insights' | 'transactions' | 'rewards';

export interface Nav {
  screen: ScreenId;
  go: (s: ScreenId, opts?: { accountId?: string; query?: string }) => void;
  txFilter: { accountId?: string; query?: string };
}

const NavCtx = React.createContext<Nav | null>(null);
export const useNav = () => {
  const n = React.useContext(NavCtx);
  if (!n) throw new Error('useNav outside provider');
  return n;
};

const NAV_ITEMS: { id: ScreenId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'categories', label: 'Categories' },
  { id: 'insights', label: 'Insights' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'rewards', label: 'Rewards' },
];

function Sidebar({ theme, toggleTheme }: { theme: 'light' | 'dark'; toggleTheme: () => void }) {
  const { screen, go } = useNav();
  const { insights } = useStore();
  const badge = insights.data?.length || 0;
  return (
    <aside
      className="sidebar"
      style={{
        width: 248, flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start',
        height: '100vh', display: 'flex', flexDirection: 'column', padding: '22px 14px',
        borderRight: '1px solid var(--hairline)', background: 'var(--surface)',
        transition: 'background .3s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '6px 10px 22px' }}>
        <div
          style={{
            width: 30, height: 30, borderRadius: 9,
            background: 'linear-gradient(150deg,var(--accent-2),var(--accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px -3px var(--accent-soft)',
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: 3, background: '#fff', opacity: 0.95 }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Ledger</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 450, marginTop: 1 }}>Household finance</div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const active = screen === item.id;
          return (
            <div
              key={item.id}
              onClick={() => go(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px',
                borderRadius: 11, cursor: 'pointer', fontSize: 14,
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--text)' : 'var(--text-2)',
                background: active ? 'var(--surface-2)' : 'transparent',
              }}
            >
              <span
                style={{
                  width: 7, height: 7, borderRadius: 2,
                  background: active ? 'var(--accent)' : 'var(--text-3)',
                  opacity: active ? 1 : 0.4,
                }}
              />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.id === 'insights' && badge > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '1px 7px', borderRadius: 20 }}>
                  {badge}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidefoot" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '0 6px' }}>
        <div
          onClick={toggleTheme}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px', borderRadius: 11, cursor: 'pointer',
            background: 'var(--surface-2)', border: '1px solid var(--hairline)',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
            {theme === 'dark' ? 'Dark mode' : 'Light mode'}
          </span>
          <span style={{ width: 34, height: 20, borderRadius: 20, background: 'var(--accent)', position: 'relative', transition: 'background .2s', display: 'inline-block' }}>
            <span
              style={{
                position: 'absolute', top: 2, left: theme === 'dark' ? 16 : 2,
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
            />
          </span>
        </div>
        <div className="sideuser" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 0' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#C9A24B,#E8C77E)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Personal</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Personal · Premium</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Header() {
  const { screen, go } = useNav();
  const { accounts, syncedAt, syncNow, syncing } = useStore();
  const n = accounts.data?.length ?? 0;

  const titles: Record<ScreenId, [string, string]> = {
    overview: [greeting(), 'Overview'],
    accounts: [`${n} account${n === 1 ? '' : 's'}`, 'Accounts'],
    categories: [`${monthName()} spending`, 'Categories'],
    insights: ['Ledger Intelligence', 'Insights'],
    transactions: ['All activity', 'Transactions'],
    rewards: ['Status & points', 'Rewards'],
  };
  const [eyebrow, title] = titles[screen];
  const syncLabel = syncedAt
    ? `Synced · ${new Date(syncedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'Not synced';

  return (
    <header className="apphead" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '38px 44px 18px', gap: 20, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)', marginBottom: 5 }}>{eyebrow}</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(24px,4.4vw,30px)', fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{title}</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <div
          onClick={() => !syncing && syncNow()}
          title="Sync now"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 11,
            background: 'var(--surface)', border: '1px solid var(--hairline)', fontSize: 13,
            color: 'var(--text-2)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', userSelect: 'none',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: syncing ? 'var(--amber)' : 'var(--pos)' }} />
          {syncing ? 'Syncing…' : syncLabel}
        </div>
        <div
          onClick={() => go('transactions')}
          title="Search transactions"
          style={{
            width: 40, height: 40, borderRadius: 11, background: 'var(--surface)',
            border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', boxShadow: 'var(--shadow-sm)', fontSize: 16,
            color: 'var(--text-2)', cursor: 'pointer',
          }}
        >
          ⌕
        </div>
      </div>
    </header>
  );
}

function Shell() {
  // Land on Accounts when returning from a bank's OAuth page so Link can resume.
  const [screen, setScreen] = useState<ScreenId>(() =>
    window.location.search.includes('oauth_state_id') ? 'accounts' : 'overview'
  );
  const [txFilter, setTxFilter] = useState<{ accountId?: string; query?: string }>({});
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('ledger-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('ledger-theme', theme);
  }, [theme]);

  const nav: Nav = {
    screen,
    go: (s, opts) => {
      setScreen(s);
      setTxFilter(opts || {});
      window.scrollTo(0, 0);
    },
    txFilter,
  };

  return (
    <NavCtx.Provider value={nav}>
      <div
        className="approot"
        style={{
          display: 'flex', minHeight: '100vh', width: '100%', background: 'var(--canvas)',
          color: 'var(--text)', transition: 'background .3s ease, color .3s ease',
        }}
      >
        <Sidebar theme={theme} toggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxWidth: 1180, margin: '0 auto', width: '100%' }}>
          <Header />
          <div className="screenpad" style={{ padding: '8px 44px 60px', flex: 1 }}>
            {screen === 'overview' && <Overview />}
            {screen === 'accounts' && <Accounts />}
            {screen === 'categories' && <Categories />}
            {screen === 'insights' && <Insights />}
            {screen === 'transactions' && <Transactions />}
            {screen === 'rewards' && <Rewards />}
          </div>
        </main>
      </div>
    </NavCtx.Provider>
  );
}

export default function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}
