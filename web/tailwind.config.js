/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0d12',
        panel: '#151922',
        panel2: '#1d2230',
        edge: '#2a3142',
        brand: '#7c5cff',
        brand2: '#9d86ff',
        good: '#34d399',
        warn: '#fbbf24',
        bad: '#f87171',
      },
    },
  },
  plugins: [],
};
