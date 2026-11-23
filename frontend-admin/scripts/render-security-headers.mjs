// Genera la política Nginx sin aceptar inyección de directivas.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function apiOrigin(value) {
  if (typeof value !== 'string' || !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?\/?$/.test(value)) {
    throw new Error('VITE_API_URL debe ser un origen HTTPS explícito')
  }
  const parsed = new URL(value)
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash ||
      ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname) ||
      !parsed.hostname.includes('.')) {
    throw new Error('Origen HTTPS de API inválido para producción')
  }
  return parsed.origin
}

export function renderHeaders(template, value) {
  if (!template.includes('__API_ORIGIN__')) throw new Error('Plantilla CSP incompleta')
  return template.replaceAll('__API_ORIGIN__', apiOrigin(value))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , value, input, output] = process.argv
  writeFileSync(output, renderHeaders(readFileSync(input, 'utf8'), value))
}
