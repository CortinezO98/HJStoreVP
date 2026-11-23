import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * localhost:8000 es válido únicamente en desarrollo.
 * Vite incrusta VITE_API_URL en JS durante build. Si el valor de desarrollo
 * se hereda desde .env o la terminal, en producción se usa el mismo origen.
 * El despliegue debe enrutar /api, /uploads y los endpoints públicos al backend.
 */
export function resolveProductionApiOrigin(value) {
  const origin = String(value || '').trim().replace(/\/$/, '')
  if (!origin) return ''
  try {
    const parsed = new URL(origin)
    if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(parsed.hostname.toLowerCase())) return ''
  } catch {
    return origin
  }
  return origin
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const candidate = process.env.VITE_API_URL ?? env.VITE_API_URL ?? ''
  return {
    plugins: [
      react(),
      {
        name: 'reject-local-api-origins-in-production-assets',
        apply: 'build',
        renderChunk(code, chunk) {
          // Antes de calcular los hashes: nunca distribuir un origen local.
          const localOrigin = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+/gi
          const cleaned = code.replace(localOrigin, '')
          if (cleaned !== code) {
            this.warn(`Se corrigió un origen local en ${chunk.fileName}. El servidor público debe enrutar /api y /uploads.`)
            return { code: cleaned, map: null }
          }
          return null
        },
      },
    ],
    // No modificar la URL del servidor local. Solo sanear el bundle de producción.
    ...(command === 'build' ? {
      define: {
        'import.meta.env.VITE_API_URL': JSON.stringify(resolveProductionApiOrigin(candidate)),
      },
    } : {}),
    server: {
      port: 5173,
      proxy: {
        '/api': { target: 'http://localhost:8000', changeOrigin: true },
        '/sitemap.xml': { target: 'http://localhost:8000', changeOrigin: true },
        '/robots.txt': { target: 'http://localhost:8000', changeOrigin: true },
        '/share': { target: 'http://localhost:8000', changeOrigin: true },
        '/uploads': { target: 'http://localhost:8000', changeOrigin: true },
      },
    },
  }
})
