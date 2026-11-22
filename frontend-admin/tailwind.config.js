export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Identidad HJStoreVP: negro, blanco y rojo de marca.
        brand: {
          50: '#F6F6F5', 100: '#EDEDEA', 200: '#DADAD6', 300: '#B5B5B0',
          400: '#8A8A85', 500: '#5C5C58', 600: '#0A0A0A', 700: '#2A2A2A',
          800: '#171717', 900: '#0A0A0A', 950: '#000000',
        },
        accent: { DEFAULT: '#E1141E', soft: '#FDECEC' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Anton', 'Impact', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
