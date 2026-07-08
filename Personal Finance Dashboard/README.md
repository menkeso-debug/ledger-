# Handoff: Ledger — Personal Finance Dashboard

## Overview
Ledger is a single-user household finance dashboard with an Apple-clean, premium-SaaS aesthetic (Apple Card × Mercury × Copilot Money). It has six primary screens — Overview, Accounts, Categories, Insights, Transactions, Rewards — plus a Design System reference screen. Light mode is primary; a full dark mode is included. The build target is **React + Tailwind CSS**.

## About the Design Files
The file in this bundle (`Finance Dashboard.dc.html`) is a **design reference created in HTML** — a working prototype that demonstrates the intended look, layout, and behavior. It is **not production code to copy directly.** Your task is to **recreate these designs in the target codebase's environment** using its established patterns (React components, Tailwind config, icon library, data layer). If no environment exists yet, scaffold a fresh **Vite + React + TypeScript + Tailwind** app and implement there.

The prototype uses inline styles and CSS custom properties for theming. When you port it, translate those into Tailwind tokens (see **Design Tokens** → the `tailwind.config` block) and real components. There is **no backend** — all data is mock. Wire the components to props/fetch in your app.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and interactions are all specified below and should be reproduced pixel-accurately using your codebase's libraries. Recreate faithfully; do not restyle.

---

## Design Tokens

All theming runs off CSS custom properties with a `.theme-dark` override. Port these to Tailwind (`darkMode: 'class'`, toggle a `dark` class on the root). Semantic colors are reserved **only** for financial signal — do not use the accent for category coding.

### Colors — Light (`:root`)
| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#F5F5F7` | App background |
| `--surface` | `#FFFFFF` | Cards / panels |
| `--surface-2` | `#FBFBFD` | Subtle inset (expanded rows, toggles) |
| `--surface-3` | `#F0F0F2` | Track/tag backgrounds |
| `--text` | `#1D1D1F` | Primary text |
| `--text-2` | `#6E6E73` | Secondary text |
| `--text-3` | `#A1A1A6` | Tertiary / captions |
| `--hairline` | `rgba(0,0,0,0.07)` | Borders / gridlines |
| `--hairline-2` | `rgba(0,0,0,0.04)` | Inner row dividers |
| `--accent` | `#0A84FF` | Primary accent (iOS blue) |
| `--accent-2` | `#0071E3` | Accent gradient partner |
| `--accent-soft` | `rgba(10,132,255,0.10)` | Accent tint bg |
| `--pos` | `#1D8F44` | Positive / favorable |
| `--pos-soft` | `rgba(52,199,89,0.14)` | Positive tint |
| `--neg` | `#D8342A` | Negative / overspend |
| `--neg-soft` | `rgba(255,59,48,0.10)` | Negative tint |
| `--amber` | `#B25E00` | Caution / deadline |
| `--amber-soft` | `rgba(255,159,10,0.14)` | Caution tint |

### Colors — Dark (`.theme-dark`)
| Token | Hex |
|---|---|
| `--canvas` | `#000000` |
| `--surface` | `#1C1C1E` |
| `--surface-2` | `#242426` |
| `--surface-3` | `#2C2C2E` |
| `--text` | `#F5F5F7` |
| `--text-2` | `#98989D` |
| `--text-3` | `#636366` |
| `--hairline` | `rgba(255,255,255,0.10)` |
| `--hairline-2` | `rgba(255,255,255,0.05)` |
| `--accent` | `#0A84FF` (`--accent-2` `#409CFF`) |
| `--pos` | `#30D158` |
| `--neg` | `#FF453A` |
| `--amber` | `#FFD60A` |

### Shadows
- `--shadow-sm` (light): `0 1px 2px rgba(0,0,0,0.05)`
- `--shadow` (light): `0 1px 3px rgba(0,0,0,0.05), 0 12px 28px -14px rgba(0,0,0,0.14)`
- `--shadow-lg` (light): `0 2px 6px rgba(0,0,0,0.04), 0 30px 60px -20px rgba(0,0,0,0.22)`
- Dark equivalents deepen alpha (`0.4`–`0.8`); see the `<style>` block in the HTML.

### Radius scale
`8px` (chips/small), `11px` (buttons/nav items), `12–15px` (card tiles, controls), `18px` (insight cards), `20px` (list container), `22px` (primary panels).

### Spacing scale
`4 · 8 · 12 · 16 · 20 · 22 · 24 · 26 · 28px`. Panel padding is typically `22–28px`; screen gutter `44px` desktop, `16–18px` mobile.

### Typography — Inter (weights 400/450/500/600/700; use 650/660/680 via `font-weight` where noted)
All numeric values use `font-variant-numeric: tabular-nums; letter-spacing: -0.01em` (the `.num` class).
| Role | Size | Weight | Tracking |
|---|---|---|---|
| Hero balance | `clamp(38px,9vw,52px)` | 680 | -0.035em |
| Secondary figure | 34px | 660 | -0.03em |
| Screen title (h1) | `clamp(24px,4.4vw,30px)` | 650 | -0.03em |
| Insight impact anchor | 30px | 680 | -0.03em |
| Card balance | 22px | 660 | -0.02em |
| Section heading | 15px | 600 | — |
| Body | 14px | 450 | 1.5 lh |
| Caption/eyebrow | 12–13px | 500 | — |
| Tag/label (uppercase) | 11px | 600 | 0.03em |

### Tailwind config starter
```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)', surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)', 'surface-3': 'var(--surface-3)',
        ink: 'var(--text)', 'ink-2': 'var(--text-2)', 'ink-3': 'var(--text-3)',
        accent: 'var(--accent)', 'accent-2': 'var(--accent-2)',
        pos: 'var(--pos)', neg: 'var(--neg)', amber: 'var(--amber)',
      },
      borderColor: { hairline: 'var(--hairline)', 'hairline-2': 'var(--hairline-2)' },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.05), 0 12px 28px -14px rgba(0,0,0,0.14)',
        lift: '0 2px 6px rgba(0,0,0,0.04), 0 30px 60px -20px rgba(0,0,0,0.22)',
      },
      borderRadius: { tile: '15px', card: '22px', panel: '22px' },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
};
```
Define the CSS variables in a global stylesheet (`:root` + `.dark`) and let Tailwind reference them, so both themes share one component tree.

---

## App Shell / Layout

- **Root**: full-height flex row. `<Sidebar>` (fixed `248px`, sticky, `border-right: hairline`, `surface` bg) + `<Main>` (`flex:1`, `max-width:1180px`, centered).
- **Sidebar** contents: brand lockup (30px rounded-square logo + "Ledger / Household finance"), vertical nav, and a footer with the theme toggle + user chip.
- **Nav item**: `display:flex; gap:11px; padding:9px 12px; radius:11px`. Active = `text` color, weight 600, `surface-2` bg, accent dot; inactive = `text-2`, faded dot. "Insights" carries a `5` badge (accent pill).
- **Header** (per screen): eyebrow caption + h1 on the left; on the right a **preview-state segmented control** (Live / Loading / Empty — this is a demo affordance to exercise loading/empty states; omit or repurpose in production), a "Synced · Jul 8" status pill (green dot), and a search button (`⌕`, 40px square).
- **Responsive**: at `≤880px` the sidebar becomes a sticky horizontal top bar (brand + horizontally-scrolling nav + theme toggle; user chip hidden). At `≤720px` the Categories budget column is hidden. Big numbers use `clamp()`.

---

## Screens / Views

### 1. Overview ("Good morning, Jordan")
The daily read. Vertical stack, `gap:22px`.
- **Hero row** — responsive 2-up grid (`repeat(auto-fit,minmax(320px,1fr))`):
  - **Net cash card**: label "Net cash available"; hero figure `$84,320.44` (the `.44` is 26px `text-3`); a green `↑ 2.4%` pill + "+$1,980 this month". Footer (top-hairline) has two stats: **Card balances owed** `$17,710`, and **Statements due** — `$4,210` rendered in **amber** with an amber "Due in 6d" pill (this is the most time-sensitive number; keep it visually elevated, escalate toward `--neg` as the due date approaches).
  - **Spent in July card**: label + "of $20,000 budget"; figure `$18,240` (34px); a budget progress bar (91% filled, accent gradient) with "91% used / $1,760 left"; then the **spend chart** (see Components → Spend area chart).
- **Cards row**: horizontally-scrolling row of the 6 account **card tiles** (200px wide) each with balance + sublabel beneath. Header "Cards" with an "All accounts →" link.
- **Intelligence row** — responsive 2-up:
  - **Ledger Intelligence panel**: accent sparkle badge + label; headline "Dining is up **22%** this month — $3,120 vs your usual $2,560, driven by 3 new merchants."; two buttons ("See breakdown" filled accent, "Set a limit" outline). Has loading (skeleton) + empty ("Warming up your daily read") states.
  - **Top categories**: 4 rows (Housing/Travel/Dining/Groceries) each with name, spend, a thin progress bar, and a MoM change chip.

### 2. Accounts ("6 accounts")
Responsive grid (`repeat(auto-fill,minmax(340px,1fr))`, `gap:20px`) of 6 account cards. Each card = a **premium card tile** (112px square) + name / type + `•••• last4` / balance, with a footer showing the sublabel, a **trend line** (`↑ higher than usual` etc.), and a **sparkline**. Tapping a card drills into that account's transactions.

Accounts (mock): Amex Platinum `-$4,210`, Amex Gold `-$2,880`, Amex Delta Reserve `-$6,540`, Chase Sapphire Reserve `-$3,120`, Chase Prime Visa `-$960`, Chase Private Client (checking) `$84,320` available.

### 3. Categories ("July spending")
A single `surface` panel, radius 22, containing an expandable tree. A header row (`Category / Spent / Budget / vs last mo.`) then category rows via a shared CSS grid `1.6fr 1fr 1fr 130px`.
- **Category row**: caret (rotates 90° when open), a neutral mono square, name; right-aligned tabular spend; a budget cell (thin bar — accent gradient, or solid `--neg` when over budget — plus "spent / budget" text); a MoM change chip.
- **Expanded subrows**: `surface-2` background with a `3px` accent left spine (`box-shadow: inset 3px 0 0 rgba(10,132,255,0.28)`), indented `60px`, using the same grid so numbers stay aligned.
- Data: Housing (Rent via Plastiq / Utilities), Travel (Flights/Hotels/Rideshare), Dining (Restaurants/Delivery/Coffee), Shopping (Apparel/Home), Groceries (Whole Foods/Farmers Market). `Dining` open by default.
- Keep category coding **neutral/monochrome** — no rainbow.

### 4. Insights ("Ledger Intelligence")
Max-width 820. An **ask-anything input** (sparkle icon, placeholder "Ask about your spending — …", filled "Ask" button), a row of suggestion chips, then the **advisory feed** (`gap:14px`).
- **Insight card** (the anchor pattern): a horizontal card — left column has a tonal dot + uppercase tag + relative time, a 17px title, a 14px body, and inline text actions ("<cta> →", "Dismiss"); the **right column is a large tonal impact figure** (30px/680, colored by tone) + a small sub-label. This impact number is the intended visual anchor.
- Tones: `Overspend`→neg, `Bill jumped`→amber, `New recurring`→accent, `Opportunity`→pos, `Almost there`→accent.
- Feed has **loading** (3 skeleton cards) and **empty** ("You're all caught up") states.

### 5. Transactions ("All activity")
A search field + filter chips (`All` active / `Cards` / `Dining` / `This month`), then a `surface` list panel. Rows are date-grouped: a `surface-2` day header (`Today · Jul 8`, etc.), then transaction rows = a colored square merchant mark (initial), merchant + account, a category tag pill, and a right-aligned tabular amount (income shown `+` in `--pos`). Has **loading** (skeleton rows) and **empty** ("No transactions found") states.

### 6. Rewards ("Status & points")
- **Delta Medallion card** (fixed dark gradient `linear-gradient(155deg,#12203C,#0A1424)` with a radial glow): a **progress ring** (68%, blue→violet gradient stroke, `%` + "to Platinum" centered) beside "Platinum pace" and "8,200 / 12,000 MQDs · 3,800 to go. On track by November." Responsive stack with the next card.
- **Rewards balances**: 3 rows (Amex MR 318,400 / Chase UR 142,300 / Delta SkyMiles 96,120) each with a small gradient badge and right-aligned value.
- **"What's driving your MQDs"**: 4 driver rows (Delta Reserve spend, Plastiq rent, Amex Platinum flights, Everyday dining), each a label + a horizontal progress bar (navy→light-blue gradient) + right-aligned value.

### 7. Design System (reference)
Swatch grid (8 tokens), an Inter type-scale list, and a radius/shadow/spacing specimen block. Reproduce as a living style-guide route if useful.

---

## Key Components (build these)

- **CardTile** — the premium metal card art. Composed of **three stacked backgrounds**: `glow` (corner radial highlight), `sheen` (diagonal light streak, `linear-gradient(103deg,…)`), and `base` (the tier gradient) — plus `box-shadow: <edge inset> , <drop shadow>` and inherited `text-shadow` for emboss. Tiers:
  - *Platinum* — cool brushed silver, light sheen, silver chip, dark text.
  - *Gold* — warm gold gradient, light sheen, darker gold chip, dark text.
  - *Delta Reserve* — deep navy metallic, blue corner glow, gold chip, light text.
  - *Sapphire Reserve* — sapphire blue, blue glow, gold chip, light text.
  - *Prime Visa* — graphite steel, silver chip, light text.
  - *Private Client* — obsidian black, gold chip, light text.
  - The **chip** is a layered background: two `repeating-linear-gradient`s (contact lines) over a metal gradient, with inset highlight/shadow. Exact gradient strings are in the HTML `renderVals()` — lift them verbatim.
- **Sparkline** — small polyline (viewBox `120×34`, `preserveAspectRatio="none"`, stroke-width 2, round caps, end dot). **Color = financial impact, not line slope**: favorable → `--pos`, unfavorable → `--neg`. Rule used: for the asset (checking) account favorable = balance up; for liability cards favorable = spend/balance *lower* than usual (`!up`). If a metric's good/bad direction is ambiguous, render it **neutral** (`--text-3`) rather than guessing.
- **Spend area chart** — SVG (viewBox `320×96`, `preserveAspectRatio="none"`): 2 dashed gridlines + a solid baseline (`--hairline`); an area fill (accent gradient `0.30→0.02`); a dashed prev-month line (`--text-3`, 55% opacity); the current line (`--accent`, stroke-width **3**, round). Overlaid HTML labels: `$0` bottom-left, and current value (`$18,240`, accent, bold) with a haloed accent dot at top-right (label sits *left* of the dot so it doesn't clip). Below: axis labels `Jul 1` / `Jul 8` and a legend ("This month" solid / "Last month" dashed).
- **ProgressRing** — SVG circle, `r=58`, stroke-width 12, gradient stroke, `stroke-dasharray = circumference·pct , circumference`, rotated -90°.
- **ChangeChip** — pill: `↑/↓ N%`, colored `--pos`/`--neg`/`--text-3`, tinted bg. Helper takes `(pct, invert)` — `invert` flips good/bad for spend metrics.
- **Skeleton** — `.sk`: `linear-gradient(90deg, surface-3 25%, hairline 38%, surface-3 62%)`, `background-size:200% 100%`, `@keyframes shimmer` 1.5s ease-in-out infinite.
- **EmptyState** — centered tinted icon square + 17px title + 14px `text-2` body.
- **ThemeToggle** — pill with sliding knob; toggles `dark` class on root.

## Interactions & Behavior
- **Nav**: clicking a nav item switches the active screen (single-page state, no route change in the prototype — use your router).
- **Theme toggle**: switches light/dark by toggling the root class; all tokens are CSS vars so the whole tree re-themes. Root has `transition: background .3s, color .3s`. Persist choice (localStorage / prefers-color-scheme) in production.
- **Category rows**: click toggles expand/collapse (caret rotates 90°, subrows reveal). Track open state per category.
- **Account card / transaction row**: click → drill into account transactions.
- **Preview-state control**: Live / Loading / Empty switches the mock data state to exercise skeleton and empty states on Overview (intelligence panel + chart), Insights (feed), and Transactions (list). In production, drive these from real fetch status.
- **Chart**: static in the prototype; if animating, ease the line draw / area fade ~400ms.

## State Management
- `screen`: which view is active.
- `theme`: `'light' | 'dark'`.
- `dataState`: `'ready' | 'loading' | 'empty'` (maps to real request status per data domain in production).
- `openCategories`: set/map of expanded category ids.
- Data domains to fetch: accounts (balances, spark series, trend), spend summary + monthly series (current + prior), category tree (spend/budget/MoM), insights feed, transactions (grouped by day), rewards (status pace, points balances, MQD drivers).

## Assets
No external image/icon assets — all card art, chips, charts, rings, and sparklines are pure CSS/SVG (values in the HTML). Font: **Inter** via Google Fonts (weights 400/450/500/600/700). Glyphs used (`⌕`, `✦`, `↑`, `↓`, `›`) can be swapped for your icon library (e.g. lucide/SF Symbols). Merchant marks are colored initials — swap for real merchant logos when available.

## Files
- `Finance Dashboard.dc.html` — the complete hifi design reference (all 6 screens + design-system screen, both themes, all component logic and exact gradient/token strings in its embedded script).
