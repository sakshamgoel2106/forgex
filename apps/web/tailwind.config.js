/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ForgeX Production Design System Tokens
        'forge-bg': '#F5F6F7', // Warm off-white
        'forge-surface': '#FFFFFF',
        'forge-sidebar': '#151C24', // Deep Graphite
        'forge-border': '#E2E8F0',
        'forge-border-strong': '#CBD5E1',
        // Text
        'forge-text-primary': '#1A202C', // Charcoal
        'forge-text-secondary': '#64748B', // Slate
        'forge-text-tertiary': '#94A3B8',
        'forge-text-inverse': '#F8FAFC',
        // Semantic
        'forge-amber': '#D97706', // Active/Warning - Restrained
        'forge-amber-bg': '#FFFBEB',
        'forge-teal': '#0F766E', // Healthy/Confirmed
        'forge-teal-bg': '#F0FDFA',
        'forge-red': '#DC2626', // Critical only
        'forge-red-bg': '#FEF2F2',
        'forge-blue': '#2563EB', // Info/Link

        // Legacy / Dark Theme tokens
        industrial: {
          bg: '#F5F6F7',
          sidebar: '#F8FAFC',
          surface: '#FFFFFF',
          border: '#E2E8F0',
          borderLight: '#CBD5E1',
          accent: '#2563EB',
          accentHover: '#1D4ED8',
          accentMuted: '#93C5FD',
          text: '#1A202C',
          secondary: '#64748B',
          muted: '#94A3B8',
        },
        graphite: {
          950: '#070B10',
          900: '#101722',
          850: '#101722',
          800: '#1E293B',
          750: '#263345',
          700: '#334155',
          600: '#475569',
          500: '#64748B',
          400: '#94A3B8',
          300: '#CBD5E1',
          200: '#E2E8F0',
          100: '#F8FAFC',
        },
        accent: {
          DEFAULT: '#1D4ED8',
          foreground: '#FFFFFF',
          hover: '#1E40AF',
        },
        semantic: {
          green: '#10B981',
          amber: '#F59E0B',
          red: '#EF4444',
          blue: '#3B82F6',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"Geist Mono"',
          '"Fira Code"',
          'ui-monospace',
          'monospace',
        ],
      },
      borderRadius: {
        'forge-sm': '6px',
        'forge-md': '8px',
        'forge-lg': '10px',
        industrial: '6px',
      },
      boxShadow: {
        'forge-card': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
};
