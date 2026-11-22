import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeColor, productNameColor, colorsFromProductNames, hasProductNameColor,
} from '../src/utils/catalogColors.js'

const products = [
  { category_slug: 'gorras', name: 'Gorra HJ Classic Negra' },
  { category_slug: 'gorras', name: 'Gorra HJ Classic Blanca' },
  { category_slug: 'gorras', name: 'Gorra HJ Snapback Azul' },
  { category_slug: 'gorras', name: 'Gorra Dad Hat Beige' },
  { category_slug: 'perfumes', name: 'Perfume Gold 100 ml' },
]

test('detecta únicamente colores explícitos del nombre', () => {
  assert.equal(productNameColor(products[0]), 'negro')
  assert.equal(productNameColor(products[1]), 'blanco')
  assert.equal(productNameColor(products[2]), 'azul')
  assert.equal(productNameColor(products[4]), '')
})

test('separa los colores que corresponden a la categoría seleccionada', () => {
  assert.deepEqual(colorsFromProductNames(products, 'gorras'), ['negro', 'blanco', 'azul', 'beige'])
  assert.deepEqual(colorsFromProductNames(products, 'perfumes'), [])
})

test('las variantes de texto no alteran los filtros canónicos', () => {
  assert.equal(normalizeColor('Marrón'), 'marron')
  assert.equal(hasProductNameColor(products[0], 'negro'), true)
  assert.equal(hasProductNameColor(products[1], 'negro'), false)
})
