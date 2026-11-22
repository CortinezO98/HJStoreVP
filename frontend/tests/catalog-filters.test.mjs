import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCatalogSort, updateCatalogSearchParams } from '../src/utils/catalogFilters.js'

test('mantiene los filtros existentes al cambiar orden y resetea la paginación', () => {
  const source = new URLSearchParams('categoria=gorras&color=negro&disponible=1&page=4')
  const result = updateCatalogSearchParams(source, { orden: 'price_asc' })
  assert.equal(result.get('categoria'), 'gorras')
  assert.equal(result.get('color'), 'negro')
  assert.equal(result.get('disponible'), '1')
  assert.equal(result.get('orden'), 'price_asc')
  assert.equal(result.has('page'), false)
  assert.equal(source.get('page'), '4', 'no muta los filtros originales')
})

test('admite enlaces históricos con sort e in_stock sin crear parámetros duplicados', () => {
  const legacy = new URLSearchParams('sort=newest&in_stock=true&categoria=perfumes')
  assert.equal(normalizeCatalogSort(legacy), 'newest')
  const result = updateCatalogSearchParams(legacy, { orden: 'price_desc', disponible: true })
  assert.equal(result.get('orden'), 'price_desc')
  assert.equal(result.get('disponible'), '1')
  assert.equal(result.has('sort'), false)
  assert.equal(result.has('in_stock'), false)
})

test('eliminar filtros no borra los demás ni conserva página obsoleta', () => {
  const source = new URLSearchParams('categoria=gorras&color=azul&talla=ajustable&page=3')
  const result = updateCatalogSearchParams(source, { color: '' })
  assert.equal(result.get('categoria'), 'gorras')
  assert.equal(result.get('talla'), 'ajustable')
  assert.equal(result.has('color'), false)
  assert.equal(result.has('page'), false)
})

test('cambiar a destacados limpia orden explícito y preserva búsqueda', () => {
  const source = new URLSearchParams('q=gorras&orden=price_asc')
  const result = updateCatalogSearchParams(source, { orden: 'featured' })
  assert.equal(result.get('q'), 'gorras')
  assert.equal(result.has('orden'), false)
  assert.equal(normalizeCatalogSort(result), 'featured')
})

test('paginación intencionada conserva filtros activos', () => {
  const source = new URLSearchParams('q=reloj&categoria=relojes&color=negro')
  const result = updateCatalogSearchParams(source, { page: 2 })
  assert.equal(result.get('page'), '2')
  assert.equal(result.get('categoria'), 'relojes')
  assert.equal(result.get('q'), 'reloj')
  assert.equal(result.get('color'), 'negro')
})

test('descarta orden desconocido y no crea un valor en la API', () => {
  const url = new URLSearchParams('orden=desconocido')
  assert.equal(normalizeCatalogSort(url), 'featured')
})
