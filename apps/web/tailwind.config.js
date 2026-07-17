/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { brand: { 50: '#edf5ff', 100: '#dbeaff', 200: '#bdd9ff', 300: '#8bbcff', 500: '#2878e3', 600: '#1765cf', 700: '#124fa3', 900: '#102f5e' } },
      boxShadow: { panel: '0 1px 2px rgba(16,47,94,.04), 0 8px 24px rgba(30,64,175,.04)' },
    },
  },
  plugins: [],
};
