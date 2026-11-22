import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, CheckCircle2, Eye, RotateCcw, Save, Send, Smartphone, Monitor, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { storefrontSettingsApi } from '../services/api'
import HomeStudioPreview from '../components/storefront/HomeStudioPreview'
import HomeStudioInspector from '../components/storefront/HomeStudioInspector'
import HomeVisualBlocksEditor from '../components/storefront/HomeVisualBlocksEditor'
import HomeMarketingEditor from '../components/storefront/HomeMarketingEditor'
import { BannerPresentationControls, CarouselPlaybackControls } from '../components/storefront/PresentationControls'
import CampaignDestinationEditor from '../components/storefront/CampaignDestinationEditor'
import ImageCropModal from '../components/products/ImageCropModal'
import StorefrontWorkflowGuide from '../components/storefront/StorefrontWorkflowGuide'
import StorefrontImageDropzone from '../components/storefront/StorefrontImageDropzone'
import HomeStudioChecklist from '../components/storefront/HomeStudioChecklist'
import StorefrontImageLibrary, { collectStorefrontImages } from '../components/storefront/StorefrontImageLibrary'
import { verifyUploadedImage } from '../utils/verifyUploadedImage'
import { confirmAction } from '../components/ui/ConfirmDialog'

const API_URL = import.meta.env.VITE_API_URL || ''
const imageSrc = url => url?.startsWith('/') ? `${API_URL}${url}` : url
const SECTIONS = [
  ['newest','Recién llegados'],['statement','Campaña de estilo'],
  ['featured','Productos destacados'],['campaigns','Campañas fotográficas'],
  ['personalized','Recomendaciones'],['visual','Bloques visuales'],
  ['categories','Categorías'],['loyalty','Banner de fidelización'],['services','Beneficios'],
  ['faq','Preguntas frecuentes'],['closing','Cierre editorial'],
]
const normalizeOrder = (value, custom = []) => {
  const builtIn = SECTIONS.map(([id]) => id)
  const all = [...builtIn, ...custom.map(block => 'custom:' + block.id)]
  const normalized = [...new Set((Array.isArray(value) ? value : builtIn).filter(id => all.includes(id)))]
  for (const [id, after] of [['visual', 'campaigns'], ['loyalty', 'categories']]) {
    if (!normalized.includes(id)) {
      const position = normalized.indexOf(after)
      normalized.splice(position >= 0 ? position + 1 : normalized.length, 0, id)
    }
  }
  for (const id of all) if (!normalized.includes(id)) normalized.push(id)
  return normalized
}
const blankBanner = () => ({
  image_url: '', mobile_image_url: '', title: 'NUEVA CAMPAÑA',
  subtitle: '', button_text: 'DESCUBRIR', link: '/catalogo',
  active: false, starts_at: '', ends_at: '',
})
function errorMessage(error) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail[0]?.msg || 'Verifica los datos'
  return 'No se pudo completar la operación'
}

export default function HomeStudioPage() {
  const [draft, setDraft] = useState(null)
  const [savedDraft, setSavedDraft] = useState(null)
  const [hasSavedDraft, setHasSavedDraft] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [crop, setCrop] = useState(null)
  const [device, setDevice] = useState('desktop')
  const [selected, setSelected] = useState('hero')
  const [selectedCampaignIndex, setSelectedCampaignIndex] = useState(0)
  const [focusField, setFocusField] = useState('')
  const [selectedMedia, setSelectedMedia] = useState(null)
  const [draggedSection, setDraggedSection] = useState(null)
  const [showPreview, setShowPreview] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [versions, setVersions] = useState([])
  const [storageHealth, setStorageHealth] = useState(null)
  const changed = draft && savedDraft && JSON.stringify(draft) !== JSON.stringify(savedDraft)
  const order = useMemo(() => normalizeOrder(draft?.homepage_section_order,
    draft?.homepage_custom_sections), [draft?.homepage_section_order, draft?.homepage_custom_sections])
  const hidden = useMemo(() => draft?.homepage_hidden_sections || [], [draft?.homepage_hidden_sections])
  const libraryImages = useMemo(() => collectStorefrontImages(draft), [draft])

  const load = async () => {
    setBusy(true)
    setLoadError('')
    try {
      const { data } = await storefrontSettingsApi.readHomepageDraft()
      const normalized = { ...data.draft,
        homepage_custom_sections: data.draft.homepage_custom_sections || [],
        homepage_section_order: normalizeOrder(data.draft.homepage_section_order,
          data.draft.homepage_custom_sections || []),
      }
      setDraft(normalized)
      setSavedDraft(structuredClone(normalized))
      setHasSavedDraft(data.has_saved_draft)
      setConflict(data.has_saved_draft && data.draft_base_hash !== data.published_hash)
      const history = await storefrontSettingsApi.homepageVersions()
      setVersions(Array.isArray(history.data) ? history.data : [])
      try {
        const health = await storefrontSettingsApi.homepageStorageHealth()
        setStorageHealth(health.data)
      } catch {
        setStorageHealth(null) // El diagnóstico no debe bloquear el editor visual.
      }
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { load() }, [])
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }))
  const selectFromPreview = (id, detail = {}) => {
    setSelected(id)
    setFocusField(detail.field || '')
    setSelectedMedia(detail.media || null)
    if (id === 'campaigns') setSelectedCampaignIndex(detail.index || detail.media?.index || 0)
  }
  const replaceSelectedMedia = (media, field, url) => {
    if (!media || !url || busy || uploading) return
    const index = media.index
    if (!Number.isInteger(index) || index < 0) return
    if (media.kind === 'hero') {
      const list = [...(draft.hero_images || [])]
      if (index >= list.length) return
      list[index] = url
      update('hero_images', list)
    } else if (media.kind === 'statement') {
      const list = [...(draft.statement_images || [])]
      if (index >= list.length) return
      list[index] = url
      update('statement_images', list)
    } else if (media.kind === 'campaigns') {
      if (index >= (draft.homepage_banners || []).length) return
      updateBanner(index, field, url)
    } else if (media.kind === 'loyalty') {
      update('homepage_loyalty_banner', { ...draft.homepage_loyalty_banner, [field]: url })
    } else if (media.kind === 'categories') {
      update('homepage_category_tiles', (draft.homepage_category_tiles || []).map((tile, i) =>
        i === index ? { ...tile, [field]: url } : tile))
    } else if (media.kind === 'visual' || media.kind === 'custom') {
      const key = media.kind === 'visual' ? 'homepage_visual_blocks' : 'homepage_custom_sections'
      update(key, (draft[key] || []).map(block => block.id !== media.blockId ? block :
        { ...block, items: (block.items || []).map((item, i) =>
          i === index ? { ...item, [field]: url } : item) }))
    }
  }
  const openFullEditor = (id, index = 0) => {
    setSelected(id)
    if (id === 'campaigns') setSelectedCampaignIndex(index)
    document.getElementById('studio-section-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const updateCustomField = (id, key, value) => {
    update('homepage_custom_sections', (draft.homepage_custom_sections || []).map(block =>
      block.id === id ? { ...block, [key]: value } : block))
  }
  const createCustomSection = type => {
    if ((draft.homepage_custom_sections || []).length >= 12) {
      toast.error('Máximo 12 secciones personalizadas')
      return
    }
    const id = 'section_' + crypto.randomUUID().replace(/-/g, '')
    const section = { id, type, title: 'NUEVA SECCIÓN', active: false,
      starts_at: '', ends_at: '', autoplay: false, interval_ms: 6000,
      show_navigation: true, items: [{
        image_url: '', mobile_image_url: '', title: '', subtitle: '',
        button_text: 'VER AHORA', link: '/catalogo',
      }],
    }
    setDraft(current => ({
      ...current,
      homepage_custom_sections: [...(current.homepage_custom_sections || []), section],
      homepage_section_order: [...normalizeOrder(current.homepage_section_order,
        current.homepage_custom_sections || []), 'custom:' + id],
    }))
    setSelected('custom:' + id)
    toast('Sección creada en el borrador. Agrega imágenes y actívala antes de publicar.')
  }
  const removeCustomSection = async id => {
    const block = (draft.homepage_custom_sections || []).find(item => item.id === id)
    if (!block || !(await confirmAction('La sección se quitará del borrador. Las imágenes seguirán guardadas.', { title: 'Eliminar sección', confirmLabel: 'Eliminar', danger: true }))) return
    const key = 'custom:' + id
    setDraft(current => ({
      ...current,
      homepage_custom_sections: (current.homepage_custom_sections || []).filter(item => item.id !== id),
      homepage_section_order: (current.homepage_section_order || []).filter(item => item !== key),
      homepage_hidden_sections: (current.homepage_hidden_sections || []).filter(item => item !== key),
    }))
    setSelected('hero')
  }
  const updateCustomSection = (id, blocks) => {
    if (blocks.length !== 1 || blocks[0].id !== id) return
    update('homepage_custom_sections', (draft.homepage_custom_sections || []).map(block =>
      block.id === id ? blocks[0] : block))
  }
  const move = (id, direction) => {
    const i = order.indexOf(id), j = i + direction
    if (i < 0 || j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    update('homepage_section_order', next)
  }
  const dropSection = targetId => {
    if (!draggedSection || draggedSection === targetId || busy || uploading) {
      setDraggedSection(null)
      return
    }
    const next = [...order]
    const oldIndex = next.indexOf(draggedSection)
    const newIndex = next.indexOf(targetId)
    if (oldIndex >= 0 && newIndex >= 0) {
      next.splice(oldIndex, 1)
      next.splice(newIndex, 0, draggedSection)
      update('homepage_section_order', next)
      setSelected(draggedSection)
    }
    setDraggedSection(null)
  }
  const toggle = id => {
    const list = new Set(hidden)
    if (list.has(id)) list.delete(id)
    else list.add(id)
    update('homepage_hidden_sections', [...list])
  }
  const updateBanner = (index, key, value) =>
    update('homepage_banners', (draft.homepage_banners || []).map((item, i) => i === index
      ? { ...item, [key]: value } : item))
  const moveBanner = (index, direction) => {
    const list = [...(draft.homepage_banners || [])], target = index + direction
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    update('homepage_banners', list)
  }
  const addBanner = () => {
    if ((draft.homepage_banners || []).length >= 6) return
    update('homepage_banners', [...(draft.homepage_banners || []), blankBanner()])
  }
  const saveDraft = async () => {
    setBusy(true)
    try {
      // El backend valida el mismo esquema que se utiliza al publicar.
      await storefrontSettingsApi.saveHomepageDraft(draft)
      setSavedDraft(structuredClone(draft))
      setHasSavedDraft(true)
      try {
        const health = await storefrontSettingsApi.homepageStorageHealth()
        setStorageHealth(health.data)
      } catch { /* El diagnóstico no interrumpe el guardado del borrador. */ }
      toast.success('Borrador privado guardado. La portada pública no ha cambiado.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally { setBusy(false) }
  }
  const publish = async () => {
    if (changed || !hasSavedDraft) {
      toast.error('Primero guarda el borrador para publicarlo')
      return
    }
    if (conflict) {
      toast.error('La portada publicada cambió. Revisa el borrador antes de continuar')
      return
    }
    if (!(await confirmAction('Los clientes verán estos cambios de inmediato en la tienda.', { title: 'Publicar diseño', confirmLabel: 'Publicar ahora' }))) return
    setBusy(true)
    try {
      await storefrontSettingsApi.publishHomepageDraft()
      toast.success('Portada publicada')
      await load()
    } catch (err) {
      if (err?.response?.status === 409) setConflict(true)
      toast.error(errorMessage(err))
    } finally { setBusy(false) }
  }
  const discard = async () => {
    if (!(await confirmAction('Perderás los cambios del borrador y volverás al diseño publicado.', { title: 'Descartar borrador', confirmLabel: 'Descartar', danger: true }))) return
    setBusy(true)
    try {
      await storefrontSettingsApi.discardHomepageDraft()
      toast.success('Borrador descartado')
      await load()
    } catch (err) { toast.error(errorMessage(err)) }
    finally { setBusy(false) }
  }
  const restoreVersion = async versionId => {
    if (changed || hasSavedDraft) {
      toast.error('Descarta los cambios o el borrador actual antes de recuperar una versión')
      return
    }
    if (!(await confirmAction('Esta versión se cargará como borrador privado. La tienda publicada no cambiará.', { title: 'Recuperar versión', confirmLabel: 'Recuperar' }))) return
    setBusy(true)
    try {
      await storefrontSettingsApi.restoreHomepageVersion(versionId)
      await load()
      toast.success('Versión recuperada como borrador. Revísala antes de publicar.')
    } catch (err) { toast.error(errorMessage(err)) }
    finally { setBusy(false) }
  }
  const startCrop = (field, index, file) => {
    if (!file) return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      toast.error('Selecciona JPG, PNG o WEBP'); return
    }
    setCrop({ field, index, file })
  }
  const confirmCrop = async file => {
    if (!crop) return
    setUploading(true)
    try {
      const { data } = await storefrontSettingsApi.upload(file)
      await verifyUploadedImage(data.url)
      if (crop.field === 'hero_images') {
        update('hero_images', [...(draft.hero_images || []), data.url].slice(0, 8))
      } else {
        updateBanner(crop.index, crop.field, data.url)
      }
      setCrop(null)
      toast.success('Imagen optimizada. Guarda el borrador para conservarla')
    } catch (err) {
      toast.error(errorMessage(err))
      throw err
    } finally { setUploading(false) }
  }
  const disabled = busy || uploading || !!crop
  if (!draft) return <div className="admin-settings-page p-4">
    <h1 className="admin-page-heading">Estudio visual del inicio</h1>
    {loadError ? <div className="alert alert-danger">{loadError} <button className="btn btn-outline-danger btn-sm" onClick={load}>Reintentar</button></div> :
      <p role="status">Cargando diseñador…</p>}
  </div>

  return <div className="admin-settings-page">
    {crop && <ImageCropModal key={crop.field + crop.index + crop.file.name} file={crop.file}
      ratio={crop.field === 'mobile_image_url' ? 9/16 : 16/9}
      width={crop.field === 'mobile_image_url' ? 720 : 1600}
      title="Recortar imagen para portada" onCancel={() => setCrop(null)} onConfirm={confirmCrop}/>}
    <header className="admin-page-intro d-flex flex-wrap justify-content-between gap-3 align-items-start">
      <div>
        <p className="admin-page-kicker">HJSTOREVP / PRESENTACIÓN VISUAL</p>
        <h1 className="admin-page-heading">Estudio visual del inicio</h1>
        <p className="admin-page-description">Edita, revisa y publica la portada sin modificar el código de la tienda.</p>
      </div>
      <Link to="/configuracion-tienda" className="btn btn-outline-secondary">Configuración general</Link>
    </header>
    <StorefrontWorkflowGuide context="studio" />
    <div className="hj-studio-quick-actions" aria-label="Editar rápidamente la portada">
      <strong>¿Qué quieres cambiar?</strong>
      <div className="d-flex flex-wrap gap-2 mt-2">
        {[
          ['hero', 'Textos y fotografías del banner'],
          ['campaigns', 'Campañas e imágenes'],
          ['categories', 'Fotografías por categoría'],
          ['visual', 'Bloques visuales'],
        ].map(([id, label]) => <button key={id} type="button"
          className={`btn btn-sm ${selected === id ? 'btn-dark' : 'btn-outline-secondary'}`}
          aria-pressed={selected === id} onClick={() => {
            setSelected(id)
            document.getElementById('studio-section-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}>{label}</button>)}
      </div>
    </div>
    <HomeStudioChecklist draft={draft} changed={changed} hasSavedDraft={hasSavedDraft}
      conflict={conflict} onSelect={id => {
        setSelected(id)
        document.getElementById('studio-section-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}/>
    {storageHealth && <div className={storageHealth.in_sync
      ? 'alert alert-light border small' : 'alert alert-warning small'} role="status">
      <strong>Almacenamiento visual:</strong> {!storageHealth.schema_ready
        ? 'Migración relacional pendiente; la configuración existente sigue funcionando.'
        : !storageHealth.source_exists
          ? 'Aún no hay configuración de portada guardada. Las tablas vacías son normales.'
          : storageHealth.in_sync
            ? 'Los bloques y sus fotografías coinciden con la configuración JSON.'
            : 'Se detectaron diferencias de contenido; revisa la reconciliación antes de cambiar las lecturas.'}
      {storageHealth.schema_ready && <span className="ms-2 text-secondary">
        {storageHealth.actual_blocks ?? storageHealth.published_blocks ?? 0} bloques registrados
        {storageHealth.source_exists && ` · ${storageHealth.expected_blocks ?? 0} esperados`}
        {storageHealth.source_exists && ` · ${storageHealth.actual_slides ?? 0} imágenes/diapositivas`}
      </span>}
    </div>}
    {conflict && <div className="alert alert-warning" role="alert">
      La portada publicada se modificó después de crear este borrador. Puedes revisarlo,
      pero para publicar debes descartar el borrador y comenzar desde la versión actual.
    </div>}
    <div className="d-flex flex-wrap gap-2 align-items-center mb-4">
      <span role="status" aria-live="polite" className={changed ? 'badge text-bg-warning' : hasSavedDraft ? 'badge text-bg-info' : 'badge text-bg-light border'}>
        {changed ? 'Cambios sin guardar' : hasSavedDraft ? 'Borrador privado guardado' : 'Igual que la portada publicada'}
      </span>
      <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setShowPreview(x => !x)}>
        <Eye size={15} className="me-1"/>{showPreview ? 'Ocultar vista' : 'Mostrar vista'}
      </button>
      <button className="btn btn-outline-secondary btn-sm" type="button" disabled={disabled || !hasSavedDraft && !changed}
        onClick={discard}><RotateCcw size={15} className="me-1"/>Descartar</button>
      <button className="btn btn-primary btn-sm" type="button"
        title="Guarda el diseño en privado, sin cambiar la tienda pública"
        disabled={disabled || (!changed && hasSavedDraft)}
        onClick={saveDraft}><Save size={15} className="me-1"/>
        {!hasSavedDraft && !changed ? 'Inicializar borrador privado' : 'Guardar borrador'}
      </button>
      <button className="btn btn-dark btn-sm" type="button" title={changed ? "Guarda los cambios del borrador antes de publicar" : !hasSavedDraft ? "Primero inicializa y guarda un borrador privado" : conflict ? "Revisa el conflicto con la portada publicada" : "Publica el borrador actual"} disabled={disabled || changed || !hasSavedDraft || conflict}
        onClick={publish}><Send size={15} className="me-1"/>Publicar portada</button>
    </div>
    <details className="admin-settings-section mb-4">
      <summary className="fw-bold" style={{ cursor:'pointer' }}>
        Historial de versiones publicadas ({versions.length})
      </summary>
      <p className="small text-secondary mt-3">
        Se conservan hasta 5 versiones anteriores. Recuperar una versión crea un borrador;
        no cambia automáticamente la tienda pública.
      </p>
      {!versions.length && <p className="small text-secondary">
        El historial comenzará a registrarse con la próxima publicación hecha desde este estudio.
      </p>}
      {versions.map(version => <div key={version.id}
        className="d-flex flex-wrap gap-2 justify-content-between align-items-center border rounded p-2 my-2">
        <span className="small">{new Date(version.saved_at).toLocaleString('es-CO',
          { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })}</span>
        <button type="button" className="btn btn-outline-secondary btn-sm"
          disabled={disabled || changed || hasSavedDraft}
          onClick={() => restoreVersion(version.id)}>Recuperar como borrador</button>
      </div>)}
    </details>
    <div className="row g-4 align-items-start">
      <div className={showPreview ? 'col-12 col-xl-5' : 'col-12'}>
        <div className="admin-settings-section mb-3">
          <h2 className="admin-settings-section-title">Orden de las secciones</h2>
          <p className="small text-secondary">
            Las secciones principales se pueden ocultar sin borrar datos; las que crees aquí
            se pueden eliminar individualmente. Todo permanece privado hasta publicar.
          </p>
          <div className="d-flex gap-2 flex-wrap mb-3">
            {[
              ['banner', 'Banner'], ['mosaic', 'Mosaico'], ['carousel', 'Carrusel'],
            ].map(([type, label]) => <button key={type} type="button"
              className="btn btn-outline-primary btn-sm" disabled={disabled ||
                (draft.homepage_custom_sections || []).length >= 12}
              onClick={() => createCustomSection(type)}>
              <Plus size={14} className="me-1"/>Crear {label.toLowerCase()}
            </button>)}
          </div>
          <p className="small text-secondary">Selecciona una sección para editarla. Arrastra para ordenarla, utiliza las flechas o marca su visibilidad. En celular utiliza las flechas.</p>
          <button type="button" className="btn btn-outline-secondary w-100 text-start mb-2"
            onClick={() => setSelected('hero')}>01 · Banner principal (siempre visible)</button>
          {order.map((id, i) => <div key={id} draggable={!disabled}
            onDragStart={event => { setDraggedSection(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id) }}
            onDragOver={event => { if (!disabled) event.preventDefault() }}
            onDrop={event => { event.preventDefault(); dropSection(id) }}
            onDragEnd={() => setDraggedSection(null)}
            className={`hj-studio-section-row d-flex gap-2 align-items-center border rounded px-2 py-2 mb-2 ${selected === id ? 'border-primary bg-light' : ''} ${draggedSection === id ? 'is-dragging' : ''}`}>
            <span className="hj-studio-drag-handle" title="Arrastra para cambiar de orden" aria-hidden="true">⋮⋮</span>
            <input type="checkbox" checked={!hidden.includes(id)} aria-label={`Mostrar ${id}`}
              onChange={() => toggle(id)} />
            <button type="button" className="btn btn-link text-dark text-start flex-grow-1 text-decoration-none p-0"
              onClick={() => setSelected(id)}>{i + 2} · {id.startsWith('custom:')
                ? (draft.homepage_custom_sections || []).find(block =>
                    'custom:' + block.id === id)?.title || 'Nueva sección'
                : SECTIONS.find(([x]) => x === id)?.[1]}</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={i === 0}
              aria-label="Subir sección" onClick={() => move(id, -1)}><ArrowUp size={14}/></button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={i === order.length - 1}
              aria-label="Bajar sección" onClick={() => move(id, 1)}><ArrowDown size={14}/></button>
            {id.startsWith('custom:') && <button type="button"
              className="btn btn-sm btn-outline-danger" disabled={disabled}
              aria-label="Eliminar sección" onClick={() => removeCustomSection(id.slice(7))}>
              <Trash2 size={14}/>
            </button>}
          </div>)}
        </div>
        <div className="admin-settings-section" id="studio-section-editor">
          <h2 className="admin-settings-section-title">
            Editar · {selected === 'hero' ? 'Banner principal' :
              selected.startsWith('custom:')
                ? (draft.homepage_custom_sections || []).find(block =>
                    'custom:' + block.id === selected)?.title || 'Sección personalizada'
                : SECTIONS.find(([id]) => id === selected)?.[1]}
          </h2>
          {selected.startsWith('custom:') && (() => {
            const block = (draft.homepage_custom_sections || []).find(item =>
              'custom:' + item.id === selected)
            return block ? <HomeVisualBlocksEditor key={block.id} blocks={[block]}
              allowCreate={false} allowDelete={false}
              onBusyChange={setUploading} libraryImages={libraryImages}
              onChange={next => updateCustomSection(block.id, next)}/> : null
          })()}
          {selected === 'hero' && <div className="row g-3">
            {[
              ['hero_eyebrow','Texto superior',120], ['hero_title','Título',160],
              ['hero_description','Descripción',500], ['hero_button','Texto del botón',60],
            ].map(([key,label,length]) => <div className="col-12" key={key}>
              <label className="form-label" htmlFor={key}>{label}</label>
              <input className="form-control" id={key} value={draft[key] || ''} maxLength={length}
                onChange={e => update(key,e.target.value)}/>
            </div>)}
            <div className="col-12">
              <BannerPresentationControls value={draft.hero_presentation}
                onChange={next => update('hero_presentation', next)}/>
              <CarouselPlaybackControls title="Carrusel principal" value={draft.hero_carousel_settings}
                onChange={next => update('hero_carousel_settings', next)}/>
            </div>
            <div className="col-12">
              <StorefrontImageDropzone id="studio-hero-photo"
                label="Agregar fotografía al banner principal (máx. 8)"
                hint="Arrastra o selecciona JPG, PNG o WebP. Podrás recortarla antes de guardar."
                disabled={disabled || (draft.hero_images || []).length >= 8}
                onFile={file => startCrop('hero_images', 0, file)} />
              <StorefrontImageLibrary images={libraryImages} disabled={disabled || (draft.hero_images || []).length >= 8}
                onSelect={url => update('hero_images', [...(draft.hero_images || []), url].slice(0, 8))} />
            </div>
            {(draft.hero_images || []).map((image,i) => <div className="col-6 col-lg-4" key={`${i}-${image}`}>
              <div className="hj-home-image-card">
                <img src={imageSrc(image)} alt={`Imagen principal ${i+1}`} loading="lazy" />
                <div className="hj-home-image-card-actions">
                  <strong>Foto {i + 1}</strong>
                  <div>
                    <button className="btn btn-outline-secondary btn-sm" type="button"
                      disabled={disabled || i===0} title="Mover fotografía hacia el inicio"
                      aria-label={`Mover foto ${i+1} a la izquierda`}
                      onClick={() => {
                        const next = [...draft.hero_images]
                        ;[next[i-1], next[i]] = [next[i], next[i-1]]
                        update('hero_images',next)
                      }}>←</button>
                    <button className="btn btn-outline-secondary btn-sm" type="button"
                      disabled={disabled || i===draft.hero_images.length-1} title="Mover fotografía hacia el final"
                      aria-label={`Mover foto ${i+1} a la derecha`}
                      onClick={() => {
                        const next = [...draft.hero_images]
                        ;[next[i], next[i+1]] = [next[i+1], next[i]]
                        update('hero_images',next)
                      }}>→</button>
                    <button className="btn btn-outline-danger btn-sm" type="button" disabled={disabled}
                      onClick={() => update('hero_images',draft.hero_images.filter((_,j)=>i!==j))}>Quitar</button>
                  </div>
                </div>
                <StorefrontImageLibrary images={libraryImages} title="Reemplazar con existente"
                  disabled={disabled} onSelect={url => update('hero_images',draft.hero_images.map((value,j) => i===j ? url : value))} />
              </div>
            </div>)}
          </div>}
          {selected === 'statement' && <div>
            <BannerPresentationControls value={draft.statement_presentation}
              onChange={next => update('statement_presentation', next)}/>
            <CarouselPlaybackControls title="Carrusel de campaña de estilo"
              value={draft.statement_carousel_settings}
              onChange={next => update('statement_carousel_settings', next)}/>
          </div>}
          {selected === 'campaigns' && <div className="d-flex flex-column gap-3">
            <p className="small text-secondary">Campañas con enlace, fotografía para celular y fechas de publicación.</p>
            <button className="btn btn-outline-primary btn-sm" type="button" onClick={addBanner}
              disabled={(draft.homepage_banners || []).length >= 6}>+ Agregar campaña</button>
            {(draft.homepage_banners || []).map((b,i) => <div className="border rounded p-3" key={i}>
              <div className="d-flex gap-2 align-items-center justify-content-between mb-2">
                <strong>Campaña {i+1}</strong>
                <div className="d-flex gap-1">
                  <button type="button" className="btn btn-sm btn-outline-secondary" disabled={i===0}
                    onClick={() => moveBanner(i,-1)}>↑</button>
                  <button type="button" className="btn btn-sm btn-outline-secondary"
                    disabled={i===(draft.homepage_banners || []).length-1} onClick={() => moveBanner(i,1)}>↓</button>
                  <button type="button" className="btn btn-sm btn-outline-danger"
                    onClick={() => update('homepage_banners',draft.homepage_banners.filter((_,j)=>i!==j))}>Eliminar</button>
                </div>
              </div>
              <BannerPresentationControls value={b}
                onChange={next => update('homepage_banners',
                  draft.homepage_banners.map((item,j)=>j===i ? next : item))}/>
              {b.image_url && <img src={imageSrc(b.image_url)} alt={b.title} className="w-100 rounded mb-2"
                style={{ aspectRatio:'16/7',objectFit:'cover' }}/>}
              {[
                ['title','Título',80],['subtitle','Subtítulo',160],['button_text','Botón',40],
              ].map(([key,label,maxLength]) => <label className="form-label d-block" key={key}>{label}
                <input className="form-control" maxLength={maxLength} value={b[key] || ''}
                  onChange={e => updateBanner(i,key,e.target.value)}/></label>)}
              <CampaignDestinationEditor id={`studio-campaign-${i}`} value={b}
                onChange={next => update('homepage_banners',
                  draft.homepage_banners.map((item,j) => j === i ? next : item))}/>
              {['image_url','mobile_image_url'].map(field => <StorefrontImageDropzone
                key={field} id={`studio-campaign-${i}-${field}`}
                label={field === 'image_url' ? 'Fotografía de escritorio' : 'Fotografía para celular (opcional)'}
                hint={field === 'image_url' ? 'JPG, PNG o WebP · encuadre horizontal' : 'JPG, PNG o WebP · encuadre vertical'}
                disabled={disabled} compact
                onFile={file => startCrop(field, i, file)} />)}
              {['image_url','mobile_image_url'].map(field => <StorefrontImageLibrary key={field}
                images={libraryImages} title={field === 'image_url' ? 'Usar foto de escritorio existente' : 'Usar foto móvil existente'}
                disabled={disabled} onSelect={url => updateBanner(i, field, url)} />)}
              {['starts_at','ends_at'].map((field,j) => <label className="form-label d-block" key={field}>
                {j===0?'Publicar desde (Bogotá)':'Retirar desde (Bogotá)'}
                <input type="datetime-local" className="form-control" value={b[field]||''}
                  onChange={e => updateBanner(i,field,e.target.value)}/>
              </label>)}
              <label className="form-label d-flex align-items-center gap-2">
                <input type="checkbox" checked={!!b.active}
                  onChange={e => updateBanner(i,'active',e.target.checked)}/> Activada
              </label>
            </div>)}
          </div>}
          {['categories', 'loyalty'].includes(selected) && <HomeMarketingEditor
            tiles={draft.homepage_category_tiles || []} loyalty={draft.homepage_loyalty_banner}
            onTilesChange={tiles => update('homepage_category_tiles', tiles)}
            onLoyaltyChange={banner => update('homepage_loyalty_banner', banner)}
            onBusyChange={setUploading} libraryImages={libraryImages}/>}
          {selected === 'visual' && <HomeVisualBlocksEditor blocks={draft.homepage_visual_blocks || []}
            onBusyChange={setUploading} libraryImages={libraryImages}
            onChange={blocks => update('homepage_visual_blocks',blocks)}/>}
          {!['hero','visual','campaigns','categories','loyalty','statement'].includes(selected) && !selected.startsWith('custom:') && <div>
            <p className="text-secondary">Esta sección utiliza los componentes comerciales actuales de HJStoreVP.
              Puedes cambiar su orden o visibilidad desde el panel superior, sin afectar sus datos.</p>
            {(selected === 'statement') && <p className="small">Las imágenes del carrusel de estilo siguen disponibles en
              <Link to="/configuracion-tienda"> Configuración de tienda</Link>.</p>}
          </div>}
        </div>
      </div>
      {showPreview && <div className="col-12 col-xl-7">
        <div className="admin-settings-section" style={{ position:'sticky',top:20 }}>
          <div className="d-flex justify-content-between gap-2 align-items-center flex-wrap mb-3">
            <div>
              <h2 className="admin-settings-section-title mb-1">Vista previa del borrador</h2>
              <small className="text-secondary">Representación visual editable; las fichas de productos son ilustrativas.</small>
            </div>
            <div className="btn-group btn-group-sm" aria-label="Dispositivo de vista previa">
              <button className={`btn ${device==='desktop'?'btn-dark':'btn-outline-dark'}`}
                onClick={() => setDevice('desktop')} type="button"><Monitor size={16}/> Escritorio</button>
              <button className={`btn ${device==='mobile'?'btn-dark':'btn-outline-dark'}`}
                onClick={() => setDevice('mobile')} type="button"><Smartphone size={16}/> Celular</button>
            </div>
          </div>
          <HomeStudioInspector draft={draft} selected={selected} disabled={disabled}
            selectedCampaignIndex={selectedCampaignIndex} focusField={focusField} hidden={hidden}
            device={device} selectedMedia={selectedMedia} libraryImages={libraryImages}
            onMediaChange={replaceSelectedMedia}
            onFieldChange={update} onCampaignChange={updateBanner}
            onLoyaltyChange={(key, value) => update('homepage_loyalty_banner', { ...draft.homepage_loyalty_banner, [key]: value })}
            onCustomChange={updateCustomField} onVisibilityChange={toggle}
            onOpenEditor={openFullEditor}/>
          <div className="hj-studio-preview-canvas" style={{ maxHeight:'70vh',overflow:'auto',background:'#e5e5e5',padding:12 }}>
            <HomeStudioPreview draft={draft} mobile={device==='mobile'}
              selected={selected} selectedMedia={selectedMedia} onSelect={selectFromPreview}/>
          </div>
        </div>
      </div>}
    </div>
    <p className="text-secondary small mt-3">
      Este estudio guarda un borrador privado hasta seleccionar «Publicar portada».
      Los cambios guardados desde Configuración de tienda se publican directamente; evita editar los mismos textos en ambas pantallas simultáneamente.
    </p>
  </div>
}
