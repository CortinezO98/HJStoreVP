import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, Search, X, ArrowUpDown } from 'lucide-react'
import { useState, useEffect } from 'react'
import { productsApi } from '../../services/api'
import ProductCard from '../../components/shop/ProductCard'

const CATEGORIES = [
  { name: 'Todos',    slug: '' },
  { name: 'Gorras',   slug: 'gorras',   emoji: '🧢' },
  { name: 'Perfumes', slug: 'perfumes', emoji: '🌸' },
  { name: 'Relojes',  slug: 'relojes',  emoji: '⌚' },
  { name: 'Bolsos',   slug: 'bolsos',   emoji: '👜' },
  { name: 'Canguros', slug: 'canguros', emoji: '🎽' },
]

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

  const categoria  = searchParams.get('categoria') || ''
  const sort       = searchParams.get('sort') || ''
  const minPrice   = searchParams.get('min_price') || ''
  const maxPrice   = searchParams.get('max_price') || ''
  const featured   = searchParams.get('featured') || ''
  const page       = parseInt(searchParams.get('page') || '1')

  // Sync search input con URL
  useEffect(() => {
    setSearch(searchParams.get('q') || '')
  }, [searchParams])

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', 'catalog', categoria, search, sort, minPrice, maxPrice, featured, page],
    queryFn: () => productsApi.list({
      search:    search || undefined,
      category:  categoria || undefined,
      sort:      sort || undefined,
      min_price: minPrice || undefined,
      max_price: maxPrice || undefined,
      featured:  featured === 'true' ? true : undefined,
      page,
      per_page: 24,
    }).then((r) => r.data),
  })

  const setFilter = (key, value) => {
    const params = Object.fromEntries(searchParams)
    if (value) params[key] = value
    else delete params[key]
    params.page = '1'
    setSearchParams(params)
  }

  const clearAllFilters = () => {
    setSearch('')
    setSearchParams({})
  }

  const activeFiltersCount = [categoria, search, sort, minPrice, maxPrice, featured].filter(Boolean).length

  // Etiqueta del título según filtros
  const pageTitle = categoria
    ? CATEGORIES.find(c => c.slug === categoria)?.name || 'Catálogo'
    : featured === 'true' ? '⭐ Productos destacados' : 'Catálogo'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{pageTitle}</h1>
          {!isLoading && (
            <p className="text-gray-500 text-sm mt-1">
              {products?.length || 0} productos encontrados
              {search && <> para "<span className="font-medium text-gray-700">{search}</span>"</>}
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
              {CATEGORIES.find(c => c.slug === categoria)?.name}
              <button onClick={() => setFilter('categoria', '')}><X size={12} /></button>
            </span>
          )}
          {search && (
            <span className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs font-medium px-3 py-1 rounded-full">
              "{search}"
              <button onClick={() => { setSearch(''); setFilter('q', '') }}><X size={12} /></button>
            </span>
          )}
          {(minPrice || maxPrice) && (
            <span className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs font-medium px-3 py-1 rounded-full">
              Precio filtrado
              <button onClick={() => { setFilter('min_price', ''); setFilter('max_price', '') }}><X size={12} /></button>
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

      <div className="flex flex-col lg:flex-row gap-8">

        {/* ── SIDEBAR FILTROS ─────────────────────────────────── */}
        <aside className={`lg:w-56 flex-shrink-0 ${filtersOpen ? 'block' : 'hidden lg:block'}`}>
          <div className="card sticky top-20 space-y-5">
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
                {CATEGORIES.map((cat) => (
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
                      onClick={() => {
                        setFilter('min_price', range.min)
                        setFilter('max_price', range.max)
                      }}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-gray-100 rounded-2xl aspect-square animate-pulse" />
              ))}
            </div>
          ) : products?.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">🔍</div>
              <p className="text-gray-500 text-lg font-medium mb-2">No encontramos productos</p>
              <p className="text-gray-400 text-sm mb-6">
                {search
                  ? `No hay resultados para "${search}"`
                  : 'Prueba con otros filtros'
                }
              </p>
              <button
                onClick={clearAllFilters}
                className="btn-primary text-sm"
              >
                Limpiar filtros y ver todo
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Paginación simple */}
              {products.length === 24 && (
                <div className="mt-8 text-center">
                  <button
                    onClick={() => setFilter('page', String(page + 1))}
                    className="btn-secondary px-8"
                  >
                    Cargar más productos
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
