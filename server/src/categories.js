// Maps Plaid personal_finance_category (primary/detailed) + merchant heuristics
// to Ledger's display taxonomy: parent category + subcategory.
// Keep category coding neutral — this drives the Categories tree and analytics rollups.

const DETAILED_MAP = {
  // Housing
  RENT_AND_UTILITIES_RENT: ['Housing', 'Rent'],
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: ['Housing', 'Utilities'],
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: ['Housing', 'Utilities'],
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: ['Housing', 'Utilities'],
  RENT_AND_UTILITIES_TELEPHONE: ['Housing', 'Utilities'],
  RENT_AND_UTILITIES_WATER: ['Housing', 'Utilities'],
  RENT_AND_UTILITIES_OTHER_UTILITIES: ['Housing', 'Utilities'],
  MORTGAGE_AND_RENT: ['Housing', 'Rent'],

  // Travel
  TRAVEL_FLIGHTS: ['Travel', 'Flights'],
  TRAVEL_LODGING: ['Travel', 'Hotels'],
  TRAVEL_RENTAL_CARS: ['Travel', 'Rental cars'],
  TRAVEL_OTHER_TRAVEL: ['Travel', 'Other travel'],
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: ['Travel', 'Rideshare'],

  // Transport (local, non-travel)
  TRANSPORTATION_GAS: ['Transport', 'Gas'],
  TRANSPORTATION_PARKING: ['Transport', 'Parking'],
  TRANSPORTATION_PUBLIC_TRANSIT: ['Transport', 'Transit'],
  TRANSPORTATION_TOLLS: ['Transport', 'Tolls'],
  TRANSPORTATION_OTHER_TRANSPORTATION: ['Transport', 'Other'],

  // Dining
  FOOD_AND_DRINK_RESTAURANT: ['Dining', 'Restaurants'],
  FOOD_AND_DRINK_FAST_FOOD: ['Dining', 'Fast food'],
  FOOD_AND_DRINK_COFFEE: ['Dining', 'Coffee'],
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: ['Dining', 'Bars'],
  FOOD_AND_DRINK_VENDING_MACHINES: ['Dining', 'Other'],
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: ['Dining', 'Other'],

  // Groceries
  FOOD_AND_DRINK_GROCERIES: ['Groceries', 'Groceries'],

  // Shopping
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: ['Shopping', 'Apparel'],
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: ['Shopping', 'Department stores'],
  GENERAL_MERCHANDISE_ELECTRONICS: ['Shopping', 'Electronics'],
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: ['Shopping', 'Online'],
  GENERAL_MERCHANDISE_SPORTING_GOODS: ['Shopping', 'Sporting goods'],
  GENERAL_MERCHANDISE_SUPERSTORES: ['Shopping', 'Superstores'],
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: ['Shopping', 'Gifts'],
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: ['Shopping', 'Office'],
  GENERAL_MERCHANDISE_PET_SUPPLIES: ['Shopping', 'Pets'],
  GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE: ['Shopping', 'Other'],
  HOME_IMPROVEMENT_FURNITURE: ['Shopping', 'Home'],
  HOME_IMPROVEMENT_HARDWARE: ['Shopping', 'Home'],
  HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT: ['Shopping', 'Home'],

  // Subscriptions / entertainment
  ENTERTAINMENT_TV_AND_MOVIES: ['Subscriptions', 'Streaming'],
  ENTERTAINMENT_MUSIC_AND_AUDIO: ['Subscriptions', 'Music'],
  ENTERTAINMENT_VIDEO_GAMES: ['Subscriptions', 'Gaming'],
  GENERAL_SERVICES_SUBSCRIPTION: ['Subscriptions', 'Services'],

  // Kids
  GENERAL_SERVICES_CHILDCARE: ['Kids', 'Childcare'],
  GENERAL_SERVICES_EDUCATION: ['Kids', 'Education'],

  // Health
  MEDICAL_PRIMARY_CARE: ['Health', 'Medical'],
  MEDICAL_DENTAL_CARE: ['Health', 'Dental'],
  MEDICAL_EYE_CARE: ['Health', 'Vision'],
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: ['Health', 'Pharmacy'],
  MEDICAL_OTHER_MEDICAL: ['Health', 'Medical'],
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: ['Health', 'Fitness'],
};

const PRIMARY_MAP = {
  RENT_AND_UTILITIES: ['Housing', 'Utilities'],
  TRAVEL: ['Travel', 'Other travel'],
  TRANSPORTATION: ['Transport', 'Other'],
  FOOD_AND_DRINK: ['Dining', 'Other'],
  GENERAL_MERCHANDISE: ['Shopping', 'Other'],
  HOME_IMPROVEMENT: ['Shopping', 'Home'],
  ENTERTAINMENT: ['Subscriptions', 'Entertainment'],
  MEDICAL: ['Health', 'Medical'],
  PERSONAL_CARE: ['Health', 'Personal care'],
  GENERAL_SERVICES: ['Other', 'Services'],
  GOVERNMENT_AND_NON_PROFIT: ['Other', 'Government'],
  BANK_FEES: ['Other', 'Fees'],
  INCOME: ['Income', 'Income'],
  TRANSFER_IN: ['Transfer', 'Transfer in'],
  TRANSFER_OUT: ['Transfer', 'Transfer out'],
  LOAN_PAYMENTS: ['Transfer', 'Loan payments'],
};

// Merchant-level overrides applied before PFC mapping. Order matters —
// first match wins (Whole Foods must precede the generic Amazon rule).
const MERCHANT_RULES = [
  { match: /melio/i, to: ['Housing', 'Rent — via Melio'] },
  { match: /plastiq/i, to: ['Housing', 'Rent — via Plastiq'] },
  { match: /delta air|delta.com/i, to: ['Travel', 'Flights'] },
  { match: /whole foods|wholefds/i, to: ['Groceries', 'Whole Foods'] },
  { match: /amazon fresh/i, to: ['Groceries', 'Amazon Fresh'] },
  { match: /amzn|amazon/i, to: ['Shopping', 'Amazon'] },
  { match: /farmers market/i, to: ['Groceries', 'Farmers Market'] },
];

export function merchantKey(merchantName, name) {
  return (merchantName || name || '').trim().toLowerCase();
}

// `overrides` is an optional Map(merchant_key -> {category, subcategory}) of
// user recategorizations — they beat every built-in rule.
export function categorize({ merchantName, name, pfcPrimary, pfcDetailed }, overrides = null) {
  if (overrides) {
    const o = overrides.get(merchantKey(merchantName, name));
    if (o) return { category: o.category, subcategory: o.subcategory || 'Other' };
  }
  const hay = `${merchantName || ''} ${name || ''}`;
  for (const rule of MERCHANT_RULES) {
    if (rule.match.test(hay)) return { category: rule.to[0], subcategory: rule.to[1] };
  }
  if (pfcDetailed && DETAILED_MAP[pfcDetailed]) {
    const [category, subcategory] = DETAILED_MAP[pfcDetailed];
    return { category, subcategory };
  }
  if (pfcPrimary && PRIMARY_MAP[pfcPrimary]) {
    const [category, subcategory] = PRIMARY_MAP[pfcPrimary];
    return { category, subcategory };
  }
  return { category: 'Other', subcategory: 'Uncategorized' };
}

// Categories excluded from "spend" rollups (not real outflow spend).
export const NON_SPEND_CATEGORIES = ['Income', 'Transfer'];

// Card-art tier matcher: maps a Plaid account to one of the six CardTile tiers.
export function matchTier({ name, officialName, subtype, type }) {
  const hay = `${name || ''} ${officialName || ''}`.toLowerCase();
  if (type === 'depository') return 'cpc';
  if (/delta/.test(hay)) return 'delta';
  if (/platinum/.test(hay)) return 'plat';
  if (/gold/.test(hay)) return 'gold';
  if (/sapphire/.test(hay)) return 'csr';
  if (/prime|amazon/.test(hay)) return 'prime';
  if (/capital one|venture|savor|quicksilver/.test(hay)) return 'capone';
  return 'other'; // neutral graphite tile; labels come from the account itself
}
