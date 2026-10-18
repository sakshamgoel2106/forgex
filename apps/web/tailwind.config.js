/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        industrial: {
          bg: '#0B0F14',       // Main background
          sidebar: '#101720',  // Sidebar background
          surface: '#151E28',  // Surface / Card background
          border: '#283543',   // Primary borders
          borderLight: '#37475A', // Hover/elevated borders
          accent: '#A3E635',   // Primary accent (Lime)
          accentHover: '#BEF264',
          accentMuted: '#4D7C0F',
          text: '#F1F5F9',     // Primary text
          secondary: '#94A3B8',// Secondary text
          muted: '#64748B',    // Muted text / tertiary
        },
        graphite: {
          950: '#0B0F14', // Main chassis background
          900: '#101720', // Sidebar background
          850: '#151E28', // Surface / Card
          800: '#283543', // Borders / Dividers
          750: '#2F3E50', // Subtle elevated borders
          700: '#37475A', // Active hover state
          600: '#475569', // Subtle borders / disabled
          500: '#64748B', // Muted labels
          400: '#94A3B8', // Secondary text
          300: '#CBD5E1', // Primary labels
          200: '#E2E8F0', // Primary text
          100: '#F1F5F9', // Bright white highlights
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
