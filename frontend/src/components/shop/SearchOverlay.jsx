import { formatCOP } from '../../utils/currency'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, X, ArrowRight, Clock } from 'lucide-react'
import { productsApi } from '../../services/api'
import ProductImage from './ProductImage'

const STORAGE_KEY = 'hjstore-recent-searches'
const API_URL = import.meta.env.VITE_API_URL || ''
const money = formatCOP
function recentRead() {
  try {
    const values = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(values) ? values.filter(item => typeof item === 'string').slice(0, 5) : []
  } catch { return [] }
}
function Highlight({ text, query }) {
  const index = text.toLocaleLowerCase('es').indexOf(query.toLocaleLowerCase('es'))
  if (!query || index < 0) return text
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>
}
export default function SearchOverlay({ open, onClose, categories = [], returnFocusRef }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const dialogRef = useRef(null)
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(-1)
  const [recent, setRecent] = useState(recentRead)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [text])
  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    const onKeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'Tab') {
        const controls = [...(dialogRef.current?.querySelectorAll('button:not([disabled]),input:not([disabled])') || [])]
        if (!controls.length) return
        if (event.shiftKey && document.activeElement === controls[0]) {
          event.preventDefault(); controls.at(-1).focus()
        } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
          event.preventDefault(); controls[0].focus()
        }
      }
    }
    document.addEventListener('keydown', onKeydown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeydown)
      returnFocusRef?.current?.focus?.()
    }
  }, [open, onClose, returnFocusRef])
  const { data: products = [], isFetching, isError, refetch } = useQuery({
    queryKey: ['storefront-overlay-search', debounced],
    queryFn: () => productsApi.list({ search: debounced, per_page: 8, page: 1 }).then(r => r.data),
    enabled: open && debounced.length >= 2,
    staleTime: 30000,
  })
  const choices = debounced.length >= 2 && Array.isArray(products) ? products : []
  const matches = debounced.length >= 2 ? categories.filter(c =>
    c.name.toLowerCase().includes(debounced.toLowerCase())).slice(0, 5) : []
  const addRecent = query => {
    const cleaned = query.trim().slice(0, 80)
    if (!cleaned) return
    const values = [cleaned, ...recent.filter(value => value.toLowerCase() !== cleaned.toLowerCase())].slice(0, 5)
    setRecent(values)
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values)) } catch { /* Privado */ }
  }
  const goToProducts = (query = text) => {
    const value = query.trim()
    if (!value) return
    addRecent(value)
    onClose()
    navigate('/catalogo?q=' + encodeURIComponent(value))
  }
  const goToProduct = item => {
    addRecent(text)
    onClose()
    navigate('/producto/' + encodeURIComponent(item.slug))
  }
  if (!open) return null
  return <div className="hj-search-backdrop" onMouseDown={e => {
    if (e.target === e.currentTarget) onClose()
  }}>
    <section id="store-search-panel" className="hj-search-dialog" ref={dialogRef}
      role="dialog" aria-modal="true" aria-label="Buscar productos">
      <div className="hj-search-head">
        <form role="search" onSubmit={e => { e.preventDefault(); goToProducts() }}>
          <Search size={24} aria-hidden="true"/>
          <input ref={inputRef} value={text} placeholder="Buscar productos"
            type="search" role="combobox" autoComplete="off"
            aria-label="Buscar productos" aria-autocomplete="list"
            aria-controls="hj-search-options" aria-expanded={choices.length > 0}
            aria-activedescendant={active >= 0 && choices[active] ? `hj-search-option-${active}` : undefined}
            onChange={e => { setText(e.target.value); setActive(-1) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown' && choices.length) { e.preventDefault(); setActive(i => Math.min(choices.length - 1, i + 1)) }
              if (e.key === 'ArrowUp' && choices.length) { e.preventDefault(); setActive(i => Math.max(-1, i - 1)) }
              if (e.key === 'Enter' && active >= 0 && choices[active]) { e.preventDefault(); goToProduct(choices[active]) }
            }}/>
          {text && <button type="button" className="hj-search-clear" aria-label="Borrar búsqueda" onClick={() => { setText(''); setActive(-1); inputRef.current?.focus() }}><X size={20}/></button>}
        </form>
        <button className="hj-search-close" type="button" onClick={onClose}>CERRAR <kbd>Esc</kbd></button>
      </div>
      <div className="hj-search-content">
        <aside className="hj-search-aside">
          <h3>CATEGORÍAS</h3>
          {matches.map(cat => <button type="button" key={cat.slug} onClick={() => {
            onClose(); navigate('/catalogo?categoria=' + encodeURIComponent(cat.slug))
          }}>{cat.name} <small>{cat.product_count} productos</small></button>)}
          {!matches.length && <p>Busca una categoría o producto.</p>}
          {recent.length > 0 && <>
            <h3>BÚSQUEDAS RECIENTES</h3>
            {recent.map(item => <button key={item} type="button" onClick={() => {
              setText(item); goToProducts(item)
            }}><Clock size={14}/>{item}</button>)}
          </>}
        </aside>
        <div className="hj-search-products">
          <h3>PRODUCTOS</h3>
          <div id="hj-search-options" role="listbox" aria-label="Resultados de búsqueda">
            {debounced.length < 2 ? <p>Escribe al menos dos caracteres para comenzar.</p> :
              isFetching ? <p role="status">Buscando productos…</p> :
              isError ? <p>No fue posible buscar. <button type="button" onClick={() => refetch()}>Reintentar</button></p> :
              choices.length ? choices.map((item, index) => {
                const stock = Number(item.total_stock ?? item.stock ?? 0)
                const image = item.primary_image
                  ? item.primary_image.startsWith('http') ? item.primary_image : API_URL + item.primary_image
                  : ''
                return <button type="button" key={item.id} id={`hj-search-option-${index}`}
                  role="option" aria-selected={active === index}
                  className={`hj-search-result ${active === index ? 'is-active' : ''}`}
                  onMouseEnter={() => setActive(index)} onClick={() => goToProduct(item)}>
                  <span className="hj-search-thumb"><ProductImage src={image} alt={item.name} category={item.category_name}/></span>
                  <span className="hj-search-result-copy"><strong><Highlight text={item.name} query={debounced}/></strong>
                    <span>{money(item.sale_price)}</span>
                    <small className={stock <= 0 ? 'is-unavailable' : ''}>{stock <= 0 ? 'Agotado' : stock <= 3 ? `Quedan ${stock} unidades` : 'Disponible'}</small>
                  </span>
                </button>
              }) : <p>No encontramos coincidencias.</p>}
          </div>
          {debounced.length >= 2 && <button className="hj-search-view-all" type="button" onClick={() => goToProducts()}>
            VER LOS {choices.length} RESULTADOS DE «{debounced}» <ArrowRight size={16}/>
          </button>}
        </div>
      </div>
    </section>
  </div>
}
