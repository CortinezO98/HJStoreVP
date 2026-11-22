import { useEffect, useMemo, useRef, useState } from 'react'
import { Images, Search } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''
const imageSrc = value => value?.startsWith('/') ? `${API_URL}${value}` : value

export function collectStorefrontImages(settings = {}) {
  const result = new Map()
  const add = (url, source) => {
    if (typeof url !== 'string' || !url.trim()) return
    const value = url.trim()
    // Solo rutas del sitio o URLs HTTPS persistidas por el administrador.
    if (!(value.startsWith('/') && !value.startsWith('//')) && !value.startsWith('https://')) return
    if (!result.has(value)) result.set(value, { url: value, source })
  }
  const addImages = (items, source) => {
    if (Array.isArray(items)) items.forEach(item => add(item, source))
  }
  add(settings.hero_image_url, 'Banner principal')
  addImages(settings.hero_images, 'Carrusel principal')
  addImages(settings.statement_images, 'Campaña de estilo')
  ;(settings.homepage_banners || []).forEach((banner, i) => {
    add(banner.image_url, `Campaña ${i + 1}`)
    add(banner.mobile_image_url, `Campaña ${i + 1} · celular`)
  })
  for (const [key, description] of [
    ['homepage_visual_blocks', 'Bloque visual'],
    ['homepage_custom_sections', 'Sección personalizada'],
  ]) {
    (settings[key] || []).forEach(block => (block.items || []).forEach(item => {
      add(item.image_url, description)
      add(item.mobile_image_url, description + ' · celular')
    }))
  }
  ;(settings.homepage_category_tiles || []).forEach(tile => {
    add(tile.image_url, 'Categoría')
    add(tile.mobile_image_url, 'Categoría · celular')
  })
  add(settings.homepage_loyalty_banner?.image_url, 'Fidelización')
  add(settings.homepage_loyalty_banner?.mobile_image_url, 'Fidelización · celular')
  return [...result.values()]
}

export default function StorefrontImageLibrary({ images = [], onSelect, disabled = false, title = 'Reutilizar fotografía' }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    dialogRef.current?.querySelector('button')?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const controls = [...dialogRef.current.querySelectorAll('button:not([disabled]),input:not([disabled])')]
        if (!controls.length) return
        if (event.shiftKey && document.activeElement === controls[0]) {
          event.preventDefault(); controls.at(-1).focus()
        } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
          event.preventDefault(); controls[0].focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
      else triggerRef.current?.focus()
    }
  }, [open])
  const available = useMemo(() => {
    const term = filter.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return images.filter(image => image.source.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term))
  }, [images, filter])
  if (!images.length) return null
  return <>
    <button ref={triggerRef} type="button" className="btn btn-outline-secondary btn-sm mt-2"
      disabled={disabled} onClick={() => { setFilter(''); setOpen(true) }}>
      <Images size={15} aria-hidden="true" /> {title} ({images.length})
    </button>
    {open && <div className="hj-library-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setOpen(false)
    }}>
      <div ref={dialogRef} className="hj-library-dialog" role="dialog" aria-modal="true" aria-label="Biblioteca de fotografías">
        <div className="d-flex justify-content-between gap-2 align-items-start">
          <div><h3 className="h5 fw-bold mb-1">Fotografías del borrador</h3>
            <p className="small text-secondary mb-0">Selecciona una imagen ya utilizada. No se volverá a subir ni se publicará automáticamente.</p>
          </div>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setOpen(false)}>Cerrar</button>
        </div>
        <label className="hj-library-search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Buscar imágenes por origen</span>
          <input type="search" className="form-control" value={filter} placeholder="Filtrar por sección de origen"
            onChange={event => setFilter(event.target.value)} />
        </label>
        <div className="hj-library-grid">
          {available.map(image => <button type="button" className="hj-library-tile"
            key={image.url} onClick={() => { onSelect(image.url); setOpen(false) }}>
            <img src={imageSrc(image.url)} alt="" loading="lazy" />
            <span>{image.source}</span>
          </button>)}
        </div>
        {!available.length && <p className="small text-secondary py-4" role="status">No hay fotografías que coincidan con el filtro.</p>}
      </div>
    </div>}
  </>
}
