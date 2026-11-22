#!/usr/bin/env node
/**
 * Verifica que el bundle de producción (dist/) no contenga rastros de desarrollo
 * ni de pruebas. Se ejecuta en Dockerfile.production y en CI; falla con código 1.
 * Uso: node scripts/verify-production-bundle.mjs dist
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const root = process.argv[2] || 'dist'
const problems = []

const FORBIDDEN_FILES = [
  [/\.map$/i, 'mapa de código fuente (expone el código original)'],
  [/\.(jsx|tsx|ts)$/i, 'archivo fuente sin compilar'],
  [/(^|\/)(tests?|__tests__|e2e|fixtures?|mocks?)(\/|$)/i, 'carpeta de pruebas'],
  [/\.(test|spec)\.[cm]?js$/i, 'archivo de prueba'],
  [/(^|\/)\.env(\.|$)/i, 'archivo de entorno'],
]
const FORBIDDEN_CONTENT = [
  [/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/i, 'URL de desarrollo (localhost)'],
  [/confirm-demo/, 'flujo de pago de demostración'],
  [/Admin123!|Vendedor123!|hjstore123|rootpass/, 'credencial de desarrollo'],
  [/\bdebugger\b/, 'sentencia debugger'],
  [/sourceMappingURL=/, 'referencia a source map'],
]

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const rel = relative(root, path).replaceAll('\\', '/')
    if (statSync(path).isDirectory()) { walk(path); continue }
    for (const [pattern, reason] of FORBIDDEN_FILES) if (pattern.test(rel)) problems.push(`${rel}: ${reason}`)
    if (['.js', '.mjs', '.css', '.html', '.json', '.txt', '.xml'].includes(extname(name).toLowerCase())) {
      const text = readFileSync(path, 'utf8')
      for (const [pattern, reason] of FORBIDDEN_CONTENT) if (pattern.test(text)) problems.push(`${rel}: contiene ${reason}`)
    }
  }
}

try {
  walk(root)
} catch (error) {
  console.error(`No se pudo leer ${root}: ${error.message}. Ejecuta primero npm run build.`)
  process.exit(1)
}
if (problems.length) {
  console.error(`✗ El bundle de producción tiene ${problems.length} problema(s):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`✓ Bundle de producción limpio (${root}).`)
