/** Tokens per the Ledger design handoff — CSS vars defined in src/tokens.css */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
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
  plugins: [],
};
