import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CATALOG_PAGE_SIZE, MAX_CATALOG_PAGE, normalizeCatalogPage, mergeCatalogPages,
} from '../src/utils/catalogPagination.js'

const page = (start, length = CATALOG_PAGE_SIZE) =>
  Array.from({ length }, (_, index) => ({ id: start + index, name: `Producto ${start + index}` }))

test('normaliza páginas inválidas sin consultas infinitas ni valores negativos', () => {
  for (const value of [undefined, '', '0', '-3', 'NaN', 'Infinity', '2.5', 'not-a-page']) {
    assert.equal(normalizeCatalogPage(value), 1)
  }
  assert.equal(normalizeCatalogPage('1'), 1)
  assert.equal(normalizeCatalogPage('3'), 3)
  assert.equal(normalizeCatalogPage('999999'), MAX_CATALOG_PAGE)
  assert.equal(normalizeCatalogPage('1e9'), MAX_CATALOG_PAGE)
})

test('primera página completa habilita cargar más', () => {
  const result = mergeCatalogPages([page(1)])
  assert.equal(result.products.length, CATALOG_PAGE_SIZE)
  assert.equal(result.hasNext, true)
})

test('página parcial termina la paginación', () => {
  const result = mergeCatalogPages([page(1), page(25, 3)])
  assert.deepEqual(result.products.map(p => p.id), [...page(1), ...page(25, 3)].map(p => p.id))
  assert.equal(result.hasNext, false)
})

test('la unión elimina duplicados conservando el orden del backend', () => {
  const result = mergeCatalogPages([page(1), page(24, 24)])
  assert.equal(result.products.length, 47)
  assert.equal(result.products[0].id, 1)
  assert.equal(result.products.at(-1).id, 47)
  assert.equal(result.hasNext, true)
})

test('una consulta sin productos produce lista vacía y sin página siguiente', () => {
  assert.deepEqual(mergeCatalogPages([[]]), { products: [], hasNext: false })
  assert.deepEqual(mergeCatalogPages([]), { products: [], hasNext: false })
})

test('el historial y el cambio de filtros no comparten resultados', () => {
  const gorras = mergeCatalogPages([page(1), page(25, 3)])
  const perfumes = mergeCatalogPages([[{ id: 91, name: 'Perfume' }]])
  const volver = mergeCatalogPages([page(1), page(25, 3)])
  assert.equal(gorras.products.length, 27)
  assert.deepEqual(perfumes.products.map(p => p.id), [91])
  assert.deepEqual(volver.products.map(p => p.id), gorras.products.map(p => p.id))
})
