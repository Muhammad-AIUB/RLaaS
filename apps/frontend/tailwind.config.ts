import type { Config } from 'tailwindcss';

/**
 * Every color below resolves through a CSS variable holding space-separated
 * RGB channels, so the `/opacity` modifier keeps working (`bg-surface/80`).
 * The variables are defined once per theme in `app/globals.css`, which is what
 * lets light and dark mode swap without touching a single component.
 *
 * See DESIGN.md for why the accent is graphite and color is reserved for
 * allow/block/warn decisions.
 */
const rgb = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const scale = (prefix: string) => ({
  50: rgb(`--${prefix}-50`),
  100: rgb(`--${prefix}-100`),
  200: rgb(`--${prefix}-200`),
  300: rgb(`--${prefix}-300`),
  400: rgb(`--${prefix}-400`),
  500: rgb(`--${prefix}-500`),
  600: rgb(`--${prefix}-600`),
  700: rgb(`--${prefix}-700`),
  800: rgb(`--${prefix}-800`),
  900: rgb(`--${prefix}-900`),
});

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Neutral graphite. Overrides Tailwind's `slate` on purpose: ~230 existing
        // usages then pick up dark mode for free.
        slate: scale('n'),
        // The accent is achromatic — see DESIGN.md, "Color means a decision".
        brand: scale('b'),
        // Semantic. These are the only hues in the product.
        emerald: scale('ok'),
        red: scale('no'),
        amber: scale('warn'),
        blue: scale('info'),

        surface: rgb('--surface'),
        raised: rgb('--raised'),
        canvas: rgb('--canvas'),
        hairline: rgb('--hairline'),
        // Stays dark in both themes: scrims, overlays.
        ink: rgb('--ink-fixed'),

        success: rgb('--ok-600'),
        warning: rgb('--warn-600'),
        danger: rgb('--no-600'),
        info: rgb('--info-600'),
      },
      fontFamily: {
        sans: ['var(--font-ui)', 'ui-sans-serif', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      borderRadius: {
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        // Offset + blur: light comes from above. No zero-offset halos.
        card: '0 1px 1px 0 rgb(var(--shadow) / 0.04), 0 2px 4px -2px rgb(var(--shadow) / 0.08)',
        'card-hover':
          '0 2px 4px -1px rgb(var(--shadow) / 0.06), 0 8px 16px -6px rgb(var(--shadow) / 0.12)',
        overlay:
          '0 8px 12px -4px rgb(var(--shadow) / 0.10), 0 24px 48px -12px rgb(var(--shadow) / 0.24)',
        ring: '0 0 0 3px rgb(var(--b-400) / 0.24)',
      },
      transitionTimingFunction: {
        // Entering motion decelerates; nothing in the product accelerates in.
        enter: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      transitionDuration: {
        state: '120ms',
        enter: '160ms',
      },
      keyframes: {
        // Starts visible. Content is never hidden behind animation timing.
        'rise-in': {
          '0%': { transform: 'translateY(6px)' },
          '100%': { transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'rise-in': 'rise-in 160ms cubic-bezier(0.2, 0, 0, 1)',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
