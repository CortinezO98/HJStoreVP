import { useQuery } from '@tanstack/react-query'
import { productsApi } from '../services/api'

/** Datos públicos reales de variantes; sin inventar colores ni precios. */
export function useProductVariantSummary(product, enabled = true) {
  const { data } = useQuery({
    queryKey: ['catalog-variant-summary', product.id],
    queryFn: () => productsApi.get(product.slug).then(response => response.data),
    enabled: enabled && Boolean(product.has_variants && product.slug),
    staleTime: 5 * 60 * 1000,
  })
  const variants = Array.isArray(data?.variants) ? data.variants : []
  const colors = [...new Set(variants.map(item => item.options?.color?.trim()).filter(Boolean))]
  const prices = [...new Set(variants.map(item => Number(item.sale_price)).filter(Number.isFinite))]
  return { colors, hasPriceRange: prices.length > 1 }
}
