/**
 * Manipulación inmutable de filtros compartibles del catálogo.
 * Permite Atrás/Adelante porque cada interacción cambia la query de React Router.
 */
const ALIASES = { sort: 'orden', in_stock: 'disponible' }
export const CATALOG_SORTS = Object.freeze(['featured', 'newest', 'price_asc', 'price_desc'])

export function updateCatalogSearchParams(current, updates) {
  const next = new URLSearchParams(current)
  for (const [key, raw] of Object.entries(updates)) {
    const normalized = ALIASES[key] || key
    const value = typeof raw === 'boolean' ? (raw ? '1' : '') : String(raw ?? '').trim()
    if (value && !(normalized === 'orden' && value === 'featured')) {
      next.set(normalized, value)
    } else {
      next.delete(normalized)
    }
    if (normalized === 'orden') next.delete('sort')
    if (normalized === 'disponible') next.delete('in_stock')
  }
  if (!Object.hasOwn(updates, 'page')) next.delete('page')
  return next
}

export function normalizeCatalogSort(params) {
  const requested = params.get('orden') || params.get('sort')
  return CATALOG_SORTS.includes(requested) ? requested : 'featured'
}
