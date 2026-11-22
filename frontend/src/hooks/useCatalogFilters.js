import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { normalizeCatalogPage } from '../utils/catalogPagination'

const SORT_VALUES = new Set(['featured', 'newest', 'price_asc', 'price_desc'])
const ALIASES = { sort: 'orden', in_stock: 'disponible' }

export function useCatalogFilters() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => ({
    categoria: params.get('categoria') || '',
    q: params.get('q') || '',
    orden: SORT_VALUES.has(params.get('orden') || params.get('sort'))
      ? (params.get('orden') || params.get('sort')) : 'featured',
    color: params.get('color') || '',
    talla: params.get('talla') || '',
    presentacion: params.get('presentacion') || '',
    min_price: params.get('min_price') || '',
    max_price: params.get('max_price') || '',
    disponible: params.get('disponible') === '1' || params.get('in_stock') === 'true',
    featured: params.get('featured') === 'true',
    page: normalizeCatalogPage(params.get('page') || '1'),
  }), [params])
  const setMany = updates => {
    const next = new URLSearchParams(params)
    for (const [key, raw] of Object.entries(updates)) {
      const normalized = ALIASES[key] || key
      const value = typeof raw === 'boolean' ? (raw ? '1' : '') : String(raw ?? '').trim()
      if (value && !(normalized === 'orden' && value === 'featured')) next.set(normalized, value)
      else next.delete(normalized)
      if (normalized === 'orden') next.delete('sort')
      if (normalized === 'disponible') next.delete('in_stock')
    }
    if (!Object.hasOwn(updates, 'page')) next.delete('page')
    setParams(next)
  }
  const clear = () => setParams(new URLSearchParams())
  const apiFilters = {
    category: filters.categoria || undefined,
    search: filters.q || undefined,
    sort: filters.orden,
    min_price: filters.min_price || undefined,
    max_price: filters.max_price || undefined,
    in_stock: filters.disponible || undefined,
    featured: filters.featured || undefined,
    color: filters.color || undefined,
    talla: filters.talla || undefined,
    presentacion: filters.presentacion || undefined,
    page: filters.page,
    per_page: 24,
  }
  const active = [
    filters.categoria, filters.q, filters.color, filters.talla,
    filters.presentacion, filters.min_price || filters.max_price,
    filters.disponible, filters.featured,
  ].filter(Boolean).length
  return { filters, apiFilters, active, setMany, clear }
}
