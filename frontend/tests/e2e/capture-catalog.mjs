/**
 * Capturas verificables del catálogo real. Ejecutar con la tienda en localhost:5173.
 * Requiere playwright instalado localmente (npm install --no-save playwright)
 * y navegador (npx playwright install chromium). No se incluye en el bundle.
 *
 * Las escenas "cargando" y "error" usan interceptación temporal del navegador
 * para comprobar los estados de la UI, sin afectar backend ni datos.
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const origin = process.env.CATALOG_CAPTURE_URL || 'http://localhost:5173'
const output = resolve('artifacts', 'catalog')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const checks = []
async function capture(page, name) {
  await page.screenshot({ path: resolve(output, name), fullPage: false, animations: 'disabled' })
  checks.push(name)
}
async function ensureCatalog(page, url) {
  await page.goto(new URL(url, origin).toString(), { waitUntil: 'domcontentloaded' })
  await page.locator('.hj-catalog-toolbar').waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
}
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const mobile = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
try {
  await ensureCatalog(desktop, '/catalogo?categoria=gorras')
  await desktop.evaluate(() => window.scrollTo(0, 650))
  await desktop.waitForTimeout(350)
  const sticky = await desktop.locator('.hj-catalog-sticky').evaluate(node => {
    const rect = node.getBoundingClientRect()
    return { top: rect.top, position: getComputedStyle(node).position }
  })
  assert.equal(sticky.position, 'sticky', 'la toolbar debe usar position: sticky')
  assert.ok(sticky.top < 180, 'la toolbar debería mantenerse bajo el header')
  await capture(desktop, '01-toolbar-sticky.png')

  await ensureCatalog(desktop, '/catalogo?categoria=gorras&color=negro&max_price=100000&orden=price_asc')
  const query = new URL(desktop.url()).searchParams
  assert.equal(query.get('categoria'), 'gorras')
  assert.equal(query.get('color'), 'negro')
  assert.equal(query.get('max_price'), '100000')
  assert.equal(query.get('min_price'), '40000', 'el rango debe normalizarse en la URL')
  await desktop.locator('.hj-catalog-price-options button[aria-pressed="true"]')
    .filter({ hasText: '$40.000 a $100.000' }).waitFor({ timeout: 15000 })
  await desktop.locator('.hj-catalog-grid .hj-catalog-product').first().waitFor({ timeout: 20000 })
  await desktop.locator('.hj-catalog-result-count').getByText(/productos/).waitFor()
  assert.ok(await desktop.locator('.hj-catalog-active-token').count() >= 3)
  const activeURL = desktop.url()
  await desktop.evaluate(url => {
    // Etiqueta de evidencia solo en esta captura de Playwright (no en aplicación).
    const label = document.createElement('aside')
    label.setAttribute('data-qa-url', '')
    label.textContent = url
    Object.assign(label.style, {
      position: 'fixed', top: '143px', right: '24px', zIndex: '9999',
      background: '#0A0A0A', color: '#FFFFFF', padding: '10px 14px',
      fontSize: '12px', fontFamily: 'monospace', maxWidth: '90vw',
      overflowWrap: 'anywhere', boxShadow: '0 2px 8px #0002',
    })
    document.body.appendChild(label)
  }, activeURL)
  await capture(desktop, '02-filtros-chips-url.png')
  await desktop.locator('[data-qa-url]').evaluate(node => node.remove())

  await ensureCatalog(desktop, '/catalogo?q=sinresultadoshjstorevp2026')
  await desktop.locator('.hj-catalog-empty').waitFor({ timeout: 15000 })
  await capture(desktop, '03-sin-resultados.png')

  await desktop.route(/\/products(?:\?|$)/, async route => {
    await new Promise(r => setTimeout(r, 5500))
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await ensureCatalog(desktop, '/catalogo?orden=newest')
  await capture(desktop, '04-cargando.png')
  await desktop.unrouteAll({ behavior: 'ignoreErrors' })

  await desktop.route(/\/products(?:\?|$)/, route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"detail":"Prueba de indisponibilidad"}',
  }))
  await ensureCatalog(desktop, '/catalogo?orden=price_desc')
  await desktop.getByText('No pudimos cargar la información').waitFor({ timeout: 15000 })
  await capture(desktop, '05-error-api.png')
  await desktop.unrouteAll({ behavior: 'ignoreErrors' })

  await ensureCatalog(mobile, '/catalogo?categoria=gorras')
  await mobile.locator('.hj-catalog-filter-toggle').click()
  await mobile.locator('.hj-filter-sheet[role="dialog"]').waitFor()
  await capture(mobile, '06-movil-375-filtros-abiertos.png')

  await ensureCatalog(desktop, '/catalogo?categoria=gorras')
  await desktop.getByRole('button', { name: 'Buscar productos' }).first().click()
  await desktop.locator('.hj-search-dialog[role="dialog"]').waitFor()
  await desktop.locator('.hj-search-dialog input').fill('gorra')
  await desktop.waitForTimeout(600)
  await capture(desktop, '07-buscador-abierto.png')
  await writeFile(resolve(output, 'resultado.json'), JSON.stringify({
    completed: checks, sticky, filtersUrl: activeURL, catalogUrl: desktop.url(),
    loadingAndError: 'Simulados únicamente con interceptación local de Playwright',
  }, null, 2))
  process.stdout.write(`Capturas guardadas en: ${output}\n${checks.join('\n')}\n`)
} finally {
  await browser.close()
}
