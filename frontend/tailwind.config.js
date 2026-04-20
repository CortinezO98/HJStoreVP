/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dde6ff',
          200: '#c3d0ff',
          300: '#9db2ff',
          400: '#7088ff',
          500: '#4f5ff7',
          600: '#3a3fec',
          700: '#2f30d1',
          800: '#2a2da9',
          900: '#282c84',
          950: '#1a1b52',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
