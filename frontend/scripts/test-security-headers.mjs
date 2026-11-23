import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiOrigin, renderHeaders } from './render-security-headers.mjs'
const template = readFileSync(new URL('../security-headers.conf', import.meta.url), 'utf8')
const nginx = readFileSync(new URL('../nginx.production.conf', import.meta.url), 'utf8')
for (const invalid of ['', 'http://api.example.com', 'https://localhost', 'https://127.0.0.1:8000',
  'https://user:pass@api.example.com', 'https://api.example.com/path', 'https://api.example.com?x=1',
  'https://api.example.com; script-src *', 'https://api.example.com\n', 'https://api.example.com:99999']) {
  assert.throws(() => apiOrigin(invalid), invalid)
}
const rendered = renderHeaders(template, 'https://api.example.com:8443/')
assert.ok(rendered.includes("connect-src 'self' https://api.example.com:8443"))
assert.ok(rendered.includes("img-src 'self' data: blob: https://api.example.com:8443"))
assert.ok(rendered.includes("script-src 'self';"))
assert.ok(rendered.includes("frame-ancestors 'none'"))
assert.ok(rendered.includes('includeSubDomains'))
assert.ok(!rendered.includes('__API_ORIGIN__'))
assert.equal((nginx.match(/include \/etc\/nginx\/security-headers.conf;/g) || []).length, 3)
assert.ok(!nginx.includes('unsafe-eval'))
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  assert.match(match[1], /\bsrc\s*=/i)
  assert.equal(match[2].trim(), '')
}
console.log('A-04: política CSP, origen, herencia Nginx y scripts HTML verificados')
