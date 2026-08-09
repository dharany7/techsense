/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#0B0F14',
        surface:    '#141A22',
        primary:    '#1E5FFF',
        success:    '#2ECC71',
        warning:    '#F5A623',
        danger:     '#E74C3C',
        foreground: '#F5F7FA',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #1E5FFF 0%, #0D3DB5 100%)',
      },
    },
  },
  plugins: [],
}
