import { useEffect, useState } from 'react'
import { storefrontSettingsApi } from '../services/api'
import toast from 'react-hot-toast'

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
  const uploadGalleryImages = async (key, files) => {
    const selected = Array.from(files || [])
    if (!selected.length) return
    const current = form?.[key] || []
    if (selected.length + current.length > 8) {
      toast.error('El carrusel admite un máximo de 8 imágenes')
      return
    }
    setUploading(key)
    const uploaded = []
    try {
      for (const file of selected) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
          throw new Error('Solo se aceptan imágenes JPG, PNG, WEBP o GIF')
        }
        const { data } = await storefrontSettingsApi.upload(file)
        uploaded.push(data.url)
      }
      setForm((currentForm) => ({
        ...currentForm,
        [key]: [...(currentForm[key] || []), ...uploaded].slice(0, 8),
      }))
      toast.success('Imágenes cargadas. Guarda y publica para actualizar la portada.')
    } catch (error) {
      toast.error(error.message || errorText(error))
      if (uploaded.length) {
        setForm((currentForm) => ({
          ...currentForm,
          hero_images: [...(currentForm.hero_images || []), ...uploaded].slice(0, 8),
        }))
      }
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
        <a href={import.meta.env.VITE_STORE_URL || 'http://localhost:5173/'}
          target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm">
          Ver tienda pública ↗
        </a>
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
                <input id={`settings-${galleryKey}-upload`} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple className="form-control" disabled={!!uploading || (form[galleryKey] || []).length >= 8}
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
                )))}
                <p className="form-text mt-3 mb-0">Las imágenes se muestran en el orden indicado. Pulsa «Guardar y publicar» para aplicar los cambios.</p>
              </div>
            )}
            {index === 3 && <div className="admin-settings-info mt-4">
              Revisa estos textos con el comercio antes de publicarlos. El sistema no genera políticas legales automáticamente.
            </div>}
          </section>)}

          <div className="admin-settings-footer">
            <div className="d-flex align-items-center gap-2" role="status" aria-live="polite">
              <span className={dirty ? 'badge text-bg-warning' : 'badge text-bg-light border text-secondary'}>
                {dirty ? 'Cambios pendientes' : 'Todo guardado'}
              </span>
              <small className="text-secondary">Solo el superadministrador puede publicar.</small>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="btn btn-outline-secondary"
                disabled={!dirty || busy || !!uploading} onClick={() => setForm(saved)}>
                Descartar cambios
              </button>
              <button type="submit" className="btn btn-primary"
                disabled={!dirty || busy || !!uploading}>
                {busy ? 'Publicando…' : 'Guardar y publicar'}
              </button>
            </div>
          </div>
        </div>
      </form>}
    </div>
  )
}
