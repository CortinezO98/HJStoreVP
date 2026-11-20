import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, CheckCircle2, Eye, RotateCcw, Save, Send, Smartphone, Monitor } from 'lucide-react'
import { Link } from 'react-router-dom'
import { storefrontSettingsApi } from '../services/api'
import HomeStudioPreview from '../components/storefront/HomeStudioPreview'
import HomeVisualBlocksEditor from '../components/storefront/HomeVisualBlocksEditor'
import HomeMarketingEditor from '../components/storefront/HomeMarketingEditor'
import { BannerPresentationControls, CarouselPlaybackControls } from '../components/storefront/PresentationControls'
import CampaignDestinationEditor from '../components/storefront/CampaignDestinationEditor'
import ImageCropModal from '../components/products/ImageCropModal'
import { verifyUploadedImage } from '../utils/verifyUploadedImage'

const API_URL = import.meta.env.VITE_API_URL || ''
const imageSrc = url => url?.startsWith('/') ? `${API_URL}${url}` : url
const SECTIONS = [
  ['newest','Recién llegados'],['statement','Campaña de estilo'],
  ['featured','Productos destacados'],['campaigns','Campañas fotográficas'],
  ['personalized','Recomendaciones'],['visual','Bloques visuales'],
  ['categories','Categorías'],['loyalty','Banner de fidelización'],['services','Beneficios'],
  ['faq','Preguntas frecuentes'],['closing','Cierre editorial'],
]
const normalizeOrder = value => {
  const ids = SECTIONS.map(([id]) => id)
  if (!Array.isArray(value)) return ids
  const normalized = [...new Set(value.filter(id => ids.includes(id)))]
  for (const [id, after] of [['visual', 'campaigns'], ['loyalty', 'categories']]) {
    if (!normalized.includes(id)) {
      const position = normalized.indexOf(after)
      normalized.splice(position >= 0 ? position + 1 : normalized.length, 0, id)
    }
  }
  for (const id of ids) {
    if (!normalized.includes(id)) normalized.push(id)
  }
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
  const [showPreview, setShowPreview] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [versions, setVersions] = useState([])
  const changed = draft && savedDraft && JSON.stringify(draft) !== JSON.stringify(savedDraft)
  const order = useMemo(() => normalizeOrder(draft?.homepage_section_order), [draft?.homepage_section_order])
  const hidden = useMemo(() => draft?.homepage_hidden_sections || [], [draft?.homepage_hidden_sections])

  const load = async () => {
    setBusy(true)
    setLoadError('')
    try {
      const { data } = await storefrontSettingsApi.readHomepageDraft()
      const normalized = { ...data.draft, homepage_section_order: normalizeOrder(data.draft.homepage_section_order) }
      setDraft(normalized)
      setSavedDraft(structuredClone(normalized))
      setHasSavedDraft(data.has_saved_draft)
      setConflict(data.has_saved_draft && data.draft_base_hash !== data.published_hash)
      const history = await storefrontSettingsApi.homepageVersions()
      setVersions(Array.isArray(history.data) ? history.data : [])
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { load() }, [])
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }))
  const move = (id, direction) => {
    const i = order.indexOf(id), j = i + direction
    if (i < 0 || j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    update('homepage_section_order', next)
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
      toast.success('Borrador privado guardado')
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
    if (!window.confirm('¿Publicar ahora el diseño visual guardado? Los clientes verán estos cambios.')) return
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
    if (!window.confirm('¿Descartar el borrador privado y recuperar el diseño publicado?')) return
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
    if (!window.confirm('¿Recuperar esta versión como borrador privado? La tienda publicada no cambiará.')) return
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
    {conflict && <div className="alert alert-warning" role="alert">
      La portada publicada se modificó después de crear este borrador. Puedes revisarlo,
      pero para publicar debes descartar el borrador y comenzar desde la versión actual.
    </div>}
    <div className="d-flex flex-wrap gap-2 align-items-center mb-4">
      <span className={changed ? 'badge text-bg-warning' : hasSavedDraft ? 'badge text-bg-info' : 'badge text-bg-light border'}>
        {changed ? 'Cambios sin guardar' : hasSavedDraft ? 'Borrador privado guardado' : 'Igual que la portada publicada'}
      </span>
      <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setShowPreview(x => !x)}>
        <Eye size={15} className="me-1"/>{showPreview ? 'Ocultar vista' : 'Mostrar vista'}
      </button>
      <button className="btn btn-outline-secondary btn-sm" type="button" disabled={disabled || !hasSavedDraft && !changed}
        onClick={discard}><RotateCcw size={15} className="me-1"/>Descartar</button>
      <button className="btn btn-primary btn-sm" type="button" disabled={disabled || !changed}
        onClick={saveDraft}><Save size={15} className="me-1"/>Guardar borrador</button>
      <button className="btn btn-dark btn-sm" type="button" disabled={disabled || changed || !hasSavedDraft || conflict}
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
          <p className="small text-secondary">Selecciona una sección para editarla. Las flechas cambian su posición; el interruptor controla su visibilidad.</p>
          <button type="button" className="btn btn-outline-secondary w-100 text-start mb-2"
            onClick={() => setSelected('hero')}>01 · Banner principal (siempre visible)</button>
          {order.map((id, i) => <div key={id}
            className={`d-flex gap-2 align-items-center border rounded px-2 py-2 mb-2 ${selected === id ? 'border-primary bg-light' : ''}`}>
            <input type="checkbox" checked={!hidden.includes(id)} aria-label={`Mostrar ${id}`}
              onChange={() => toggle(id)} />
            <button type="button" className="btn btn-link text-dark text-start flex-grow-1 text-decoration-none p-0"
              onClick={() => setSelected(id)}>{i + 2} · {SECTIONS.find(([x]) => x === id)?.[1]}</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={i === 0}
              aria-label="Subir sección" onClick={() => move(id, -1)}><ArrowUp size={14}/></button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={i === order.length - 1}
              aria-label="Bajar sección" onClick={() => move(id, 1)}><ArrowDown size={14}/></button>
          </div>)}
        </div>
        <div className="admin-settings-section">
          <h2 className="admin-settings-section-title">
            Editar · {selected === 'hero' ? 'Banner principal' : SECTIONS.find(([id]) => id === selected)?.[1]}
          </h2>
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
              <label className="form-label">Agregar fotografía al carrusel principal (máx. 8)</label>
              <input className="form-control" type="file" accept="image/png,image/jpeg,image/webp"
                disabled={disabled || (draft.hero_images || []).length >= 8}
                onChange={e => { startCrop('hero_images',0,e.target.files?.[0]);e.target.value='' }}/>
            </div>
            {(draft.hero_images || []).map((image,i) => <div className="col-6" key={image}>
              <img src={imageSrc(image)} alt={`Imagen principal ${i+1}`}
                className="w-100 rounded" style={{ aspectRatio:'16/9', objectFit:'cover' }}/>
              <button className="btn btn-sm btn-outline-danger mt-1" type="button"
                onClick={() => update('hero_images',draft.hero_images.filter((_,j)=>i!==j))}>Quitar</button>
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
              {['image_url','mobile_image_url'].map(field => <label className="form-label d-block" key={field}>
                {field==='image_url'?'Imagen escritorio':'Imagen celular (opcional)'}
                <input type="file" className="form-control" accept="image/png,image/jpeg,image/webp"
                  disabled={disabled}
                  onChange={e => { startCrop(field,i,e.target.files?.[0]);e.target.value='' }}/>
              </label>)}
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
            onBusyChange={setUploading}/>}
          {selected === 'visual' && <HomeVisualBlocksEditor blocks={draft.homepage_visual_blocks || []}
            onBusyChange={setUploading} onChange={blocks => update('homepage_visual_blocks',blocks)}/>}
          {!['hero','visual','campaigns','categories','loyalty'].includes(selected) && <div>
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
          <div style={{ maxHeight:'70vh',overflow:'auto',background:'#e5e5e5',padding:12 }}>
            <HomeStudioPreview draft={draft} mobile={device==='mobile'}
              selected={selected} onSelect={setSelected}/>
          </div>
        </div>
      </div>}
    </div>
    <p className="text-secondary small mt-3">
      Los cambios de este estudio permanecen privados hasta seleccionar «Publicar portada».
      La configuración general de la tienda sigue funcionando de manera independiente.
    </p>
  </div>
}
