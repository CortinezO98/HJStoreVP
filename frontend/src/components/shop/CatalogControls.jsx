import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, X, LayoutGrid, Grid2X2, ChevronDown } from 'lucide-react'
import { normalizeColor } from '../../utils/catalogColors'

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Destacados' },
  { value: 'newest', label: 'Más recientes' },
  { value: 'price_asc', label: 'Precio menor a mayor' },
  { value: 'price_desc', label: 'Precio mayor a menor' },
]
export const PRICE_OPTIONS = [
  { value: ':', title: 'Todos los precios', min: '', max: '' },
  { value: ':40000', title: 'Hasta $40.000', min: '', max: '40000' },
  { value: '40000:100000', title: '$40.000 a $100.000', min: '40000', max: '100000' },
  { value: '100000:200000', title: '$100.000 a $200.000', min: '100000', max: '200000' },
  { value: '200000:', title: 'Más de $200.000', min: '200000', max: '' },
]

export function CategoryChips({ categories, selected, setMany, counts = {}, complete = false }) {
  return <nav className="hj-category-chips" aria-label="Categorías del catálogo">
    {categories.map(cat => <button type="button" key={cat.slug || 'all'}
      aria-pressed={selected === cat.slug} className="hj-category-chip"
      onClick={() => setMany({ categoria: cat.slug, featured: '', color: '', talla: '', presentacion: '' })}>
      {cat.name}
      {complete && counts[cat.slug] !== undefined && <small>{counts[cat.slug]}</small>}
    </button>)}
  </nav>
}
export function FilterFields({ filters, setMany, variants = {}, suggestedColors = [], allProducts = [], complete = false, categories = [] }) {
  const priceSelected = `${filters.min_price}:${filters.max_price}`
  const colors = [...new Map([...(variants.color || []), ...suggestedColors]
    .map(value => [normalizeColor(value), value])).values()]
  const sizes = filters.categoria === 'gorras' ? ['S/M', 'L/XL', 'Ajustable'] : []
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
          return <button type="button" key={option.value}
            aria-pressed={priceSelected === option.value}
            onClick={() => setMany({ min_price: option.min, max_price: option.max })}>
            <span>{option.title}</span>{complete && <small>{matches}</small>}
          </button>
        })}
      </div>
    </section>
    <section>
      <div className="hj-catalog-filter-title">Color</div>
      <div className="hj-catalog-color-options">
        {Array.from(new Set([filters.color, ...colors].filter(Boolean))).map(color => {
          const normalized = normalizeColor(color)
          return <button type="button" key={normalized} aria-pressed={normalizeColor(filters.color) === normalized}
            aria-label={`Filtrar por color ${color}`}
            onClick={() => setMany({ color: normalizeColor(filters.color) === normalized ? '' : color })}>
            <span className="hj-catalog-color-swatch" data-color={normalized}/>
            <span>{color}</span>
          </button>
        })}
      </div>
      {!colors.length && <p className="hj-filter-help">No hay opciones de color configuradas para esta selección.</p>}
    </section>
    {filters.categoria === 'gorras' && <section>
      <div className="hj-catalog-filter-title">Talla</div>
      <div className="hj-catalog-size-options">
        {sizes.map(size => {
          const available = (variants.talla || []).some(item => item.toLocaleLowerCase('es') === size.toLocaleLowerCase('es'))
          return <button type="button" key={size} aria-pressed={filters.talla === size}
            disabled={!available && filters.talla !== size}
            title={!available ? 'Todavía no hay variantes con esta talla' : undefined}
            onClick={() => setMany({ talla: filters.talla === size ? '' : size })}>{size}</button>
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
  onToggleFilters, density, onDensity, isLoading, mobileOpen = false,
}) {
  const tokens = [
    ['categoria', filters.categoria && `Categoría: ${filters.categoria}`],
    ['q', filters.q && `«${filters.q}»`],
    ['color', filters.color && `Color: ${filters.color}`],
    ['talla', filters.talla && `Talla: ${filters.talla}`],
    ['presentacion', filters.presentacion && `Presentación: ${filters.presentacion}`],
    ['price', (filters.min_price || filters.max_price) && 'Precio'],
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
    <span className="hj-catalog-result-count" aria-live="polite">{isLoading ? 'Cargando…' : `${productCount} productos`}</span>
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
export function FilterSheet({ open, onClose, filters, setMany, clear, variants, suggestedColors, allProducts, complete, categories, count }) {
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
        <FilterFields {...{ filters, setMany, variants, suggestedColors, allProducts, complete, categories }}/>
      </div>
      <footer>
        <button type="button" onClick={clear}>Limpiar</button>
        <button type="button" onClick={onClose}>Ver {count} productos</button>
      </footer>
    </section>
  </div>
}
