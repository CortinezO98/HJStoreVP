import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CreditCard, PackageCheck, RefreshCw } from 'lucide-react'
import { productsApi, categoriesApi } from '../../services/api'
import { useCatalogFilters } from '../../hooks/useCatalogFilters'
import ProductCard from '../../components/shop/ProductCard'
import CategoryHero from '../../components/shop/CategoryHero'
import { CategoryChips, CatalogToolbar, FilterFields, FilterSheet } from '../../components/shop/CatalogControls'
import { ErrorState } from '../../components/shop/StoreUI'

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
  const choices = (collection || []).filter(p => p.category_slug !== category && p.total_stock !== 0).slice(0, 4)
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
  const [density, setDensity] = useState(readDensity)
  const [searchText, setSearchText] = useState(filters.q)
  useEffect(() => setSearchText(filters.q), [filters.q])
  const changeDensity = value => {
    setDensity(value)
    try { window.localStorage.setItem('hj-catalog-density', value) } catch { /* Navegación privada */ }
  }
  const { data: categories = [], isError: categoriesError } = useQuery({
    queryKey: ['storefront-categories'],
    queryFn: () => categoriesApi.list().then(r => r.data),
  })
  const activeCategories = categories.filter(c => c.active !== false)
  const category = activeCategories.find(c => c.slug === filters.categoria)
  const totalCount = activeCategories.reduce((sum, cat) => sum + (cat.product_count || 0), 0)
  const countByCategory = Object.fromEntries([
    ['', totalCount], ...activeCategories.map(cat => [cat.slug, cat.product_count || 0]),
  ])
  const { data: variants = { color: [], talla: [], presentacion: [] } } = useQuery({
    queryKey: ['catalog-variant-filters', filters.categoria, filters.q],
    queryFn: () => productsApi.filters({
      category: filters.categoria || undefined, search: filters.q || undefined,
    }).then(r => r.data),
  })
  const { data: products = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['catalog-redesign', apiFilters.category, apiFilters.search, apiFilters.sort,
      apiFilters.min_price, apiFilters.max_price, apiFilters.in_stock, apiFilters.featured,
      apiFilters.color, apiFilters.talla, apiFilters.presentacion, apiFilters.page],
    queryFn: () => productsApi.list(apiFilters).then(r => r.data),
  })
  const { data: allProducts = [] } = useQuery({
    queryKey: ['catalog-cross-sell-products'],
    queryFn: () => productsApi.list({ page: 1, per_page: 100, sort: 'featured' }).then(r => r.data),
    staleTime: 60000,
  })
  const [seen, setSeen] = useState([])
  useEffect(() => setSeen([]), [filters.categoria, filters.q, filters.orden, filters.color,
    filters.talla, filters.presentacion, filters.min_price, filters.max_price, filters.disponible, filters.featured])
  useEffect(() => {
    if (isLoading || isError || !Array.isArray(products)) return
    setSeen(old => [...new Map([...old, ...products].map(item => [item.id, item])).values()])
  }, [products, isLoading, isError])
  const visibleProducts = filters.page <= 1 ? products : seen
  const hasNext = Array.isArray(products) && products.length === 24
  const resultCount = isLoading ? 0 : visibleProducts.length
  const categoryOptions = [{ name: 'Todo', slug: '' }, ...activeCategories]
  const setCategory = values => setMany(values)
  const sidebarProps = { filters, setMany, variants, allProducts, complete: false, categories: activeCategories }
  const noResults = !isLoading && !isError && products.length === 0 && filters.page === 1
  return <div className="hj-catalog-page">
    <div className="hj-catalog-wrap">
      <CategoryHero category={category} featured={filters.featured}/>
      <CategoryChips categories={categoryOptions} selected={filters.categoria}
        setMany={setCategory} counts={countByCategory} complete={!categoriesError}/>
    </div>
    <div className="hj-catalog-sticky">
      <div className="hj-catalog-wrap">
        <CatalogToolbar filters={filters} setMany={setMany} clear={clear} active={active}
          productCount={resultCount} sort={filters.orden} filtersVisible={desktopFilters}
          onToggleFilters={() => window.matchMedia('(max-width: 1023px)').matches
            ? setMobileFilters(true) : setDesktopFilters(v => !v)}
          density={density} onDensity={changeDensity} isLoading={isLoading}/>
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
      <main className="hj-catalog-main" aria-label="Productos del catálogo">
        {isLoading && !seen.length ? <CatalogSkeleton/> :
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
      </main>
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
    <FilterSheet open={mobileFilters} onClose={() => setMobileFilters(false)}
      filters={filters} setMany={setMany} clear={clear} {...{
        variants, allProducts, categories: activeCategories,
      }} complete={false} count={resultCount}/>
  </div>
}
