import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, Search, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { productsApi, categoriesApi } from '../../services/api'
import ProductCard from '../../components/shop/ProductCard'
import { ErrorState, LoadingGrid } from '../../components/shop/StoreUI'


const SORT_OPTIONS = [
  { value: '',          label: 'Relevancia' },
  { value: 'price_asc', label: 'Menor precio' },
  { value: 'price_desc',label: 'Mayor precio' },
  { value: 'newest',    label: 'Más recientes' },
  { value: 'featured',  label: 'Destacados' },
]

const PRICE_RANGES = [
  { label: 'Todos los precios', min: '',      max: '' },
  { label: 'Hasta $50.000',     min: '',      max: '50000' },
  { label: '$50.000 - $100.000',min: '50000', max: '100000' },
  { label: '$100.000 - $200.000',min:'100000',max: '200000' },
  { label: 'Más de $200.000',   min: '200000',max: '' },
]

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch]             = useState(searchParams.get('q') || '')
  const [filtersOpen, setFiltersOpen]   = useState(false)
  const { data: categoryRows = [] } = useQuery({
    queryKey: ['storefront-categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data),
  })
  const categories = [
    { name: 'Todos', slug: '' },
    ...categoryRows.filter((c) => c.active !== false).map((c) => ({ name: c.name, slug: c.slug })),
  ]

  const categoria  = searchParams.get('categoria') || ''
  const sort       = searchParams.get('sort') || ''
  const minPrice   = searchParams.get('min_price') || ''
  const maxPrice   = searchParams.get('max_price') || ''
  const featured   = searchParams.get('featured') || ''
  const currentSearch = searchParams.get('q') || ''
  const inStock = searchParams.get('in_stock') === 'true'
  const requestedPage = Number(searchParams.get('page') || '1')
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1

  // Sync search input con URL
  useEffect(() => {
    setSearch(searchParams.get('q') || '')
  }, [searchParams])

  const { data: products, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', 'catalog', categoria, currentSearch, sort, minPrice, maxPrice, featured, inStock, page],
    queryFn: () => productsApi.list({
      search:    currentSearch || undefined,
      category:  categoria || undefined,
      sort:      sort || undefined,
      min_price: minPrice || undefined,
      max_price: maxPrice || undefined,
      featured:  featured === 'true' ? true : undefined,
      in_stock: inStock || undefined,
      page,
      per_page: 24,
    }).then((r) => r.data),
  })

  const setFilter = (key, value) => {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(key, value)
    else params.delete(key)
    if (key !== 'page') params.set('page', '1')
    setSearchParams(params)
  }

  const setPriceFilter = (min, max) => {
    const params = new URLSearchParams(searchParams)
    if (min) params.set('min_price', min)
    else params.delete('min_price')
    if (max) params.set('max_price', max)
    else params.delete('max_price')
    params.set('page', '1')
    setSearchParams(params)
  }

  const clearAllFilters = () => {
    setSearch('')
    setSearchParams({})
  }

  const activeFiltersCount = [categoria, currentSearch, sort, minPrice, maxPrice, featured, inStock].filter(Boolean).length

  // Etiqueta del título según filtros
  const pageTitle = categoria
    ? categories.find(c => c.slug === categoria)?.name || 'Catálogo'
    : featured === 'true' ? '⭐ Productos destacados' : 'Catálogo'

  return (
    <div className="editorial-catalog store-container store-section">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="editorial-catalog-title">{pageTitle.toUpperCase()}</h1>
          {!isLoading && (
            <p className="text-gray-500 text-sm mt-1">
              {products?.length || 0} productos encontrados
              {currentSearch && <> para "<span className="font-medium text-gray-700">{currentSearch}</span>"</>}
            </p>
          )}
        </div>

        {/* Sort + filtros mobile */}
        <div className="flex items-center gap-2">
          <select
            className="input text-sm py-2 hidden sm:block"
            value={sort}
            onChange={e => setFilter('sort', e.target.value)}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
              filtersOpen || activeFiltersCount > 0
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-700 border-gray-200'
            }`}
          >
            <SlidersHorizontal size={15} />
            Filtros
            {activeFiltersCount > 0 && (
              <span className="bg-white/20 text-xs px-1.5 rounded-full">{activeFiltersCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Chips de filtros activos */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {categoria && (
            <span className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs font-medium px-3 py-1 rounded-full">
              {categories.find(c => c.slug === categoria)?.name}
              <button type="button" aria-label="Quitar filtro de categoría" onClick={() => setFilter('categoria', '')}><X size={12} /></button>
            </span>
          )}
          {currentSearch && (
            <span className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs font-medium px-3 py-1 rounded-full">
              "{currentSearch}"
              <button type="button" aria-label="Quitar filtro de búsqueda" onClick={() => { setSearch(''); setFilter('q', '') }}><X size={12} /></button>
            </span>
          )}
          {(minPrice || maxPrice) && (
            <span className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs font-medium px-3 py-1 rounded-full">
              Precio filtrado
              <button type="button" aria-label="Quitar filtro de precio" onClick={() => setPriceFilter('', '')}><X size={12} /></button>
            </span>
          )}
          <button
            onClick={clearAllFilters}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Limpiar todo
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-10">

        {/* ── SIDEBAR FILTROS ─────────────────────────────────── */}
        <aside className={`lg:w-56 flex-shrink-0 ${filtersOpen ? 'block' : 'hidden lg:block'}`}>
          <div className="editorial-catalog-filters sticky top-24 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-brand-600" />
                <span className="font-semibold text-sm">Filtros</span>
              </div>
              {activeFiltersCount > 0 && (
                <button onClick={clearAllFilters} className="text-xs text-brand-600 hover:underline">
                  Limpiar
                </button>
              )}
            </div>

            {/* Búsqueda */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Buscar</p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar productos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setFilter('q', search)}
                  className="input pl-9 text-sm"
                />
              </div>
              {search && (
                <button
                  onClick={() => setFilter('q', search)}
                  className="mt-1 w-full text-xs text-center text-brand-600 hover:underline"
                >
                  Buscar "{search}" →
                </button>
              )}
            </div>

            {/* Categorías */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoría</p>
              <div className="flex flex-col gap-0.5">
                {categories.map((cat) => (
                  <button
                    key={cat.slug}
                    onClick={() => setFilter('categoria', cat.slug)}
                    className={`text-left text-sm px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                      categoria === cat.slug
                        ? 'bg-brand-100 text-brand-700 font-semibold'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {cat.emoji && <span>{cat.emoji}</span>}
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Rango de precio */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Precio</p>
              <div className="flex flex-col gap-0.5">
                {PRICE_RANGES.map((range) => {
                  const isActive = minPrice === range.min && maxPrice === range.max
                  return (
                    <button
                      key={range.label}
                      onClick={() => setPriceFilter(range.min, range.max)}
                      className={`text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-brand-100 text-brand-700 font-semibold'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {range.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Ordenar (mobile) */}
            <div className="sm:hidden">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ordenar por</p>
              <select
                className="input text-sm w-full"
                value={sort}
                onChange={e => setFilter('sort', e.target.value)}
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Solo disponibles */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={searchParams.get('in_stock') === 'true'}
                  onChange={e => setFilter('in_stock', e.target.checked ? 'true' : '')}
                  className="rounded accent-brand-600"
                />
                <span className="text-sm text-gray-700">Solo disponibles</span>
              </label>
            </div>
          </div>
        </aside>

        {/* ── GRID PRODUCTOS ──────────────────────────────────── */}
        <div className="flex-1">
          {isLoading ? (
            <LoadingGrid count={8} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : products?.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">🔍</div>
              <p className="text-gray-500 text-lg font-medium mb-2">No encontramos productos</p>
              <p className="text-gray-400 text-sm mb-6">
                {currentSearch
                  ? `No hay resultados para "${currentSearch}"`
                  : 'Prueba con otros filtros'
                }
              </p>
              <button
                type="button"
                onClick={page > 1 ? () => setFilter('page', String(page - 1)) : clearAllFilters}
                className="store-button store-button-dark"
              >
                {page > 1 ? 'VOLVER A LA PÁGINA ANTERIOR' : 'LIMPIAR FILTROS'}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10 sm:gap-x-8 sm:gap-y-12">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {(page > 1 || products.length === 24) && (
                <nav aria-label="Paginación del catálogo" className="mt-12 flex flex-wrap items-center justify-center gap-4">
                  <button type="button" className="store-button store-button-outline"
                    disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))}>
                    ANTERIOR
                  </button>
                  <span className="text-xs font-bold text-neutral-500 uppercase" aria-current="page">PÁGINA {page}</span>
                  <button type="button" className="store-button store-button-dark"
                    disabled={products.length < 24} onClick={() => setFilter('page', String(page + 1))}>
                    SIGUIENTE
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
