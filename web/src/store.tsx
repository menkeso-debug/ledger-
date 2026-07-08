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
    ]);
  }, []);

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
    refresh, syncNow, dismissInsight, syncedAt, syncing,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
