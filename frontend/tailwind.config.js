import tailwindcssAnimate from 'tailwindcss-animate'

/**
 * Tailwind is layered ON TOP of the existing SCSS token system: every colour/radius here
 * points at a `--color-*` / `--radius-*` custom property from `styles/tokens.scss`, so
 * Tailwind utilities and shadcn components inherit pad's teal identity and the two-axis
 * (preset × mode) theming automatically — no second source of truth, no visual drift.
 * Preflight is off so Tailwind never resets the existing components.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: ['selector', '[data-mode="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        background: 'var(--color-bg-app)',
        foreground: 'var(--color-text-primary)',
        card: { DEFAULT: 'var(--color-bg-surface)', foreground: 'var(--color-text-primary)' },
        popover: { DEFAULT: 'var(--color-bg-surface-3)', foreground: 'var(--color-text-primary)' },
        primary: {
          DEFAULT: 'var(--color-primary)',
          foreground: 'var(--color-on-primary)',
          hover: 'var(--color-primary-hover)',
        },
        secondary: { DEFAULT: 'var(--color-bg-surface-2)', foreground: 'var(--color-text-primary)' },
        muted: { DEFAULT: 'var(--color-bg-surface-2)', foreground: 'var(--color-text-secondary)' },
        accent: { DEFAULT: 'var(--color-primary-bg)', foreground: 'var(--color-primary)' },
        destructive: { DEFAULT: 'var(--color-danger)', foreground: 'var(--color-on-primary)' },
        border: 'var(--color-border)',
        input: 'var(--color-border-strong)',
        ring: 'var(--accent-500)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
        button: 'var(--radius-button)',
      },
      fontFamily: {
        sans: 'var(--font-family-base)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
