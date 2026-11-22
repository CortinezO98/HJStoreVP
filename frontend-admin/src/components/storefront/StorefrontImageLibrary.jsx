import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { storefrontSettingsApi } from '../../services/api'
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
  const [page, setPage] = useState(1)
  const [remoteSearch, setRemoteSearch] = useState('')
  const [usage, setUsage] = useState('all')
  const [editing, setEditing] = useState(null)
  const [mediaTitle, setMediaTitle] = useState('')
  const [mediaTags, setMediaTags] = useState('')
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => { setRemoteSearch(filter.trim()); setPage(1) }, 250)
    return () => clearTimeout(timer)
  }, [open, filter])
  const { data: media, isLoading: mediaLoading, isError: mediaError, refetch } = useQuery({
    queryKey: ['storefront-media-library', page, remoteSearch, usage],
    queryFn: async () => (await storefrontSettingsApi.mediaLibrary({ page, page_size: 24, search: remoteSearch, usage })).data,
    enabled: open,
    retry: 1,
  })
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
  const beginEdit = item => {
    setEditing(item)
    setMediaTitle(item.title || '')
    setMediaTags((item.tags || []).join(', '))
  }
  const saveMetadata = async () => {
    if (!editing || saving) return
    const tags = [...new Set(mediaTags.split(',').map(item => item.trim()).filter(Boolean))]
    if (tags.length > 8 || tags.some(tag => tag.length > 30)) {
      toast.error('Usa hasta 8 etiquetas, de 30 caracteres máximo')
      return
    }
    setSaving(true)
    try {
      await storefrontSettingsApi.updateMediaMetadata(editing.filename, { title: mediaTitle.trim(), tags })
      await queryClient.invalidateQueries({ queryKey: ['storefront-media-library'] })
      setEditing(null)
      toast.success('Nombre y etiquetas guardados')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No fue posible guardar los metadatos')
    } finally { setSaving(false) }
  }
  const available = useMemo(() => {
    const term = filter.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return images.filter(image => image.source.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term))
  }, [images, filter])
  const remoteItems = Array.isArray(media?.items) ? media.items : []
  const remoteTotal = media?.total || 0
  const pageCount = Math.max(1, Math.ceil(remoteTotal / 24))
  return <>
    <button ref={triggerRef} type="button" className="btn btn-outline-secondary btn-sm mt-2"
      disabled={disabled} onClick={() => { setFilter(''); setRemoteSearch(''); setPage(1); setUsage('all'); setEditing(null); setOpen(true) }}>
      <Images size={15} aria-hidden="true" /> {title}
    </button>
    {open && <div className="hj-library-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setOpen(false)
    }}>
      <div ref={dialogRef} className="hj-library-dialog" role="dialog" aria-modal="true" aria-label="Biblioteca de fotografías">
        <div className="d-flex justify-content-between gap-2 align-items-start">
          <div><h3 className="h5 fw-bold mb-1">Biblioteca multimedia</h3>
            <p className="small text-secondary mb-0">Reutiliza fotografías del borrador o imágenes históricas almacenadas. Seleccionar no publica cambios.</p>
          </div>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setOpen(false)}>Cerrar</button>
        </div>
        <label className="hj-library-search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Buscar por origen o nombre de archivo</span>
          <input type="search" className="form-control" value={filter} placeholder="Buscar por nombre, etiqueta o archivo"
            onChange={event => setFilter(event.target.value)} />
        </label>
        <div className="hj-media-filter-row">
          <label htmlFor="hj-media-usage-filter">Dónde se utiliza</label>
          <select id="hj-media-usage-filter" className="form-select form-select-sm"
            value={usage} onChange={event => { setUsage(event.target.value); setPage(1) }}>
            <option value="all">Todas las imágenes</option>
            <option value="published">Portada publicada</option>
            <option value="draft">Borrador privado</option>
            <option value="history">Versiones anteriores</option>
            <option value="unused">Sin referencias actuales o históricas</option>
          </select>
        </div>
        {mediaError && <div className="alert alert-warning small" role="alert">No se pudo consultar el historial de archivos. Las fotografías del borrador siguen disponibles. <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => refetch()}>Reintentar</button></div>}
        <div className="hj-library-grid">
          {available.map(image => <button type="button" className="hj-library-tile"
            key={image.url} onClick={() => { onSelect(image.url); setOpen(false) }}>
            <img src={imageSrc(image.url)} alt="" loading="lazy" />
            <span>{image.source}</span>
          </button>)}
          {remoteItems.map(item => <div className="hj-library-media-card" key={item.url}>
            <button type="button" className="hj-library-tile"
              onClick={() => { onSelect(item.url); setOpen(false) }}
              aria-label={`Seleccionar ${item.title || item.filename}`}>
              <img src={imageSrc(item.url)} alt="" loading="lazy" />
              <strong>{item.title || 'Fotografía sin nombre'}</strong>
            </button>
            <div className="hj-library-card-details">
              {item.used_in?.length > 0
                ? <span className="hj-library-usage">{item.used_in.map(x => ({ published: 'Publicada', draft: 'Borrador', history: 'Historial' }[x] || x)).join(' · ')}</span>
                : <span className="hj-library-usage is-unused">Sin referencias</span>}
              {!!item.tags?.length && <small>{item.tags.join(' · ')}</small>}
              <button type="button" className="btn btn-outline-secondary btn-sm"
                onClick={() => beginEdit(item)}>Editar nombre y etiquetas</button>
            </div>
          </div>)}
        </div>
        {editing && <div className="hj-library-metadata-editor" role="group" aria-label="Editar datos de fotografía">
          <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
            <strong>Organizar fotografía</strong>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button>
          </div>
          <label className="form-label d-block">Nombre descriptivo
            <input type="text" className="form-control" maxLength={90} value={mediaTitle}
              onChange={event => setMediaTitle(event.target.value)} placeholder="Ej. Campaña noviembre - escritorio" />
          </label>
          <label className="form-label d-block">Etiquetas separadas por coma
            <input type="text" className="form-control" value={mediaTags} maxLength={255}
              onChange={event => setMediaTags(event.target.value)} placeholder="banner, temporada, escritorio" />
          </label>
          <p className="small text-secondary">Esto solo organiza el archivo. No cambia el contenido publicado.</p>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={saveMetadata}>
            {saving ? 'Guardando…' : 'Guardar datos'}
          </button>
        </div>}
        {mediaLoading && <p className="small text-secondary mt-3" role="status">Cargando fotografías almacenadas…</p>}
        {!available.length && !remoteItems.length && !mediaLoading && !mediaError && <p className="small text-secondary py-4" role="status">No hay fotografías que coincidan con el filtro.</p>}
        {remoteTotal > 24 && <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
          <small className="text-secondary">Archivos históricos · página {page} de {pageCount} ({remoteTotal} archivos)</small>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page <= 1 || mediaLoading} onClick={() => setPage(p => p - 1)}>Anterior</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page >= pageCount || mediaLoading} onClick={() => setPage(p => p + 1)}>Siguiente</button>
          </div>
        </div>}
      </div>
    </div>}
  </>
}
