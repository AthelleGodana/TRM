/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a',
        },
        surface: {
          light: '#ffffff',
          dark: '#0f172a',
          darkCard: '#111827',
        },
        accent: {
          cyan: '#22d3ee',
          violet: '#8b5cf6',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh-light': 'radial-gradient(at 0% 0%, rgba(59,130,246,0.12) 0, transparent 50%), radial-gradient(at 100% 0%, rgba(139,92,246,0.10) 0, transparent 50%), radial-gradient(at 100% 100%, rgba(34,211,238,0.10) 0, transparent 50%)',
        'mesh-dark': 'radial-gradient(at 0% 0%, rgba(59,130,246,0.20) 0, transparent 50%), radial-gradient(at 100% 0%, rgba(139,92,246,0.18) 0, transparent 50%), radial-gradient(at 100% 100%, rgba(34,211,238,0.15) 0, transparent 50%)',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.12)',
        'glass-dark': '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
        glow: '0 0 24px rgba(59, 130, 246, 0.35)',
      },
      backdropBlur: { xs: '2px' },
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
