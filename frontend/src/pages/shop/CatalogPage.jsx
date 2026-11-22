import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, Search, X, ArrowRight } from 'lucide-react'
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
  const variantFilters = {
    color: searchParams.get('color') || '',
    talla: searchParams.get('talla') || '',
    presentacion: searchParams.get('presentacion') || '',
  }
  const { data: filterOptions = { color: [], talla: [], presentacion: [] } } = useQuery({
    queryKey: ['catalog-variant-filters', categoria, currentSearch],
    queryFn: () => productsApi.filters({
      category: categoria || undefined,
      search: currentSearch || undefined,
    }).then((r) => r.data),
  })
  const requestedPage = Number(searchParams.get('page') || '1')
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1

  // Sync search input con URL
  useEffect(() => {
    setSearch(searchParams.get('q') || '')
  }, [searchParams])

  const { data: products, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', 'catalog', categoria, currentSearch, sort, minPrice, maxPrice, featured, inStock, variantFilters.color, variantFilters.talla, variantFilters.presentacion, page],
    queryFn: () => productsApi.list({
      search:    currentSearch || undefined,
      category:  categoria || undefined,
      sort:      sort || undefined,
      min_price: minPrice || undefined,
      max_price: maxPrice || undefined,
      featured:  featured === 'true' ? true : undefined,
      in_stock: inStock || undefined,
      color: variantFilters.color || undefined,
      talla: variantFilters.talla || undefined,
      presentacion: variantFilters.presentacion || undefined,
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
    setFiltersOpen(false)
  }

  const applyMobileFilters = () => {
    if (search.trim() !== currentSearch) setFilter('q', search.trim())
    setFiltersOpen(false)
  }

  const activeFiltersCount = [categoria, currentSearch, sort, minPrice, maxPrice, featured, inStock,
    variantFilters.color, variantFilters.talla, variantFilters.presentacion].filter(Boolean).length

  // Etiqueta del título según filtros
  const pageTitle = categoria
    ? categories.find(c => c.slug === categoria)?.name || 'Catálogo'
    : featured === 'true' ? '⭐ Productos destacados' : 'Catálogo'

  return (
    <div className="editorial-catalog store-container store-section store-catalog-premium">

      {/* Header */}
      <div className="store-catalog-intro">
        <div className="store-catalog-intro-copy">
          <span className="store-catalog-eyebrow">HJ STOREVP / SELECCIÓN</span>
          <h1 className="editorial-catalog-title">{pageTitle.toUpperCase()}</h1>
          {!isLoading && (
            <p className="store-catalog-subtitle">
              Explora nuestra selección de productos. {products?.length || 0} referencias en esta página
              {currentSearch && <> para "<span className="font-medium text-gray-700">{currentSearch}</span>"</>}
            </p>
          )}
        </div>

        {/* Sort + filtros mobile */}
        <div className="store-catalog-intro-actions">
          <label className="store-catalog-sort-label" htmlFor="catalog-sort-desktop">Ordenar por</label>
          <select
            id="catalog-sort-desktop"
            className="store-catalog-sort-select hidden sm:block"
            value={sort}
            onChange={e => setFilter('sort', e.target.value)}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            type="button"
            aria-controls="catalog-filters"
            aria-expanded={filtersOpen}
            className={`lg:hidden store-catalog-mobile-filter-trigger flex items-center gap-2 px-3 py-2 min-h-11 border text-sm font-medium transition-colors ${
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
          {[
            ['color', 'Color'], ['talla', 'Talla'], ['presentacion', 'Presentación'],
          ].filter(([key]) => variantFilters[key]).map(([key, label]) => (
            <span key={key} className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs font-medium px-3 py-1 rounded-full">
              {label}: {variantFilters[key]}
              <button type="button" aria-label={`Quitar filtro de ${label}`} onClick={() => setFilter(key, '')}><X size={12} /></button>
            </span>
          ))}
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

      <div className="store-catalog-layout flex flex-col lg:flex-row gap-10">

        {/* ── SIDEBAR FILTROS ─────────────────────────────────── */}
        <aside id="catalog-filters" aria-label="Filtros de catálogo" className={`store-catalog-sidebar lg:w-56 flex-shrink-0 ${filtersOpen ? 'block' : 'hidden lg:block'}`}>
          <div className="editorial-catalog-filters store-catalog-filter-panel sticky top-24 space-y-5">
            <div className="lg:hidden flex items-center justify-between">
              <span className="font-bold text-sm uppercase">Refinar búsqueda</span>
              <button type="button" className="store-filter-close" aria-label="Cerrar filtros"
                onClick={() => setFiltersOpen(false)}><X size={19}/></button>
            </div>
            <div className="store-catalog-filter-heading flex items-center justify-between">
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
              <form role="search" onSubmit={(event) => {
                event.preventDefault()
                setFilter('q', search.trim())
                setFiltersOpen(false)
              }} className="store-catalog-search-form">
                <Search size={16} aria-hidden="true" className="text-neutral-500 shrink-0" />
                <input
                  type="search"
                  aria-label="Buscar productos del catálogo"
                  placeholder="Producto, marca o referencia"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                <button type="submit" aria-label="Aplicar búsqueda" className="store-catalog-search-submit">
                  <ArrowRight size={17}/>
                </button>
              </form>
            </div>

            {/* Categorías */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoría</p>
              <div className="store-catalog-filter-options flex flex-col gap-0.5">
                {categories.map((cat) => (
                  <button
                    type="button"
                    aria-pressed={categoria === cat.slug}
                    key={cat.slug}
                    onClick={() => setFilter('categoria', cat.slug)}
                    className={`store-catalog-filter-option text-left text-sm px-3 py-2 transition-colors flex items-center gap-2 ${
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

            {/* Opciones reales de variantes activas en la categoría */}
            {[
              ['color', 'Color'], ['talla', 'Talla'], ['presentacion', 'Presentación'],
            ].map(([key, label]) => {
              const choices = filterOptions[key] || []
              const selected = variantFilters[key]
              if (!choices.length && !selected) return null
              return <div key={key}>
                <label htmlFor={`catalog-filter-${key}`} className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{label}</label>
                <select id={`catalog-filter-${key}`} className="input text-sm w-full"
                  value={selected} onChange={(event) => setFilter(key, event.target.value)}>
                  <option value="">Todos</option>
                  {selected && !choices.includes(selected) && <option value={selected}>{selected} (sin coincidencias)</option>}
                  {choices.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            })}

            {/* Rango de precio */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Precio</p>
              <div className="store-catalog-filter-options flex flex-col gap-0.5">
                {PRICE_RANGES.map((range) => {
                  const isActive = minPrice === range.min && maxPrice === range.max
                  return (
                    <button
                      key={range.label}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setPriceFilter(range.min, range.max)}
                      className={`store-catalog-filter-option text-left text-sm px-3 py-2 transition-colors ${
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
            <button type="button" className="store-button store-button-dark w-full lg:hidden"
              onClick={applyMobileFilters}>VER RESULTADOS <ArrowRight size={16}/></button>
          </div>
        </aside>

        {/* ── GRID PRODUCTOS ──────────────────────────────────── */}
        <div className="store-catalog-content flex-1 min-w-0">
          <div className="store-catalog-results-header" aria-live="polite">
            <span>{isLoading ? 'Actualizando productos...' : `${products?.length || 0} referencias en esta página`}</span>
            <span>{activeFiltersCount > 0 ? `${activeFiltersCount} filtros activos` : 'Explora la colección'}</span>
          </div>
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
              <div className="store-catalog-product-grid grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10 sm:gap-x-8 sm:gap-y-12">
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
