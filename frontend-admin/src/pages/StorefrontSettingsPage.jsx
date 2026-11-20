import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { storefrontSettingsApi } from '../services/api'
import toast from 'react-hot-toast'
import ImageCropModal from '../components/products/ImageCropModal'
import HomeVisualBlocksEditor from '../components/storefront/HomeVisualBlocksEditor'
import HomeMarketingEditor from '../components/storefront/HomeMarketingEditor'
import { verifyUploadedImage } from '../utils/verifyUploadedImage'

const GROUPS = [
  {
    title: 'Identidad comercial', subtitle: 'Datos de marca y presentación.',
    fields: [
      ['store_name', 'Nombre comercial'], ['tagline', 'Eslogan'],
      ['announcement', 'Anuncio superior'], ['footer_description', 'Descripción del pie de página'],
    ],
  },
  {
    title: 'Portada de la tienda', subtitle: 'Textos y carrusel de imágenes para el banner principal.',
    fields: [
      ['hero_eyebrow', 'Texto superior'], ['hero_title', 'Título principal'],
      ['hero_description', 'Descripción'], ['hero_button', 'Texto del botón'],
      ['logo_url', 'Logotipo'],
    ],
  },
  {
    title: 'Contacto y redes sociales', subtitle: 'Información pública visible en el pie de página.',
    fields: [
      ['contact_email', 'Correo electrónico'], ['contact_phone', 'Teléfono'],
      ['contact_whatsapp', 'WhatsApp (indicativo y números)'],
      ['instagram_url', 'Instagram (URL HTTPS)'],
      ['facebook_url', 'Facebook (URL HTTPS)'],
      ['tiktok_url', 'TikTok (URL HTTPS)'],
    ],
  },
  {
    title: 'Políticas comerciales', subtitle: 'Publica únicamente textos revisados por el comercio. Estos campos no crean obligaciones ni autorizaciones automáticamente.',
    fields: [
      ['shipping_policy', 'Política de envíos'],
      ['returns_policy', 'Cambios y devoluciones'],
      ['privacy_policy', 'Tratamiento de datos personales'],
      ['terms_policy', 'Términos y condiciones'],
    ],
  },
]
const LONG_FIELDS = new Set([
  'footer_description', 'hero_description', 'shipping_policy', 'returns_policy',
  'privacy_policy', 'terms_policy',
])
const HOME_SECTIONS = [
  ['newest', 'Recién llegados'], ['statement', 'Campaña de estilo'],
  ['featured', 'Productos destacados'], ['campaigns', 'Campañas fotográficas'],
  ['visual', 'Bloques visuales nuevos'],
  ['personalized', 'Recomendaciones'], ['categories', 'Categorías'],
  ['loyalty', 'Banner de fidelización'],
  ['services', 'Beneficios'], ['faq', 'Preguntas frecuentes'], ['closing', 'Cierre editorial'],
]
const DEFAULT_HOME_ORDER = HOME_SECTIONS.map(([id]) => id)
const normalizedHomeOrder = value =>
  Array.isArray(value) && !value.includes('visual')
    ? [...value.slice(0, value.indexOf('campaigns') + 1), 'visual',
      ...value.slice(value.indexOf('campaigns') + 1)] : value
const validHomeOrder = (value) => Array.isArray(value) &&
  value.length === DEFAULT_HOME_ORDER.length &&
  new Set(value).size === DEFAULT_HOME_ORDER.length &&
  DEFAULT_HOME_ORDER.every(id => value.includes(id))

const POLICY_FIELDS = new Set(['shipping_policy', 'returns_policy', 'privacy_policy', 'terms_policy'])
const API_URL = import.meta.env.VITE_API_URL || ''
const fileSrc = (value) => value?.startsWith('/') ? `${API_URL}${value}` : value
const errorText = (error) => {
  const detail = error?.response?.data?.detail
  return typeof detail === 'string' ? detail : 'No se pudo guardar. Revisa los valores de los campos.'
}

export default function StorefrontSettingsPage() {
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [cropQueue, setCropQueue] = useState([])
  const [campaignImageBusy, setCampaignImageBusy] = useState(null)
  const [campaignCrop, setCampaignCrop] = useState(null)
  const [previewDevice, setPreviewDevice] = useState('desktop')
  const [visualUploading, setVisualUploading] = useState(false)
  const currentHomeOrder = normalizedHomeOrder(form?.homepage_section_order)
  const homeOrder = validHomeOrder(currentHomeOrder) ? currentHomeOrder : DEFAULT_HOME_ORDER
  const hiddenHomeSections = Array.isArray(form?.homepage_hidden_sections)
    ? form.homepage_hidden_sections : []
  const moveHomeSection = (index, direction) => setForm((current) => {
    const normalized = normalizedHomeOrder(current.homepage_section_order)
    const items = [...(validHomeOrder(normalized) ? normalized : DEFAULT_HOME_ORDER)]
    const target = index + direction
    if (target < 0 || target >= items.length) return current
    ;[items[index], items[target]] = [items[target], items[index]]
    return { ...current, homepage_section_order: items }
  })
  const toggleHomeSection = (id, checked) => setForm((current) => {
    const hidden = new Set(current.homepage_hidden_sections || [])
    if (checked) hidden.delete(id)
    else hidden.add(id)
    return { ...current, homepage_hidden_sections: [...hidden] }
  })
  const banners = Array.isArray(form?.homepage_banners) ? form.homepage_banners : []
  const updateCampaign = (index, key, value) => setForm((current) => ({
    ...current,
    homepage_banners: (current.homepage_banners || []).map((item, position) =>
      position === index ? { ...item, [key]: value } : item),
  }))
  const moveCampaign = (index, direction) => setForm((current) => {
    const items = [...(current.homepage_banners || [])]
    const target = index + direction
    if (target < 0 || target >= items.length) return current
    ;[items[index], items[target]] = [items[target], items[index]]
    return { ...current, homepage_banners: items }
  })
  const uploadCampaignImage = async (index, file, field = 'image_url') => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Selecciona JPG, PNG o WEBP')
      return
    }
    setCampaignCrop({ index, field, file })
  }
  const confirmCampaignCrop = async (file) => {
    if (!campaignCrop) return
    const { index, field } = campaignCrop
    setCampaignImageBusy(index)
    try {
      const { data } = await storefrontSettingsApi.upload(file)
      await verifyUploadedImage(data.url)
      updateCampaign(index, field, data.url)
      setCampaignCrop(null)
      toast.success('Imagen optimizada. Guarda y publica para mostrarla.')
    } catch (error) {
      toast.error(errorText(error))
      throw error
    } finally {
      setCampaignImageBusy(null)
    }
  }

  const refresh = async () => {
    setLoading(true)
    try {
      const { data } = await storefrontSettingsApi.read()
      setForm(data.settings)
      setSaved(data.settings)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])
  const dirty = form && saved && JSON.stringify(form) !== JSON.stringify(saved)
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const upload = async (key, file) => {
    if (!file) return
    setUploading(key)
    try {
      const { data } = await storefrontSettingsApi.upload(file)
      change(key, data.url)
      toast.success('Imagen subida. Guarda los cambios para publicarla.')
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setUploading(null)
    }
  }
  const uploadGalleryImages = (key, files) => {
    const selected = Array.from(files || [])
    if (!selected.length) return
    const alreadyQueued = cropQueue.filter((entry) => entry.key === key).length
    if (selected.length + (form?.[key] || []).length + alreadyQueued > 8) {
      toast.error('El carrusel admite un máximo de 8 imágenes')
      return
    }
    if (selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      toast.error('Selecciona imágenes JPG, PNG o WEBP')
      return
    }
    setCropQueue((current) => [...current, ...selected.map((file) => ({ key, file }))])
  }
  const saveCroppedGalleryImage = async (file) => {
    const entry = cropQueue[0]
    if (!entry) return
    setUploading(entry.key)
    try {
      const { data } = await storefrontSettingsApi.upload(file)
      await verifyUploadedImage(data.url)
      setForm((current) => ({
        ...current,
        [entry.key]: [...(current[entry.key] || []), data.url].slice(0, 8),
      }))
      setCropQueue((current) => current.slice(1))
      toast.success('Imagen optimizada y lista. Guarda y publica para mostrarla.')
    } catch (error) {
      toast.error(errorText(error))
      throw error
    } finally {
      setUploading(null)
    }
  }
  const moveGalleryImage = (key, index, direction) => setForm((current) => {
    const images = [...(current[key] || [])]
    const destination = index + direction
    if (destination < 0 || destination >= images.length) return current
    ;[images[index], images[destination]] = [images[destination], images[index]]
    return { ...current, [key]: images }
  })
  const removeGalleryImage = (key, index) => setForm((current) => ({
    ...current,
    [key]: (current[key] || []).filter((_, position) => position !== index),
  }))

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { data } = await storefrontSettingsApi.save(form)
      setForm(data)
      setSaved(data)
      toast.success('Configuración publicada')
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="admin-settings-page">
      <header className="admin-page-intro">
        <div>
          <p className="admin-page-kicker">Personalización del negocio</p>
          <h1 className="admin-page-heading">Configuración de la tienda</h1>
          <p className="admin-page-description">
            Administra tu identidad visual, portada, redes sociales y políticas en un solo lugar.
            Los cambios se publican cuando selecciones «Guardar y publicar».
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link to="/estudio-inicio" className="btn btn-primary btn-sm">
            Abrir estudio visual del inicio
          </Link>
          <a href={import.meta.env.VITE_STORE_URL || 'http://localhost:5173/'}
            target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm">
            Ver tienda pública ↗
          </a>
        </div>
      </header>

      {loading && <div className="d-flex align-items-center gap-3 card p-4" role="status">
        <span className="spinner-border spinner-border-sm text-primary" aria-hidden="true" />
        Cargando configuración…
      </div>}
      {!loading && !form && <div className="alert alert-warning" role="alert">
        No pudimos cargar la configuración.
        <button type="button" className="btn btn-outline-secondary btn-sm ms-3" onClick={refresh}>
          Reintentar
        </button>
      </div>}
      {campaignCrop && <ImageCropModal key={campaignCrop.file.name + campaignCrop.index + campaignCrop.field}
        file={campaignCrop.file} ratio={campaignCrop.field === 'mobile_image_url' ? 9/16 : 16/9}
        width={campaignCrop.field === 'mobile_image_url' ? 720 : 1600}
        title="Encuadrar fotografía promocional"
        onCancel={() => setCampaignCrop(null)} onConfirm={confirmCampaignCrop} />}
      {cropQueue[0] && <ImageCropModal
        key={cropQueue[0].file.name + cropQueue[0].file.lastModified + cropQueue[0].key}
        file={cropQueue[0].file} ratio={16 / 9} width={1920}
        title={cropQueue[0].key === 'hero_images' ? 'Encuadrar banner principal' : 'Encuadrar imagen promocional'}
        onCancel={() => setCropQueue((current) => current.slice(1))}
        onConfirm={saveCroppedGalleryImage} />}
      {form && <form onSubmit={save} className="row g-4 align-items-start">
        <div className="col-12 col-lg-3">
          <nav className="admin-settings-nav card p-3" aria-label="Secciones de configuración">
            <p className="text-uppercase fw-bold text-secondary px-2 mb-2" style={{ fontSize: 10, letterSpacing: '.12em' }}>
              Ir a una sección
            </p>
            {GROUPS.map((group, index) => <a href={`#settings-section-${index}`} key={group.title}>
              <span className="rounded-circle bg-light border d-flex align-items-center justify-content-center"
                style={{ width: 25, height: 25, fontSize: 11 }}>{index + 1}</span>
              {group.title}
            </a>)}
          </nav>
        </div>

        <div className="col-12 col-lg-9 d-flex flex-column gap-4">
          {GROUPS.map((group, index) => <section id={`settings-section-${index}`}
            key={group.title} className="admin-settings-section">
            <div className="d-flex align-items-start gap-3 mb-4">
              <span className="d-flex align-items-center justify-content-center rounded-3 bg-light border fw-bold text-primary flex-shrink-0"
                style={{ width: 40, height: 40 }}>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="admin-settings-section-title">{group.title}</h2>
                <p className="admin-settings-section-description mb-0">{group.subtitle}</p>
              </div>
            </div>

            <div className="row g-3">
              {group.fields.map(([key, label]) => <div key={key}
                className={LONG_FIELDS.has(key) ? 'col-12' : 'col-12 col-md-6'}>
                <label htmlFor={`settings-${key}`} className="form-label">
                  {label}{key === 'store_name' && <span className="text-danger ms-1">*</span>}
                </label>
                {LONG_FIELDS.has(key) ?
                  <textarea id={`settings-${key}`} className="form-control"
                    rows={POLICY_FIELDS.has(key) ? 5 : 3}
                    maxLength={POLICY_FIELDS.has(key) ? 12000 : 500}
                    value={form[key] || ''} onChange={event => change(key, event.target.value)} />
                  : <input id={`settings-${key}`} className="form-control"
                    type={key.includes('_email') ? 'email' : 'text'}
                    required={key === 'store_name'}
                    value={form[key] || ''} onChange={event => change(key, event.target.value)} />
                }
                {POLICY_FIELDS.has(key) && <div className="form-text text-end">
                  {(form[key] || '').length.toLocaleString('es-CO')} / 12.000 caracteres
                </div>}
                {(key === 'logo_url' || key === 'hero_image_url') && <>
                  <div className="mt-3">
                    <label className="form-label" htmlFor={`settings-upload-${key}`}>Subir una imagen</label>
                    <input id={`settings-upload-${key}`} aria-label={`Subir ${label}`}
                      className="form-control" type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      disabled={!!uploading} onChange={event => upload(key, event.target.files?.[0])} />
                    <div className="form-text">PNG, JPG, WEBP o GIF. La imagen se guarda antes de publicarla.</div>
                  </div>
                  {uploading === key && <p role="status" className="text-primary small mt-2">
                    <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"/>Subiendo imagen…
                  </p>}
                  {form[key] && <img className="admin-brand-image-preview mt-3" alt={label}
                    src={fileSrc(form[key])} />}
                </>}
              </div>)}
            </div>
            {index === 1 && (['hero_images', 'statement_images'].map((galleryKey) => (
              <div key={galleryKey} className="mt-4 border rounded-3 p-3 p-md-4 bg-light">
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                  <div>
                    <h3 className="h6 fw-bold mb-1">{galleryKey === 'hero_images' ? 'Carrusel del banner principal' : 'Carrusel «Haz que tu estilo hable»'}</h3>
                    <p className="text-secondary small mb-0">
                      Agrega hasta 8 imágenes; cambiarán automáticamente cada 6 segundos.
                      Si no hay imágenes, se conserva el diseño editorial original de esta sección.
                    </p>
                  </div>
                  <span className="badge text-bg-light border text-dark">
                    {(form[galleryKey] || []).length} / 8 imágenes
                  </span>
                </div>
                <label className="form-label mt-3" htmlFor={`settings-${galleryKey}-upload`}>
                  Subir imágenes para el carrusel
                </label>
                <input id={`settings-${galleryKey}-upload`} type="file" accept="image/png,image/jpeg,image/webp"
                  multiple className="form-control" disabled={!!uploading || cropQueue.length > 0 || (form[galleryKey] || []).length >= 8}
                  onChange={(event) => {
                    uploadGalleryImages(galleryKey, event.target.files)
                    event.target.value = ''
                  }}/>
                {uploading === galleryKey && <p className="small text-secondary mt-2" role="status">Subiendo imágenes…</p>}
                {(form[galleryKey] || []).length > 0 && (
                  <div className="row g-3 mt-1">
                    {form[galleryKey].map((image, imageIndex) => (
                      <div key={`${image}-${imageIndex}`} className="col-6 col-md-4 col-xl-3">
                        <div className="bg-white rounded border p-2 h-100">
                          <img src={fileSrc(image)} alt={`Banner ${imageIndex + 1}`}
                            style={{ aspectRatio: '16/10', objectFit: 'cover', width: '100%' }} />
                          <p className="small fw-semibold mt-2 mb-2">Imagen {imageIndex + 1}</p>
                          <div className="d-flex flex-wrap gap-1">
                            <button type="button" className="btn btn-sm btn-outline-secondary"
                              disabled={imageIndex === 0 || !!uploading}
                              onClick={() => moveGalleryImage(galleryKey, imageIndex, -1)} aria-label={`Mover imagen ${imageIndex + 1} a la izquierda`}>←</button>
                            <button type="button" className="btn btn-sm btn-outline-secondary"
                              disabled={imageIndex === form[galleryKey].length - 1 || !!uploading}
                              onClick={() => moveGalleryImage(galleryKey, imageIndex, 1)} aria-label={`Mover imagen ${imageIndex + 1} a la derecha`}>→</button>
                            <button type="button" className="btn btn-sm btn-outline-danger"
                              disabled={!!uploading}
                              onClick={() => removeGalleryImage(galleryKey, imageIndex)}
                              aria-label={`Quitar imagen ${imageIndex + 1}`}>Quitar</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="form-text mt-3 mb-0">Las imágenes se muestran en el orden indicado. Pulsa «Guardar y publicar» para aplicar los cambios.</p>
              </div>
            )))}
            {index === 3 && <div className="admin-settings-info mt-4">
              Revisa estos textos con el comercio antes de publicarlos. El sistema no genera políticas legales automáticamente.
            </div>}
          </section>)}

          <section className="admin-settings-section" id="settings-home-order">
            <h2 className="admin-settings-section-title">Diseñador de inicio · Orden y visibilidad</h2>
            <p className="admin-settings-section-description">
              Organiza las secciones por prioridad. El banner principal permanece primero;
              puedes ocultar secciones sin eliminar sus datos.
            </p>
            <div className="border rounded-3 p-3 bg-light mt-3" aria-label="Resumen de la portada antes de publicar">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <strong className="small">Resumen del diseño actual (sin publicar)</strong>
                <span className="small text-secondary">{homeOrder.length - hiddenHomeSections.length + 1} secciones visibles</span>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <span className="badge text-bg-dark">Banner principal</span>
                {homeOrder.filter(id => !hiddenHomeSections.includes(id)).map(id =>
                  <span className="badge text-bg-light border text-dark" key={id}>
                    {HOME_SECTIONS.find(([key]) => key === id)?.[1] || id}
                  </span>)}
              </div>
              <p className="form-text mb-0 mt-2">Esta vista resume el orden y la visibilidad configurados;
                no sustituye la previsualización visual de la tienda.</p>
            </div>
            <div className="d-flex flex-column gap-2 mt-3">
              <div className="border rounded-3 p-3 d-flex justify-content-between align-items-center bg-light">
                <strong>00 · Banner principal</strong><span className="small text-secondary">Siempre visible</span>
              </div>
              {homeOrder.map((id, index) => (
                <div key={id} className="border rounded-3 p-3 d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <label className="d-flex gap-2 align-items-center m-0">
                    <input type="checkbox" checked={!hiddenHomeSections.includes(id)}
                      onChange={(event) => toggleHomeSection(id, event.target.checked)} />
                    <strong>{String(index + 1).padStart(2, '0')} · {HOME_SECTIONS.find(([key]) => key === id)?.[1] || id}</strong>
                  </label>
                  <div className="d-flex gap-2">
                    <button type="button" aria-label={`Subir ${id}`} className="btn btn-outline-secondary btn-sm"
                      disabled={index === 0} onClick={() => moveHomeSection(index, -1)}>↑</button>
                    <button type="button" aria-label={`Bajar ${id}`} className="btn btn-outline-secondary btn-sm"
                      disabled={index === homeOrder.length - 1} onClick={() => moveHomeSection(index, 1)}>↓</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-settings-section" id="settings-home-campaigns">
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-3">
              <div>
                <h2 className="admin-settings-section-title">Campañas visuales del inicio</h2>
                <p className="admin-settings-section-description">Hasta seis banners fotográficos interactivos. Se mostrarán después de productos destacados, en el orden indicado.</p>
              </div>
              <button type="button" className="btn btn-outline-primary btn-sm"
                disabled={banners.length >= 6 || campaignImageBusy !== null}
                onClick={() => setForm((current) => ({ ...current, homepage_banners: [
                  ...(current.homepage_banners || []),
                  { image_url: '', mobile_image_url: '', title: 'NUEVA CAMPAÑA', subtitle: '', button_text: 'DESCUBRIR', link: '/catalogo', active: false, starts_at: '', ends_at: '' },
                ] }))}>+ Agregar campaña</button>
            </div>
            <p className="small text-secondary">Cada campaña debe tener una imagen y un título. Usa rutas internas como /catalogo o /catalogo?categoria=gorras. Desactiva una campaña para ocultarla sin borrarla.</p>
            <div className="d-flex align-items-center gap-2 mb-3">
              <span className="small fw-bold">Previsualizar fotografías:</span>
              <button type="button" className={`btn btn-sm ${previewDevice === 'desktop' ? 'btn-dark' : 'btn-outline-secondary'}`}
                onClick={() => setPreviewDevice('desktop')}>Escritorio</button>
              <button type="button" className={`btn btn-sm ${previewDevice === 'mobile' ? 'btn-dark' : 'btn-outline-secondary'}`}
                onClick={() => setPreviewDevice('mobile')}>Celular</button>
            </div>
            {banners.map((banner, index) => (
              <div key={index} className="border rounded-3 p-3 mb-3">
                <div className="d-flex justify-content-between align-items-center mb-3 gap-2">
                  <strong>Campaña {index + 1}</strong>
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={index === 0} onClick={() => moveCampaign(index, -1)}>↑</button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={index === banners.length - 1} onClick={() => moveCampaign(index, 1)}>↓</button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setForm((current) => ({
                      ...current, homepage_banners: current.homepage_banners.filter((_, position) => position !== index),
                    }))}>Eliminar</button>
                  </div>
                </div>
                {banner.image_url && (
                  <div className="d-flex justify-content-center bg-dark rounded mb-3 p-2">
                    <div className="position-relative overflow-hidden rounded bg-black text-white"
                      style={{ width: previewDevice === 'mobile' ? 220 : '100%', maxWidth: 780,
                        aspectRatio: previewDevice === 'mobile' ? '9/16' : '16/7' }}>
                      <img src={fileSrc(previewDevice === 'mobile'
                        ? (banner.mobile_image_url || banner.image_url) : banner.image_url)}
                        alt="Previsualización de campaña" className="w-100 h-100"
                        style={{ objectFit: 'cover' }} />
                      <div className="position-absolute bottom-0 start-0 w-100 p-3"
                        style={{ background: 'linear-gradient(transparent, rgba(0,0,0,.8))' }}>
                        <small>{banner.subtitle}</small>
                        <div className="fw-bold text-uppercase">{banner.title}</div>
                        <span className="badge bg-white text-dark">{banner.button_text || 'DESCUBRIR'}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="row g-3">
                  <div className="col-12 col-lg-5">
                    {banner.image_url && <img src={fileSrc(banner.image_url)} alt={banner.title || 'Campaña'}
                      className="w-100 rounded mb-2" style={{ aspectRatio: '4/3', objectFit: 'cover' }} />}
                    <label className="form-label" htmlFor={`campaign-file-${index}`}>Fotografía para escritorio</label>
                    <input className="form-control" id={`campaign-file-${index}`} type="file"
                      accept="image/jpeg,image/png,image/webp" disabled={campaignImageBusy !== null}
                      onChange={(event) => { uploadCampaignImage(index, event.target.files?.[0]); event.target.value = '' }} />
                    {banner.mobile_image_url && <img src={fileSrc(banner.mobile_image_url)}
                      alt={`Vista móvil de ${banner.title}`} className="rounded mt-3 mb-2"
                      style={{ width: 110, aspectRatio: '9/16', objectFit: 'cover' }} />}
                    <label className="form-label mt-3" htmlFor={`campaign-mobile-file-${index}`}>Fotografía para celular (opcional)</label>
                    <input className="form-control" id={`campaign-mobile-file-${index}`} type="file"
                      accept="image/jpeg,image/png,image/webp" disabled={campaignImageBusy !== null}
                      onChange={(event) => { uploadCampaignImage(index, event.target.files?.[0], 'mobile_image_url'); event.target.value = '' }} />
                    {banner.mobile_image_url && <button className="btn btn-sm btn-outline-secondary mt-2"
                      type="button" onClick={() => updateCampaign(index, 'mobile_image_url', '')}>Usar imagen de escritorio</button>}
                  </div>
                  <div className="col-12 col-lg-7 row g-2 align-content-start">
                    {[
                      ['title', 'Título', 80], ['subtitle', 'Subtítulo', 160],
                      ['button_text', 'Texto del botón', 40], ['link', 'Ruta de destino', 300],
                    ].map(([key, label, maxLength]) => (
                      <div className="col-12 col-sm-6" key={key}>
                        <label className="form-label" htmlFor={`campaign-${index}-${key}`}>{label}</label>
                        <input id={`campaign-${index}-${key}`} className="form-control" maxLength={maxLength}
                          value={banner[key] || ''} onChange={(event) => updateCampaign(index, key, event.target.value)} />
                      </div>
                    ))}
                    <div className="col-12 col-sm-6">
                      <label className="form-label" htmlFor={`campaign-${index}-starts`}>Publicar desde (hora Colombia)</label>
                      <input type="datetime-local" className="form-control" id={`campaign-${index}-starts`}
                        value={banner.starts_at || ''} onChange={event => updateCampaign(index, 'starts_at', event.target.value)}/>
                    </div>
                    <div className="col-12 col-sm-6">
                      <label className="form-label" htmlFor={`campaign-${index}-ends`}>Retirar desde (hora Colombia)</label>
                      <input type="datetime-local" className="form-control" id={`campaign-${index}-ends`}
                        min={banner.starts_at || undefined} value={banner.ends_at || ''}
                        onChange={event => updateCampaign(index, 'ends_at', event.target.value)}/>
                    </div>
                    <label className="col-12 d-flex align-items-center gap-2 mt-3">
                      <input type="checkbox" checked={!!banner.active}
                        onChange={(event) => updateCampaign(index, 'active', event.target.checked)} />
                      Campaña visible en la tienda
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <HomeMarketingEditor tiles={form.homepage_category_tiles || []}
            loyalty={form.homepage_loyalty_banner} onBusyChange={setVisualUploading}
            onTilesChange={tiles => change('homepage_category_tiles', tiles)}
            onLoyaltyChange={banner => change('homepage_loyalty_banner', banner)}/>

          <HomeVisualBlocksEditor blocks={form.homepage_visual_blocks || []}
            onBusyChange={setVisualUploading}
            onChange={(blocks) => change('homepage_visual_blocks', blocks)} />

          <div className="admin-settings-footer">
            <div className="d-flex align-items-center gap-2" role="status" aria-live="polite">
              <span className={dirty ? 'badge text-bg-warning' : 'badge text-bg-light border text-secondary'}>
                {dirty ? 'Cambios pendientes' : 'Todo guardado'}
              </span>
              <small className="text-secondary">Solo el superadministrador puede publicar.</small>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="btn btn-outline-secondary"
                disabled={!dirty || busy || !!uploading || visualUploading || !!campaignCrop || cropQueue.length > 0} onClick={() => setForm(saved)}>
                Descartar cambios
              </button>
              <button type="submit" className="btn btn-primary"
                disabled={!dirty || busy || !!uploading || visualUploading || !!campaignCrop || cropQueue.length > 0 || campaignImageBusy !== null || banners.some((banner) => !banner.image_url || !banner.title?.trim())}>
                {busy ? 'Publicando…' : 'Guardar y publicar'}
              </button>
            </div>
          </div>
        </div>
      </form>}
    </div>
  )
}
