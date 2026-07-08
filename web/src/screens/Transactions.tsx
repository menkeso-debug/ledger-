import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useNav } from '../App';
import { api } from '../lib/api';
import { money, dayLabel } from '../lib/format';
import { merchantMark } from '../lib/tiers';
import { Sk, EmptyState } from '../components/ui';
import type { Txn } from '../lib/types';

type Filter = 'all' | 'cards' | 'dining' | 'month';

export function Transactions() {
  const { transactions, accounts } = useStore();
  const { txFilter } = useNav();
  const [search, setSearch] = useState(txFilter.query || '');
  const [filter, setFilter] = useState<Filter>('all');
  const [accountId, setAccountId] = useState<string | undefined>(txFilter.accountId);
  const [category, setCategory] = useState<string | undefined>(txFilter.category);
  const [subcategory, setSubcategory] = useState<string | undefined>(txFilter.subcategory);
  const [rows, setRows] = useState<Txn[] | null>(transactions.data);
  const [loading, setLoading] = useState(transactions.status === 'loading');

  useEffect(() => {
    setAccountId(txFilter.accountId);
    setSearch(txFilter.query || '');
    setCategory(txFilter.category);
    setSubcategory(txFilter.subcategory);
  }, [txFilter.accountId, txFilter.query, txFilter.category, txFilter.subcategory]);

  // Server-side fetch when filters change (keeps results correct beyond the cached page).
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '200' });
        if (search.trim()) params.set('query', search.trim());
        if (category) params.set('category', category);
        else if (filter === 'dining') params.set('category', 'Dining');
        if (subcategory) params.set('subcategory', subcategory);
        if (filter === 'month') params.set('month', new Date().toISOString().slice(0, 7));
        if (accountId) params.set('account_id', accountId);
        const data = await api.get<Txn[]>(`/api/transactions?${params.toString()}`);
        setRows(filter === 'cards' ? data.filter((r) => r.tier !== 'cpc') : data);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, filter, accountId, category, subcategory]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, Txn[]>();
    for (const t of rows || []) {
      const arr = byDay.get(t.date) || [];
      arr.push(t);
      byDay.set(t.date, arr);
    }
    return [...byDay.entries()];
  }, [rows]);

  const accountName = accountId ? accounts.data?.find((a) => a.id === accountId)?.name : null;

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'cards', label: 'Cards' },
    { id: 'dining', label: 'Dining' },
    { id: 'month', label: 'This month' },
  ];

  return (
    <div>
      {/* Search + filter chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div
          style={{
            flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--surface)', border: '1px solid var(--hairline)',
            borderRadius: 12, padding: '0 14px', boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span style={{ color: 'var(--text-3)', fontSize: 15 }}>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchants, categories, amounts"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text)', padding: '11px 0' }}
          />
        </div>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <span
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                fontSize: 13, fontWeight: 500, padding: '10px 14px', borderRadius: 12,
                cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-sm)',
                color: active ? '#fff' : 'var(--text-2)',
                background: active ? 'var(--accent)' : 'var(--surface)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline)'}`,
                userSelect: 'none',
              }}
            >
              {f.label}
            </span>
          );
        })}
        {category && (
          <span
            onClick={() => { setCategory(undefined); setSubcategory(undefined); }}
            style={{
              fontSize: 13, fontWeight: 500, padding: '10px 14px', borderRadius: 12,
              cursor: 'pointer', color: 'var(--accent)', background: 'var(--accent-soft)',
              border: '1px solid transparent', userSelect: 'none',
            }}
            title="Clear category filter"
          >
            {category}{subcategory ? ` · ${subcategory}` : ''} ✕
          </span>
        )}
        {accountName && (
          <span
            onClick={() => setAccountId(undefined)}
            style={{
              fontSize: 13, fontWeight: 500, padding: '10px 14px', borderRadius: 12,
              cursor: 'pointer', color: 'var(--accent)', background: 'var(--accent-soft)',
              border: '1px solid transparent', userSelect: 'none',
            }}
            title="Clear account filter"
          >
            {accountName} ✕
          </span>
        )}
      </div>

      {/* List panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 20, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {loading &&
          [1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px', borderBottom: '1px solid var(--hairline-2)' }}>
              <Sk w={38} h={38} style={{ borderRadius: 11 }} />
              <div style={{ flex: 1 }}>
                <Sk w="42%" h={13} style={{ marginBottom: 8 }} />
                <Sk w="24%" h={11} />
              </div>
              <Sk w={74} h={14} />
            </div>
          ))}

        {!loading && grouped.length === 0 && (
          <EmptyState
            icon="⌕"
            tint="neutral"
            title="No transactions found"
            body="Try clearing filters or a different search term."
          />
        )}

        {!loading &&
          grouped.map(([date, txns]) => (
            <div key={date}>
              <div
                style={{
                  padding: '14px 24px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '0.03em', background: 'var(--surface-2)',
                }}
              >
                {dayLabel(date)}
              </div>
              {txns.map((t) => {
                const income = t.amount < 0; // Plaid: negative = money in
                const mark = merchantMark(t.merchant);
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 24px', borderBottom: '1px solid var(--hairline-2)' }}>
                    <span
                      style={{
                        width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: '#fff',
                        fontSize: 15, fontWeight: 600, background: mark.bg,
                      }}
                    >
                      {mark.initial}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.merchant}
                        {t.pending && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}> · pending</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 1 }}>{t.account_name}</div>
                    </div>
                    {t.subcategory && (
                      <span style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-3)', padding: '4px 11px', borderRadius: 20, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {t.subcategory}
                      </span>
                    )}
                    <span
                      className="num"
                      style={{
                        fontSize: 14.5, fontWeight: 600, width: 96, textAlign: 'right',
                        color: income ? 'var(--pos)' : 'var(--text)',
                      }}
                    >
                      {income ? '+' : ''}{money(-t.amount, 2)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
