/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#1a1a2e',
        'bg-card': '#16213e',
        'text-primary': '#e6e6e6',
        'text-strong': '#ffffff',
        'buy': '#26a69a',
        'sell': '#ef5350',
        'btn-primary': '#4fc3f7',
        'btn-secondary': '#78909c',
        'border': '#2d4263',
      },
    },
  },
  plugins: [],
}
