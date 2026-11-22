import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CreditCard, PackageCheck, RefreshCw } from 'lucide-react'
import { productsApi, categoriesApi } from '../../services/api'
import { useCatalogFilters } from '../../hooks/useCatalogFilters'
import ProductCard from '../../components/shop/ProductCard'
import CategoryHero from '../../components/shop/CategoryHero'
import { CategoryChips, CatalogToolbar, FilterFields, FilterSheet } from '../../components/shop/CatalogControls'
import { ErrorState } from '../../components/shop/StoreUI'
import { mergeCatalogPages } from '../../utils/catalogPagination'

function readDensity() {
  try { return window.localStorage.getItem('hj-catalog-density') === 'compact' ? 'compact' : 'large' }
  catch { return 'large' }
}
function CatalogSkeleton() {
  return <div className="hj-catalog-grid" aria-label="Cargando productos" aria-busy="true">
    {Array.from({ length: 8 }, (_, index) => <div key={index} className="hj-catalog-skeleton">
      <span/><span/><span/>
    </div>)}
  </div>
}
function CrossSell({ category, collection }) {
  if (!category) return null
  const otherProducts = (collection || []).filter(p => p.category_slug && p.category_slug !== category && p.total_stock !== 0)
  const choices = [...new Map(otherProducts.map(product => [product.category_slug, product])).values()].slice(0, 4)
  if (!choices.length) return null
  return <section className="hj-catalog-crosssell" aria-labelledby="hj-crosssell-title">
    <div className="hj-catalog-crosssell-heading"><div>
      <span>COMBÍNALA CON</span><h2 id="hj-crosssell-title">COMPLETA TU ESTILO<span>.</span></h2>
    </div><Link to="/catalogo">VER CATÁLOGO <ArrowRight size={15}/></Link></div>
    <div className="hj-catalog-crosssell-grid">
      {choices.map(product => <ProductCard key={product.id} product={product} catalogMode compact/>)}
    </div>
  </section>
}
export default function CatalogPage() {
  const { filters, apiFilters, active, setMany, clear } = useCatalogFilters()
  const [desktopFilters, setDesktopFilters] = useState(true)
  const [mobileFilters, setMobileFilters] = useState(false)
  const closeMobileFilters = useCallback(() => setMobileFilters(false), [])
  const [density, setDensity] = useState(readDensity)
  const [searchText, setSearchText] = useState(filters.q)
  useEffect(() => setSearchText(filters.q), [filters.q])
  const changeDensity = value => {
    setDensity(value)
    try { window.localStorage.setItem('hj-catalog-density', value) } catch { /* Navegación privada */ }
  }
  const { data: categories = [] } = useQuery({
    queryKey: ['storefront-categories'],
    queryFn: () => categoriesApi.list().then(r => r.data),
  })
  const activeCategories = categories.filter(c => c.active !== false)
  const category = activeCategories.find(c => c.slug === filters.categoria)
  const { data: variants = { color: [], talla: [], presentacion: [] } } = useQuery({
    queryKey: ['catalog-variant-filters', filters.categoria, filters.q],
    queryFn: () => productsApi.filters({
      category: filters.categoria || undefined, search: filters.q || undefined,
    }).then(r => r.data),
  })
  const { data: listing, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['catalog-redesign', apiFilters.category, apiFilters.search, apiFilters.sort,
      apiFilters.min_price, apiFilters.max_price, apiFilters.in_stock, apiFilters.featured,
      apiFilters.color, apiFilters.talla, apiFilters.presentacion, apiFilters.page],
    queryFn: async () => {
      const pages = await Promise.all(
        Array.from({ length: apiFilters.page }, (_, index) =>
          productsApi.list({ ...apiFilters, page: index + 1 }).then(response => response.data))
      )
      return mergeCatalogPages(pages)
    },
  })
  const { data: allProducts = [], isSuccess: allProductsReady } = useQuery({
    queryKey: ['catalog-cross-sell-products'],
    queryFn: () => productsApi.list({ page: 1, per_page: 100, sort: 'featured' }).then(r => r.data),
    staleTime: 60000,
  })
  const visibleProducts = listing?.products || []
  const hasNext = listing?.hasNext || false
  const resultCount = visibleProducts.length
  const categoryOptions = [{ name: 'Todo', slug: '' }, ...activeCategories]
  const completePriceCounts = allProductsReady && allProducts.length < 100
  const countByCategory = Object.fromEntries([
    ['', allProducts.length],
    ...activeCategories.map(cat => [cat.slug, allProducts.filter(product => product.category_slug === cat.slug).length]),
  ])
  const setCategory = values => setMany(values)
  const sidebarProps = { filters, setMany, variants, allProducts, complete: completePriceCounts, categories: activeCategories }
  const noResults = !isLoading && !isError && visibleProducts.length === 0
  return <div className="hj-catalog-page">
    <div className="hj-catalog-wrap">
      <CategoryHero category={category} featured={filters.featured}/>
      <CategoryChips categories={categoryOptions} selected={filters.categoria}
        setMany={setCategory} counts={countByCategory} complete={completePriceCounts}/>
    </div>
    <div className="hj-catalog-sticky">
      <div className="hj-catalog-wrap">
        <CatalogToolbar filters={filters} setMany={setMany} clear={clear} active={active}
          productCount={resultCount} sort={filters.orden} filtersVisible={desktopFilters}
          onToggleFilters={() => window.matchMedia('(max-width: 1023px)').matches
            ? setMobileFilters(true) : setDesktopFilters(v => !v)}
          density={density} onDensity={changeDensity} isLoading={isLoading || isFetching} mobileOpen={mobileFilters}/>
      </div>
    </div>
    <div className="hj-catalog-wrap hj-catalog-body">
      {desktopFilters && <aside id="hj-catalog-filters" className="hj-catalog-sidebar" aria-label="Filtros">
        <form role="search" className="hj-catalog-sidebar-search" onSubmit={event => {
          event.preventDefault(); setMany({ q: searchText })
        }}>
          <input type="search" aria-label="Buscar en el catálogo" placeholder="Buscar productos"
            value={searchText} onChange={event => setSearchText(event.target.value)}/>
          <button type="submit" aria-label="Aplicar búsqueda"><ArrowRight size={17}/></button>
        </form>
        <FilterFields {...sidebarProps}/>
      </aside>}
      <section className="hj-catalog-main" aria-label="Productos del catálogo">
        {isLoading ? <CatalogSkeleton/> :
          isError ? <ErrorState onRetry={() => refetch()}/> : noResults ?
          <div className="hj-catalog-empty" role="status">
            <h2>No hay {category?.name?.toLowerCase() || 'productos'} con estos filtros</h2>
            <p>Prueba otra categoría o elimina alguno de los filtros seleccionados.</p>
            <button type="button" onClick={clear}>LIMPIAR FILTROS</button>
            <nav aria-label="Otras categorías">{activeCategories.filter(c => c.slug !== filters.categoria).slice(0, 4).map(c =>
              <button type="button" key={c.slug} onClick={() => setMany({ categoria: c.slug,
                color: '', talla: '', presentacion: '', min_price: '', max_price: '' })}>{c.name}</button>)}</nav>
          </div> :
          <div className={`hj-catalog-grid ${density === 'compact' ? 'is-compact' : ''}`}>
            {visibleProducts.map(product => <ProductCard key={product.id} product={product}
              catalogMode hideCategory={Boolean(category)} />)}
          </div>}
        {!isError && !isLoading && visibleProducts.length > 0 &&
          <div className="hj-catalog-pagination">
            <p>Viste {visibleProducts.length} productos{filters.categoria ? ` de ${category?.name || filters.categoria}` : ''}.</p>
            {hasNext && <button type="button" onClick={() => setMany({ page: filters.page + 1 })}>
              CARGAR MÁS PRODUCTOS <ArrowRight size={16}/>
            </button>}
          </div>}
      </section>
    </div>
    <div className="hj-catalog-wrap">
      <CrossSell category={filters.categoria} collection={allProducts}/>
    </div>
    <div className="hj-catalog-trust">
      <div className="hj-catalog-wrap">
        <div><PackageCheck size={20}/><span><strong>Envíos a Colombia</strong><small>Consulta costos y condiciones antes de comprar.</small></span></div>
        <div><CreditCard size={20}/><span><strong>Opciones de pago</strong><small>Revisa los métodos disponibles en el checkout.</small></span></div>
        <Link to="/politicas/devoluciones"><RefreshCw size={20}/><span><strong>Cambios y devoluciones</strong><small>Consulta las condiciones aplicables.</small></span></Link>
      </div>
    </div>
    <FilterSheet open={mobileFilters} onClose={closeMobileFilters}
      filters={filters} setMany={setMany} clear={clear} {...{
        variants, allProducts, categories: activeCategories,
      }} complete={completePriceCounts} count={resultCount}/>
  </div>
}
