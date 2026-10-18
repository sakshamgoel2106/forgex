/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        industrial: {
          bg: '#070B10',       // Main background
          sidebar: '#070B10',  // Sidebar background
          surface: '#101722',  // Surface / Card background
          border: '#1E293B',   // Primary borders
          borderLight: '#334155', // Hover/elevated borders
          accent: '#A3E635',   // Primary accent (Lime)
          accentHover: '#BEF264',
          accentMuted: '#4D7C0F',
          text: '#F8FAFC',     // Primary text
          secondary: '#94A3B8',// Secondary text
          muted: '#64748B',    // Muted text / tertiary
        },
        graphite: {
          950: '#070B10', // Main chassis background
          900: '#101722', // Card / surface background
          850: '#101722', // Surface / Card
          800: '#1E293B', // Borders / Dividers
          750: '#263345', // Subtle elevated borders
          700: '#334155', // Active hover state
          600: '#475569', // Subtle borders / disabled
          500: '#64748B', // Muted labels
          400: '#94A3B8', // Secondary text
          300: '#CBD5E1', // Primary labels
          200: '#E2E8F0', // Primary text
          100: '#F8FAFC', // Bright white highlights
        },
        accent: {
          DEFAULT: '#A3E635',
          foreground: '#0B0F14',
          hover: '#BEF264',
        },
        semantic: {
          green: '#10B981',
          amber: '#F59E0B',
          red: '#EF4444',
          blue: '#3B82F6',
        },
        hazard: {
          500: '#F59E0B',
          400: '#FBBF24',
          600: '#D97706',
        },
        telemetry: {
          cyan: '#38BDF8',
          emerald: '#10B981',
          rose: '#EF4444',
          amber: '#F59E0B',
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
          '"Fira Code"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      borderRadius: {
        industrial: '6px',
      },
    },
  },
  plugins: [],
};
