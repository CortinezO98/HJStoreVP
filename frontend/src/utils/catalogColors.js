/**
 * Reconocimiento conservador de colores explícitos en nombres comerciales.
 * Fallback para productos individuales, no reemplaza atributos normalizados.
 */
const COLORS = [
  ['negro', /\b(?:negro|negra)\b/],
  ['blanco', /\b(?:blanco|blanca)\b/],
  ['azul', /\bazul\b/],
  ['beige', /\bbeige\b/],
  ['rojo', /\b(?:rojo|roja)\b/],
  ['dorado', /\b(?:dorado|dorada)\b/],
  ['gris', /\bgris\b/],
  ['verde', /\bverde\b/],
  ['rosado', /\b(?:rosado|rosada)\b/],
  ['cafe', /\b(?:cafe|marron)\b/],
]
export function normalizeColor(value = '') {
  return String(value).toLocaleLowerCase('es').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim()
}
export function productNameColor(product) {
  const name = normalizeColor(product?.name)
  return COLORS.find(([, pattern]) => pattern.test(name))?.[0] || ''
}
export function colorsFromProductNames(products = [], category = '') {
  return [...new Set(products
    .filter(product => !category || product.category_slug === category)
    .map(productNameColor).filter(Boolean))]
}
export function hasProductNameColor(product, color) {
  return productNameColor(product) === normalizeColor(color)
}
