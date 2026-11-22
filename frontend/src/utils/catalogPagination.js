/**
 * Normaliza la paginación del catálogo. Las páginas se unen en orden de la URL,
 * nunca en un estado local que pueda sobrevivir a cambios de filtros o historial.
 */
export const CATALOG_PAGE_SIZE = 24
export const MAX_CATALOG_PAGE = 50

export function normalizeCatalogPage(value) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page >= 1
    ? Math.min(page, MAX_CATALOG_PAGE) : 1
}

export function mergeCatalogPages(pages) {
  const seen = new Set()
  const products = []
  for (const page of pages || []) {
    for (const product of Array.isArray(page) ? page : []) {
      if (product?.id == null || seen.has(product.id)) continue
      seen.add(product.id)
      products.push(product)
    }
  }
  const last = pages?.at(-1)
  return {
    products,
    hasNext: Array.isArray(last) && last.length === CATALOG_PAGE_SIZE,
  }
}
