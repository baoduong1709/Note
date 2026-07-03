/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        darkbg: '#0f0f12',
        darkcard: 'rgba(23, 23, 28, 0.7)',
        accentPurple: '#8b5cf6',
        accentTeal: '#0d9488',
      }
    },
  },
  plugins: [],
}

