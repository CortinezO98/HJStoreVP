import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('búsqueda solo en header; sin buscador duplicado del catálogo', () => {
  const page = source('src/pages/shop/CatalogPage.jsx')
  const header = source('src/components/layout/ShopLayout.jsx')
  assert.equal(page.includes('hj-catalog-sidebar-search'), false)
  assert.ok(header.includes('<SearchOverlay'))
  assert.ok(header.includes("event.key !== '/'"))
})

test('toolbar sticky y filtros accesibles en desktop y móvil', () => {
  const css = source('src/catalog-redesign.css')
  const controls = source('src/components/shop/CatalogControls.jsx')
  assert.match(css, /\.hj-catalog-sticky\s*\{[^}]*position:\s*sticky/)
  assert.ok(controls.includes('aria-label={`Filtrar por color'))
  assert.ok(controls.includes("filters.categoria === 'gorras' && (variants.talla || []).length > 0"))
  assert.ok(controls.includes('Guía de tallas'))
  assert.ok(controls.includes('hj-filter-sheet'))
})

test('tarjetas preservan compra y favoritos, muestran stock y variantes', () => {
  const card = source('src/components/shop/ProductCard.jsx')
  assert.ok(card.includes('AGREGAR AL CARRITO'))
  assert.ok(card.includes('ELEGIR COLOR Y TALLA'))
  assert.ok(card.includes('Quedan {stock} unidades'))
  assert.ok(card.includes('aria-pressed={favorite}'))
  assert.ok(card.includes('cardColors'))
  assert.ok(card.includes('!hideCategory'))
})

test('moneda comercial compartida en vistas públicas de compra', () => {
  for (const filename of [
    'src/components/shop/ProductCard.jsx',
    'src/components/shop/MiniCartDrawer.jsx',
    'src/components/shop/SearchOverlay.jsx',
    'src/pages/shop/ProductPage.jsx',
    'src/pages/shop/CartPage.jsx',
    'src/pages/shop/CheckoutPage.jsx',
    'src/pages/shop/AccountPage.jsx',
    'src/pages/shop/PaymentConfirmationPage.jsx',
    'src/components/shop/PostSaleCustomer.jsx',
  ]) {
    assert.ok(source(filename).includes("utils/currency"), filename)
  }
})

test('banner omite imagen si falta y reutiliza detalle público cuando existe', () => {
  const hero = source('src/components/shop/CategoryHero.jsx')
  const page = source('src/pages/shop/CatalogPage.jsx')
  assert.ok(hero.includes('{image && <div'))
  assert.ok(page.includes('categoryDetails?.image_url'))
})

test('la categoría proviene de URL aunque la API siga cargando', () => {
  const hero = source('src/components/shop/CategoryHero.jsx')
  const page = source('src/pages/shop/CatalogPage.jsx')
  assert.ok(hero.includes('categorySlug'))
  assert.ok(hero.includes('FALLBACK_NAMES'))
  assert.ok(page.includes('loading={categoriesLoading}'))
  assert.ok(page.includes('categorySlug={filters.categoria}'))
})

test('la UI distingue errores del listado, espera facetas y evita conteos falsos', () => {
  const page = source('src/pages/shop/CatalogPage.jsx')
  const controls = source('src/components/shop/CatalogControls.jsx')
  assert.ok(page.includes('isError={isError}'))
  assert.ok(page.includes('catalogError: isError'))
  assert.ok(controls.includes('!isError && <span className="hj-catalog-result-count"'))
  assert.ok(controls.includes("facetsLoading ? <div className=\"hj-catalog-color-loading\""))
  assert.ok(controls.includes('disabled={empty}'))
})

test('historial y captura de filtros están aislados de código público', () => {
  const overlay = source('src/components/shop/SearchOverlay.jsx')
  const playwright = source('tests/e2e/capture-catalog.mjs')
  const packageJSON = JSON.parse(source('package.json'))
  assert.ok(overlay.includes('BÚSQUEDAS RECIENTES'))
  assert.ok(overlay.includes('VER LOS {choices.length} RESULTADOS'))
  assert.ok(playwright.includes('color=negro'))
  assert.ok(playwright.includes('activeURL'))
  assert.equal(packageJSON.scripts['capture:catalog'], 'node tests/e2e/capture-catalog.mjs')
})
