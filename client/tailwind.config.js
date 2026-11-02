import colors from 'tailwindcss/colors';

// Semantic colours come from CSS variables (src/index.css), so light and
// dark themes swap in one place. Values follow
// design-system/transtrack-kenya/MASTER.md.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: token('bg'),
        foreground: token('fg'),
        card: { DEFAULT: token('card'), foreground: token('fg') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-fg') },
        border: token('border'),
        ring: token('ring'),
        link: token('link'),
        primary: {
          DEFAULT: token('primary'),
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a',
        },
        accent: {
          DEFAULT: token('accent'),
          cyan: '#0891b2',
          violet: '#7c3aed',
          emerald: '#059669',
          amber: '#d97706',
          rose: '#e11d48',
        },
        danger: token('danger'),
        // Slate, with the shades used for secondary text (400/500) bound to
        // theme variables so they meet 4.5:1 contrast in light and dark.
        gray: { ...colors.slate, 400: token('gray-400'), 500: token('gray-500') },
        // Older class names, kept so existing pages pick up the tokens.
        surface: { light: token('card'), dark: token('bg'), darkCard: token('card') },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
        md: '0 4px 6px rgba(15, 23, 42, 0.08)',
        lg: '0 10px 15px rgba(15, 23, 42, 0.10)',
        xl: '0 20px 25px rgba(15, 23, 42, 0.14)',
        // Older names; the flat style has no glow or glass shadows.
        glass: '0 1px 2px rgba(15, 23, 42, 0.06)',
        'glass-dark': '0 1px 2px rgba(0, 0, 0, 0.4)',
        glow: 'none',
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 1.8s linear infinite',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: 0.7 },
          '70%': { transform: 'scale(1.6)', opacity: 0 },
          '100%': { transform: 'scale(0.9)', opacity: 0 },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
    },
  },
  plugins: [],
}
