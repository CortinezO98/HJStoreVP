import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, Search } from 'lucide-react'
import { useState } from 'react'
import { productsApi } from '../../services/api'
import ProductCard from '../../components/shop/ProductCard'

const CATEGORIES = [
  { name: 'Todos', slug: '' },
  { name: 'Gorras',   slug: 'gorras' },
  { name: 'Perfumes', slug: 'perfumes' },
  { name: 'Relojes',  slug: 'relojes' },
  { name: 'Bolsos',   slug: 'bolsos' },
  { name: 'Canguros', slug: 'canguros' },
]

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const categoria = searchParams.get('categoria') || ''
  const page = parseInt(searchParams.get('page') || '1')

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', 'catalog', categoria, search, page],
    queryFn: () => productsApi.list({
      search: search || undefined,
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Catálogo</h1>
        <p className="text-gray-500">Explora todos nuestros productos</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">

        {/* ── SIDEBAR FILTROS ─────────────────────────────────── */}
        <aside className="lg:w-56 flex-shrink-0">
          <div className="card sticky top-20">
            <div className="flex items-center gap-2 mb-4">
              <SlidersHorizontal size={16} className="text-brand-600" />
              <span className="font-semibold text-sm">Filtros</span>
            </div>

            {/* Búsqueda */}
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setFilter('q', search)}
                className="input pl-9 text-sm"
              />
            </div>

            {/* Categorías */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoría</p>
              <div className="flex flex-col gap-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.slug}
                    onClick={() => setFilter('categoria', cat.slug)}
                    className={`text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                      categoria === cat.slug
                        ? 'bg-brand-100 text-brand-700 font-semibold'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
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
              <p className="text-gray-400 text-lg">No se encontraron productos</p>
              <button onClick={() => { setSearch(''); setSearchParams({}) }} className="mt-4 text-brand-600 underline text-sm">
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products?.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
