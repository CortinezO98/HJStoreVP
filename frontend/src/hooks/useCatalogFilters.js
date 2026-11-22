import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { normalizeCatalogPage } from '../utils/catalogPagination'

import { normalizeCatalogSort, updateCatalogSearchParams } from '../utils/catalogFilters'

export function useCatalogFilters() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => ({
    categoria: params.get('categoria') || '',
    q: params.get('q') || '',
    orden: normalizeCatalogSort(params),
    color: params.get('color') || '',
    talla: params.get('talla') || '',
    presentacion: params.get('presentacion') || '',
    min_price: params.get('min_price') || '',
    max_price: params.get('max_price') || '',
    disponible: params.get('disponible') === '1' || params.get('in_stock') === 'true',
    featured: params.get('featured') === 'true',
    page: normalizeCatalogPage(params.get('page') || '1'),
  }), [params])
  const setMany = updates => setParams(updateCatalogSearchParams(params, updates))
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
