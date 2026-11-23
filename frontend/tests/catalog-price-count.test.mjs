import test from 'node:test'
import assert from 'node:assert/strict'
import { PRICE_OPTIONS, canonicalPriceRange } from '../src/utils/catalogPriceRanges.js'
import { formatCatalogCount } from '../src/utils/catalogCount.js'

test('rango histórico Hasta 100.000 se canoniza a la opción seleccionable', () => {
  const range = canonicalPriceRange('', '100000')
  assert.equal(range.title, '$40.000 a $100.000')
  assert.equal(range.min, '40000')
  assert.equal(range.max, '100000')
  assert.ok(PRICE_OPTIONS.some(item => item.value === range.value))
})
test('rangos actuales mantienen la opción seleccionada', () => {
  assert.equal(canonicalPriceRange('', '40000').title, 'Hasta $40.000')
  assert.equal(canonicalPriceRange('100000', '200000').value, '100000:200000')
  assert.equal(canonicalPriceRange('200000', '').title, 'Más de $200.000')
  assert.equal(canonicalPriceRange('23500', '87000').value, ':')
})
test('plural correcto por categoría y sin filtro', () => {
  assert.equal(formatCatalogCount(1), '1 producto')
  assert.equal(formatCatalogCount(2), '2 productos')
  assert.equal(formatCatalogCount(1, 'gorras'), '1 gorra')
  assert.equal(formatCatalogCount(3, 'gorras'), '3 gorras')
  assert.equal(formatCatalogCount(1, 'relojes'), '1 reloj')
  assert.equal(formatCatalogCount(0, 'perfumes'), '0 perfumes')
})
