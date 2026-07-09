import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';
import type { Overview, Account, Category, Insight, Txn, Rewards, Briefing, CashFlow } from './lib/types';

export type Status = 'loading' | 'ready' | 'empty' | 'error';
export interface Domain<T> { status: Status; data: T | null; }

interface Store {
  overview: Domain<Overview>;
  accounts: Domain<Account[]>;
  categories: Domain<Category[]>;
  insights: Domain<Insight[]>;
  transactions: Domain<Txn[]>;
  rewards: Domain<Rewards>;
  briefing: Domain<Briefing>;
  cashflow: Domain<CashFlow>;
  categoryNames: string[];
  addCategoryName: (name: string) => Promise<void>;
  renameCategory: (from: string, to: string) => Promise<void>;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
  dismissInsight: (id: string) => Promise<void>;
  syncedAt: string | null;
  syncing: boolean;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
};

function domainState<T>(data: T | null, isEmpty: (d: T) => boolean, error = false): Domain<T> {
  if (error) return { status: 'error', data: null };
  if (data == null) return { status: 'empty', data: null };
  return { status: isEmpty(data) ? 'empty' : 'ready', data };
}

const loading = { status: 'loading' as Status, data: null };

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [overview, setOverview] = useState<Domain<Overview>>(loading);
  const [accounts, setAccounts] = useState<Domain<Account[]>>(loading);
  const [categories, setCategories] = useState<Domain<Category[]>>(loading);
  const [insights, setInsights] = useState<Domain<Insight[]>>(loading);
  const [transactions, setTransactions] = useState<Domain<Txn[]>>(loading);
  const [rewards, setRewards] = useState<Domain<Rewards>>(loading);
  const [briefing, setBriefing] = useState<Domain<Briefing>>(loading);
  const [cashflow, setCashflow] = useState<Domain<CashFlow>>(loading);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    await Promise.all([
      api.get<Overview>('/api/overview')
        .then((d) => setOverview(domainState(d, (x) => !x.hasData)))
        .catch(() => setOverview({ status: 'error', data: null })),
      api.get<Account[]>('/api/accounts')
        .then((d) => setAccounts(domainState(d, (x) => x.length === 0)))
        .catch(() => setAccounts({ status: 'error', data: null })),
      api.get<Category[]>('/api/categories')
        .then((d) => setCategories(domainState(d, (x) => x.length === 0)))
        .catch(() => setCategories({ status: 'error', data: null })),
      api.get<Insight[]>('/api/insights')
        .then((d) => setInsights(domainState(d, (x) => x.length === 0)))
        .catch(() => setInsights({ status: 'error', data: null })),
      api.get<Txn[]>('/api/transactions?limit=200')
        .then((d) => setTransactions(domainState(d, (x) => x.length === 0)))
        .catch(() => setTransactions({ status: 'error', data: null })),
      api.get<Rewards>('/api/rewards')
        .then((d) => setRewards({ status: 'ready', data: d }))
        .catch(() => setRewards({ status: 'error', data: null })),
      api.get<Briefing | null>('/api/advisor/briefing')
        .then((d) => setBriefing(d ? { status: 'ready', data: d } : { status: 'empty', data: null }))
        .catch(() => setBriefing({ status: 'error', data: null })),
      api.get<CashFlow>('/api/cashflow')
        .then((d) => setCashflow(domainState(d, (x) => x.expectedIncome === 0 && x.projectedSpend === 0)))
        .catch(() => setCashflow({ status: 'error', data: null })),
      api.get<string[]>('/api/category-names')
        .then(setCategoryNames)
        .catch(() => {}),
    ]);
  }, []);

  const addCategoryName = useCallback(async (name: string) => {
    await api.post('/api/category-names', { name });
    setCategoryNames((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
  }, []);

  const renameCategory = useCallback(async (from: string, to: string) => {
    await api.post('/api/category-names/rename', { from, to });
    await refresh();
  }, [refresh]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await api.post('/api/plaid/sync');
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const dismissInsight = useCallback(async (id: string) => {
    await api.post(`/api/insights/${id}/dismiss`);
    setInsights((prev) =>
      prev.data
        ? domainState(prev.data.filter((i) => i.id !== id), (x) => x.length === 0)
        : prev
    );
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // SaaS-style liveness: silent background refetch every 45s (webhook syncs,
  // backfill, cron insights land without a reload) + refresh when the tab
  // regains focus. Data swaps in place — no loading flicker, statuses only
  // change when new responses arrive.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 45_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const syncedAt = useMemo(() => {
    const ts = accounts.data
      ?.map((a) => a.balances_updated_at)
      .filter(Boolean)
      .sort()
      .pop();
    return ts ?? null;
  }, [accounts.data]);

  const value: Store = {
    overview, accounts, categories, insights, transactions, rewards, briefing, cashflow,
    categoryNames, addCategoryName, renameCategory,
    refresh, syncNow, dismissInsight, syncedAt, syncing,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
