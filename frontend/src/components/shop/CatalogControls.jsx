import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, X, LayoutGrid, Grid2X2, ChevronDown } from 'lucide-react'
import { normalizeColor, productNameColor } from '../../utils/catalogColors'
import { formatCOP } from '../../utils/currency'
import { PRICE_OPTIONS, canonicalPriceRange } from '../../utils/catalogPriceRanges'
import { formatCatalogCount } from '../../utils/catalogCount'

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Destacados' },
  { value: 'newest', label: 'Más recientes' },
  { value: 'price_asc', label: 'Precio menor a mayor' },
  { value: 'price_desc', label: 'Precio mayor a menor' },
]

export function CategoryChips({ categories, selected, setMany, counts = {}, complete = false, loading = false }) {
  if (loading) return <div className="hj-category-chips" aria-label="Cargando categorías" aria-busy="true">
    {Array.from({ length: 6 }, (_, index) => <span key={index} className="hj-category-chip-skeleton" />)}
  </div>
  return <nav className="hj-category-chips" aria-label="Categorías del catálogo">
    {categories.map(cat => <button type="button" key={cat.slug || 'all'}
      aria-pressed={selected === cat.slug} className="hj-category-chip"
      onClick={() => setMany({ categoria: cat.slug, featured: '', color: '', talla: '', presentacion: '' })}>
      {cat.name}
      {complete && counts[cat.slug] !== undefined && <small>{counts[cat.slug]}</small>}
    </button>)}
  </nav>
}
export function FilterFields({ filters, setMany, variants = {}, suggestedColors = [], allProducts = [], complete = false, categories = [], facetsLoading = false, facetsError = false, catalogError = false }) {
  const priceSelected = canonicalPriceRange(filters.min_price, filters.max_price).value
  const colors = [...new Map([...(variants.color || []), ...suggestedColors]
    .map(value => [normalizeColor(value), value])).values()]
  const sizes = filters.categoria === 'gorras' && (variants.talla || []).length > 0
    ? ['S/M', 'L/XL', 'Ajustable'] : []
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  const presentations = variants.presentacion || []
  const categoryName = categories.find(c => c.slug === filters.categoria)?.name || ''
  return <div className="hj-catalog-filter-fields">
    <section>
      <div className="hj-catalog-filter-title">Disponibilidad</div>
      <label className="hj-catalog-switch-row">
        <span>Solo productos disponibles</span>
        <input type="checkbox" checked={filters.disponible}
          onChange={e => setMany({ disponible: e.target.checked })}/>
        <span className="hj-catalog-switch" aria-hidden="true"/>
      </label>
    </section>
    <section>
      <div className="hj-catalog-filter-title">Precio</div>
      <div className="hj-catalog-price-options">
        {PRICE_OPTIONS.map(option => {
          const matches = allProducts.filter(product => {
            const value = Number(product.sale_price || 0)
            return (!option.min || value >= Number(option.min)) && (!option.max || value <= Number(option.max))
              && (!filters.categoria || product.category_slug === filters.categoria ||
                product.category_name?.toLowerCase() === categoryName.toLowerCase())
          }).length
          const empty = complete && matches === 0 && option.value !== ':' && priceSelected !== option.value
          return <button type="button" key={option.value} disabled={empty}
            aria-pressed={priceSelected === option.value}
            onClick={() => setMany({ min_price: option.min, max_price: option.max })}>
            <span>{option.title}</span>{complete && <small>{matches}</small>}
          </button>
        })}
      </div>
    </section>
    {!catalogError && <section>
      <div className="hj-catalog-filter-title">Color</div>
      {facetsLoading ? <div className="hj-catalog-color-loading" role="status" aria-label="Cargando colores">
        {Array.from({ length: 4 }, (_, index) => <span key={index}/>)}
      </div> : facetsError ? null : <>
        <div className="hj-catalog-color-options">
          {Array.from(new Map([filters.color, ...colors].filter(Boolean)
            .map(color => [normalizeColor(color), color])).entries()).map(([normalized, color]) => {
            const selected = normalizeColor(filters.color) === normalized
            const count = complete ? allProducts.filter(product => (!filters.categoria || product.category_slug === filters.categoria)
              && productNameColor(product) === normalized).length : null
            const hasVariant = (variants.color || []).some(value => normalizeColor(value) === normalized)
            const disabled = complete && count === 0 && !hasVariant && !selected
            return <button type="button" key={normalized} aria-pressed={selected} disabled={disabled}
              aria-label={`Filtrar por color ${color}`}
              title={disabled ? 'Sin productos de este color' : color}
              onClick={() => setMany({ color: selected ? '' : color })}>
              <span className="hj-catalog-color-swatch" data-color={normalized}/>
              <span>{color}</span>
              {count !== null && !hasVariant && <small>{count}</small>}
            </button>
          })}
        </div>
        {!colors.length && <p className="hj-filter-help">No hay opciones de color configuradas para esta selección.</p>}
      </>}
    </section>}
    {sizes.length > 0 && <section>
      <div className="hj-catalog-filter-title">Talla</div>
      <div className="hj-catalog-size-options">
        {sizes.map(size => {
          const matched = (variants.talla || []).find(item => normalizeColor(item) === normalizeColor(size))
          const selected = normalizeColor(filters.talla) === normalizeColor(size)
          return <button type="button" key={size} aria-pressed={selected}
            disabled={!matched && !selected}
            title={!matched ? 'Todavía no hay variantes con esta talla' : undefined}
            onClick={() => setMany({ talla: selected ? '' : matched || size })}>{size}</button>
        })}
      </div>
      <button type="button" className="hj-catalog-size-guide" aria-expanded={sizeGuideOpen}
        onClick={() => setSizeGuideOpen(value => !value)}>Guía de tallas</button>
      {sizeGuideOpen && <p className="hj-filter-help" role="status">
        S/M y L/XL dependen de la medida indicada por el fabricante; «Ajustable» corresponde a modelos con cierre regulable.
        Revisa la ficha del producto antes de comprar.
      </p>}
    </section>}
    {(presentations.length > 0 || filters.presentacion) && <section>
      <div className="hj-catalog-filter-title">Presentación</div>
      <div className="hj-catalog-price-options">
        {Array.from(new Set([filters.presentacion, ...presentations].filter(Boolean))).map(value =>
          <button type="button" key={value} aria-pressed={filters.presentacion === value}
            onClick={() => setMany({ presentacion: filters.presentacion === value ? '' : value })}>{value}</button>)}
      </div>
    </section>}
  </div>
}
export function CatalogToolbar({
  filters, setMany, clear, active, productCount, sort, filtersVisible,
  onToggleFilters, density, onDensity, isLoading, isError = false, categoryName = '', mobileOpen = false,
}) {
  const priceRange = canonicalPriceRange(filters.min_price, filters.max_price)
  const price = priceRange.value === ':' ? '' : priceRange.title
  const tokens = [
    ['categoria', filters.categoria && (categoryName || filters.categoria[0].toUpperCase() + filters.categoria.slice(1))],
    ['q', filters.q && `Búsqueda: ${filters.q}`],
    ['color', filters.color && `Color: ${filters.color}`],
    ['talla', filters.talla && `Talla: ${filters.talla}`],
    ['presentacion', filters.presentacion && `Presentación: ${filters.presentacion}`],
    ['price', price],
    ['disponible', filters.disponible && 'Disponibles'],
    ['featured', filters.featured && 'Destacados'],
  ].filter(([, value]) => Boolean(value))
  return <div className="hj-catalog-toolbar">
    <button type="button" className="hj-catalog-filter-toggle" onClick={onToggleFilters}
      aria-expanded={typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
        ? mobileOpen : filtersVisible}
      aria-controls="hj-catalog-filters hj-catalog-mobile-filters">
      <SlidersHorizontal size={16} aria-hidden="true"/>
      <span className="hj-filter-desktop-label">{filtersVisible ? 'Ocultar filtros' : 'Mostrar filtros'}</span>
      <span className="hj-filter-mobile-label">Filtros{active ? ` (${active})` : ''}</span>
    </button>
    <div className="hj-catalog-active-filters">
      {tokens.map(([key, title]) => <button type="button" key={key} className="hj-catalog-active-token"
        aria-label={`Quitar filtro ${title}`}
        onClick={() => key === 'price' ? setMany({ min_price: '', max_price: '' }) : setMany({ [key]: '' })}>
        {title}<X size={13} aria-hidden="true"/>
      </button>)}
      {tokens.length > 0 && <button type="button" className="hj-catalog-clear" onClick={clear}>Limpiar todo</button>}
    </div>
    {!isError && <span className="hj-catalog-result-count" aria-live="polite">{isLoading ? 'Cargando…' : formatCatalogCount(productCount, filters.categoria)}</span>}
    <label className="hj-catalog-sort">
      <span>Ordenar</span>
      <select value={sort} onChange={e => setMany({ orden: e.target.value })}>
        {SORT_OPTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <ChevronDown size={14} aria-hidden="true"/>
    </label>
    <div className="hj-catalog-density" aria-label="Tamaño de tarjetas">
      <button type="button" aria-label="Tarjetas grandes" aria-pressed={density === 'large'}
        onClick={() => onDensity('large')}><Grid2X2 size={17}/></button>
      <button type="button" aria-label="Tarjetas compactas" aria-pressed={density === 'compact'}
        onClick={() => onDensity('compact')}><LayoutGrid size={17}/></button>
    </div>
  </div>
}
export function FilterSheet({ open, onClose, filters, setMany, clear, variants, suggestedColors, allProducts, complete, categories, count, facetsLoading, facetsError, catalogError }) {
  const closeRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const old = document.body.style.overflow
    const previousFocus = document.activeElement
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const keydown = e => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const all = [...document.querySelectorAll('.hj-filter-sheet button:not([disabled]),.hj-filter-sheet input:not([disabled]),.hj-filter-sheet select:not([disabled])')]
        if (all.length && e.shiftKey && document.activeElement === all[0]) { e.preventDefault(); all.at(-1).focus() }
        else if (all.length && !e.shiftKey && document.activeElement === all.at(-1)) { e.preventDefault(); all[0].focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.body.style.overflow = old
      document.removeEventListener('keydown', keydown)
      previousFocus?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return <div className="hj-filter-sheet-backdrop" onMouseDown={e => {
    if (e.target === e.currentTarget) onClose()
  }}>
    <section className="hj-filter-sheet" id="hj-catalog-mobile-filters" role="dialog" aria-modal="true" aria-label="Filtros del catálogo">
      <header><h2>FILTROS<span>.</span></h2>
        <button type="button" ref={closeRef} onClick={onClose} aria-label="Cerrar filtros"><X size={25}/></button>
      </header>
      <div className="hj-filter-sheet-scroll">
        <div className="hj-filter-sheet-sort"><h3>Ordenar por</h3>
          <div className="hj-sort-pills">{SORT_OPTIONS.map(option =>
            <button type="button" key={option.value} aria-pressed={filters.orden === option.value}
              onClick={() => setMany({ orden: option.value })}>{option.label}</button>)}</div>
        </div>
        <FilterFields {...{ filters, setMany, variants, suggestedColors, allProducts, complete, categories, facetsLoading, facetsError, catalogError }}/>
      </div>
      <footer>
        <button type="button" onClick={clear}>Limpiar</button>
        <button type="button" onClick={onClose}>Ver {formatCatalogCount(count, filters.categoria)}</button>
      </footer>
    </section>
  </div>
}
