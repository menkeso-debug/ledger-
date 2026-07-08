// Rewards rules for the six personal cards. Everything here is intentionally
// declarative so program changes (earn rates, MQD math, credit lineups) are
// one-line edits, not code changes. Amounts in dollars, points in program points.

// --- Delta Medallion qualification ----------------------------------------
export const MQD = {
  // 2026 thresholds: Silver 5k / Gold 10k / Platinum 15k / Diamond 28k
  target: Number(process.env.MQD_TARGET || 15000),
  targetLabel: process.env.MQD_TARGET_LABEL || 'Platinum',
  // Delta Reserve (personal): 1 MQD per $10 of card purchases
  cardSpendPerMqd: 10,
  // Delta fares earn MQDs ~1:1 on ticket price, regardless of card used
  deltaFarePerMqd: 1,
  qualificationYearStart: () => `${new Date().getFullYear()}-01-01`,
};

// Driver buckets shown on the Rewards screen ("What's driving your MQDs").
// Order matters — rows render in this order. Each transaction is attributed to
// the FIRST matching driver.
export const MQD_DRIVERS = [
  {
    key: 'delta_bookings',
    name: 'Delta bookings',
    note: 'Fare dollars → MQDs (any card)',
    match: (t) => /delta air|delta\.com|^delta$/i.test(t.merchant || ''),
    mqd: (t) => t.amount / MQD.deltaFarePerMqd,
  },
  {
    key: 'plastiq_rent',
    name: 'Plastiq rent',
    note: 'Rent routed via Delta Reserve',
    match: (t) => t.tier === 'delta' && /plastiq/i.test(t.merchant || ''),
    mqd: (t) => t.amount / MQD.cardSpendPerMqd,
  },
  {
    key: 'reserve_dining',
    name: 'Everyday dining',
    note: 'Dining on Delta Reserve',
    match: (t) => t.tier === 'delta' && t.category === 'Dining',
    mqd: (t) => t.amount / MQD.cardSpendPerMqd,
  },
  {
    key: 'reserve_spend',
    name: 'Delta Reserve spend',
    note: 'All other Reserve purchases',
    match: (t) => t.tier === 'delta',
    mqd: (t) => t.amount / MQD.cardSpendPerMqd,
  },
];

// --- Points earn rates per card tier ---------------------------------------
// rate(t) returns points per dollar for a spend transaction on that card.
export const EARN_RATES = {
  plat: {
    program: 'amex_mr',
    label: 'Amex Platinum',
    rate: (t) => (t.category === 'Travel' && t.subcategory === 'Flights' ? 5 : 1),
  },
  gold: {
    program: 'amex_mr',
    label: 'Amex Gold',
    rate: (t) =>
      t.category === 'Dining' ? 4 :
      t.category === 'Groceries' ? 4 :
      t.category === 'Travel' && t.subcategory === 'Flights' ? 3 : 1,
  },
  delta: {
    program: 'delta_skymiles',
    label: 'Delta Reserve',
    rate: (t) => (/delta/i.test(t.merchant || '') ? 3 : 1),
  },
  csr: {
    program: 'chase_ur',
    label: 'Sapphire Reserve',
    rate: (t) => (t.category === 'Dining' || t.category === 'Travel' ? 3 : 1),
  },
  prime: {
    program: 'chase_ur',
    label: 'Prime Visa',
    rate: (t) =>
      /amazon|whole foods/i.test(t.merchant || '') ? 5 :
      t.category === 'Dining' ? 2 :
      t.subcategory === 'Gas' ? 2 : 1,
  },
  cpc: { program: null, label: 'Private Client', rate: () => 0 },
  // Capital One: default 2x-everything (Venture X). Adjust if it's a Savor
  // (3x dining/groceries/entertainment, 1x else) or Quicksilver (1.5x flat).
  capone: {
    program: 'capone_miles',
    label: 'Capital One',
    rate: () => 2,
  },
  // Apple Card Daily Cash lands as statement credit, not a points balance — no tracking.
  apple: { program: null, label: 'Apple Card', rate: () => 0 },
  other: { program: null, label: 'Other card', rate: () => 0 },
};

// --- Card statement credits -------------------------------------------------
// period: monthly | semiannual | annual. `match` is tested against merchant+name.
// Usage = qualifying spend matched this period, capped at `amount`.
// nudgeDays: raise an "Almost there" insight when remaining > 0 within N days of period end.
export const CREDITS = [
  {
    id: 'gold_dining',
    tier: 'gold',
    name: 'Amex Gold dining credit',
    amount: 10,
    period: 'monthly',
    match: /grubhub|cheesecake factory|goldbelly|wine\.com|milk bar|five guys/i,
    nudgeDays: 10,
  },
  {
    id: 'gold_resy',
    tier: 'gold',
    name: 'Amex Gold Resy credit',
    amount: 50,
    period: 'semiannual',
    match: /resy/i,
    nudgeDays: 30,
  },
  {
    id: 'plat_digital',
    tier: 'plat',
    name: 'Platinum digital entertainment credit',
    amount: 20,
    period: 'monthly',
    match: /disney|hulu|espn|peacock|nytimes|new york times|wall street journal|audible/i,
    nudgeDays: 10,
  },
  {
    id: 'plat_uber',
    tier: 'plat',
    name: 'Platinum Uber Cash',
    amount: 15,
    period: 'monthly',
    match: /uber/i,
    nudgeDays: 10,
  },
  {
    id: 'plat_saks',
    tier: 'plat',
    name: 'Platinum Saks credit',
    amount: 50,
    period: 'semiannual',
    match: /saks/i,
    nudgeDays: 30,
  },
  {
    id: 'plat_airline_fee',
    tier: 'plat',
    name: 'Platinum airline fee credit',
    amount: 200,
    period: 'annual',
    match: /airline fee|baggage|seat selection/i,
    nudgeDays: 60,
  },
  {
    id: 'delta_resy',
    tier: 'delta',
    name: 'Delta Reserve Resy credit',
    amount: 20,
    period: 'monthly',
    match: /resy/i,
    nudgeDays: 10,
  },
];

export function periodBounds(period, now = new Date()) {
  const y = now.getFullYear();
  if (period === 'monthly') {
    const start = new Date(y, now.getMonth(), 1);
    const end = new Date(y, now.getMonth() + 1, 0);
    return { start, end, key: `${y}-${String(now.getMonth() + 1).padStart(2, '0')}` };
  }
  if (period === 'semiannual') {
    const h2 = now.getMonth() >= 6;
    return {
      start: new Date(y, h2 ? 6 : 0, 1),
      end: new Date(y, h2 ? 12 : 6, 0),
      key: `${y}-H${h2 ? 2 : 1}`,
    };
  }
  return { start: new Date(y, 0, 1), end: new Date(y, 12, 0), key: `${y}` };
}
