import type { Tier } from './types';

// Card-art gradient strings lifted verbatim from the design reference (renderVals()).
const goldChip =
  'repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 5px),repeating-linear-gradient(90deg,rgba(0,0,0,.10) 0 1px,transparent 1px 8px),linear-gradient(135deg,#EBD08A,#B8934A)';
const goldChipDk =
  'repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 5px),repeating-linear-gradient(90deg,rgba(0,0,0,.12) 0 1px,transparent 1px 8px),linear-gradient(135deg,#C9A24B,#8A6A2C)';
const silverChip =
  'repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 5px),repeating-linear-gradient(90deg,rgba(0,0,0,.08) 0 1px,transparent 1px 8px),linear-gradient(135deg,#D6DAE0,#8E949E)';
const lSheen =
  'linear-gradient(103deg,transparent 33%,rgba(255,255,255,.55) 47%,rgba(255,255,255,.12) 53%,transparent 64%)';
const dSheen =
  'linear-gradient(103deg,transparent 34%,rgba(255,255,255,.15) 48%,transparent 61%)';
const embL = '0 1px 0 rgba(255,255,255,.5)';
const embD = '0 1px 2px rgba(0,0,0,.42)';
const edgeL = 'inset 0 1px 1px rgba(255,255,255,.75), inset 0 0 0 1px rgba(255,255,255,.3)';
const edgeD = 'inset 0 1px 0 rgba(255,255,255,.16), inset 0 0 0 1px rgba(255,255,255,.06)';

export interface TierArt {
  issuer: string;
  short: string;
  typeLabel: string;
  base: string;
  glow: string;
  sheen: string;
  fg: string;
  chip: string;
  emboss: string;
  edge: string;
}

export const TIER_ART: Record<Tier, TierArt> = {
  plat: {
    issuer: 'Amex', short: 'Platinum', typeLabel: 'Charge card',
    base: 'linear-gradient(135deg,#EEF0F3 0%,#C9CED6 40%,#AAB0BA 56%,#D2D6DC 76%,#F0F2F5 100%)',
    glow: 'radial-gradient(120% 90% at 0% 0%,rgba(255,255,255,.55),transparent 55%)',
    sheen: lSheen, fg: '#33373F', chip: silverChip, emboss: embL, edge: edgeL,
  },
  gold: {
    issuer: 'Amex', short: 'Gold', typeLabel: 'Charge card',
    base: 'linear-gradient(135deg,#F6E7B0 0%,#DCB65F 40%,#B98A3C 57%,#E3C376 78%,#F7EAB8 100%)',
    glow: 'radial-gradient(120% 90% at 0% 0%,rgba(255,250,230,.5),transparent 55%)',
    sheen: lSheen, fg: '#4A3612', chip: goldChipDk, emboss: embL, edge: edgeL,
  },
  delta: {
    issuer: 'Amex', short: 'Delta Reserve', typeLabel: 'Co-brand',
    base: 'linear-gradient(140deg,#3E568F 0%,#1D2E58 44%,#0C1830 62%,#2B3F76 100%)',
    glow: 'radial-gradient(110% 85% at 100% 0%,rgba(130,170,255,.28),transparent 55%)',
    sheen: dSheen, fg: '#DCE6FF', chip: goldChip, emboss: embD, edge: edgeD,
  },
  csr: {
    issuer: 'Chase', short: 'Sapphire Reserve', typeLabel: 'Visa Infinite',
    base: 'linear-gradient(140deg,#356AC0 0%,#143263 44%,#0A1F44 62%,#20468C 100%)',
    glow: 'radial-gradient(110% 85% at 100% 0%,rgba(120,170,255,.3),transparent 55%)',
    sheen: dSheen, fg: '#D6E3FF', chip: goldChip, emboss: embD, edge: edgeD,
  },
  prime: {
    issuer: 'Chase', short: 'Prime Visa', typeLabel: 'Visa Signature',
    base: 'linear-gradient(140deg,#5A616B 0%,#2E333B 44%,#191C21 62%,#434952 100%)',
    glow: 'radial-gradient(120% 90% at 0% 0%,rgba(255,255,255,.16),transparent 55%)',
    sheen: dSheen, fg: '#E6E8EC', chip: silverChip, emboss: embD, edge: edgeD,
  },
  cpc: {
    issuer: 'Chase', short: 'Private Client', typeLabel: 'Checking',
    base: 'linear-gradient(140deg,#3C3C45 0%,#171719 44%,#0A0A0C 62%,#2B2B31 100%)',
    glow: 'radial-gradient(120% 90% at 100% 0%,rgba(200,200,215,.14),transparent 55%)',
    sheen: dSheen, fg: '#F0F0F2', chip: goldChip, emboss: embD, edge: edgeD,
  },
};

// Program badge gradients (Rewards balances rows)
export const PROGRAM_BADGES: Record<string, string> = {
  amex_mr: 'linear-gradient(135deg,#C9A24B,#E8C77E)',
  chase_ur: 'linear-gradient(135deg,#1B3B6F,#2E5AAC)',
  delta_skymiles: 'linear-gradient(135deg,#0E1B33,#3A4E8C)',
};

// Merchant mark colors — deterministic per merchant initial
const MARK_COLORS = ['#6B7A8F', '#1D1D1F', '#1D8F44', '#8A3A2C', '#2B3A67', '#4A4A52', '#3A5A99', '#1B4D8F', '#7A4A8F', '#8F6B3A'];
export function merchantMark(name: string): { initial: string; bg: string } {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return { initial, bg: MARK_COLORS[h % MARK_COLORS.length] };
}
