/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: '#0b0e12', // deep chassis background
          900: '#11161d', // panel surface
          850: '#171e27', // elevated card / header
          800: '#1f2834', // container border & dividers
          700: '#2b3644', // active hover state
          600: '#3e4d60', // subtle borders / disabled
          500: '#64748b', // muted labels
          400: '#94a3b8', // secondary text
          300: '#cbd5e1', // primary labels
          200: '#e2e8f0', // primary text
          100: '#f8fafc', // bright highlights
        },
        hazard: {
          500: '#f59e0b', // safety amber / LOTO warning
          400: '#fbbf24',
          600: '#d97706',
        },
        telemetry: {
          cyan: '#06b6d4',
          emerald: '#10b981',
          rose: '#f43f5e',
          amber: '#f59e0b',
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
    },
  },
  plugins: [],
};
