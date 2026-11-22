import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  // Compatibilidad durante la migración: todas las llamadas toast.* del panel
  // utilizan SweetAlert2 sin cambiar la lógica de las pantallas existentes.
  resolve: {
    alias: {
      'react-hot-toast': fileURLToPath(new URL('./src/components/ui/sweetalert-toast.js', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
