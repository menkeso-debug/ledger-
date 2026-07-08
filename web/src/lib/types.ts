export type Tier = 'plat' | 'gold' | 'delta' | 'csr' | 'prime' | 'cpc';

export interface Overview {
  netCash: number;
  netCashChange: { amount: number; pct: number | null };
  cardBalancesOwed: number;
  statementsDue: number;
  spent: { total: number; budget: number };
  spendSeries: { current: { day: number; total: number }[]; previous: { day: number; total: number }[] };
  topCategories: { name: string; spend: number; momPct: number | null; pct: number }[];
  heroInsight: Insight | null;
  accountCount: number;
  hasData: boolean;
}

export interface Account {
  id: string;
  name: string;
  official_name: string | null;
  type: 'depository' | 'credit';
  subtype: string | null;
  tier: Tier;
  mask: string | null;
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  institution_name: string | null;
  balances_updated_at: string | null;
  spark: { series: number[]; up: boolean };
}

export interface Category {
  name: string;
  spend: number;
  budget: number | null;
  momPct: number | null;
  subs: { name: string; spend: number; momPct: number | null }[];
}

export interface Insight {
  id: string;
  kind: string;
  tone: 'neg' | 'amber' | 'accent' | 'pos';
  tag: string;
  title: string;
  body: string;
  impact: string | null;
  impact_sub: string | null;
  cta: string | null;
  updated_at: string;
  created_at: string;
}

export interface Txn {
  id: string;
  date: string;
  merchant: string;
  description: string;
  amount: number;
  category: string | null;
  subcategory: string | null;
  pending: boolean;
  account_name: string;
  tier: Tier;
}

export interface Rewards {
  mqd: {
    target: number;
    targetLabel: string;
    earned: number;
    remaining: number;
    pct: number;
    onTrackBy: string | null;
    drivers: { key: string; name: string; note: string; mqd: number }[];
  };
  pointsThisMonth: { tier: Tier; label: string; program: string; points: number; spend: number }[];
  credits: {
    id: string; name: string; tier: Tier; amount: number; period: string; periodKey: string;
    used: number; remaining: number; daysLeft: number; nudge: boolean;
  }[];
  balances: { program: string; display_name: string; note: string | null; balance: number; updated_at: string }[];
}

export interface CashFlow {
  horizonDays: number;
  expectedIncome: number;
  nextPaydays: { date: string; amount: number; merchant: string; cadence: string }[];
  incomeStreams: {
    merchant: string; cadence: string; gapDays: number; typicalAmount: number;
    lastDate: string; occurrences: number;
    upcoming: { date: string; amount: number }[];
  }[];
  projectedSpend: number;
  recurringTotal: number;
  discretionaryRunRate: number;
  upcomingBills: { merchant: string; date: string; amount: number }[];
  net: number;
  onTrack: boolean;
}

export interface Briefing {
  id: string;
  content: string;
  created_at: string;
}
