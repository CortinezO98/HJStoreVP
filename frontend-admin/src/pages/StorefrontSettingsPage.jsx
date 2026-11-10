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
    title: 'Portada de la tienda', subtitle: 'Textos e imágenes que se muestran en el banner.',
    fields: [
      ['hero_eyebrow', 'Texto superior'], ['hero_title', 'Título principal'],
      ['hero_description', 'Descripción'], ['hero_button', 'Texto del botón'],
      ['hero_image_url', 'Imagen del banner'],
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
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Configuración general de la tienda</h1>
          <p className="text-sm text-slate-500 mt-1">Solo el superadministrador puede publicar cambios en la tienda.</p>
        </div>
        {dirty && <span className="text-sm font-medium text-amber-700">Cambios sin guardar</span>}
      </header>
      {loading && <p role="status">Cargando configuración…</p>}
      {!loading && !form && <button type="button" className="btn-secondary" onClick={refresh}>Reintentar</button>}
      {form && <form onSubmit={save} className="space-y-6">
        {GROUPS.map((group) => <section key={group.title} className="rounded-xl border bg-white p-5 space-y-4">
          <div><h2 className="font-semibold text-lg">{group.title}</h2>
            <p className="text-sm text-slate-500">{group.subtitle}</p></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {group.fields.map(([key, label]) => <label key={key}
              className={`text-sm font-medium space-y-1 ${LONG_FIELDS.has(key) ? 'md:col-span-2' : ''}`}>
              <span className="block">{label}</span>
              {LONG_FIELDS.has(key) ? (
                <textarea className="input w-full" rows={POLICY_FIELDS.has(key) ? 7 : 3}
                  maxLength={POLICY_FIELDS.has(key) ? 12000 : 500}
                  value={form[key] || ''} onChange={(e) => change(key, e.target.value)} />
              ) : (
                <input className="input w-full" type="text"
                  required={key === 'store_name'}
                  value={form[key] || ''} onChange={(e) => change(key, e.target.value)}/>
              )}
              {(key === 'logo_url' || key === 'hero_image_url') && <>
                <input aria-label={`Subir ${label}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={!!uploading} className="block w-full text-xs mt-2"
                  onChange={(e) => upload(key, e.target.files?.[0])} />
                {uploading === key && <p className="text-xs text-slate-500">Subiendo imagen…</p>}
                {form[key] && <img className="mt-2 max-h-32 max-w-full rounded border object-contain" src={fileSrc(form[key])} alt={label} />}
              </>}
            </label>)}
          </div>
        </section>)}
        <div className="sticky bottom-3 rounded-lg border bg-white/95 p-4 flex flex-wrap justify-end gap-3 shadow-sm">
          <button type="button" className="btn-secondary" disabled={!dirty || busy}
            onClick={() => setForm(saved)}>Descartar cambios</button>
          <button type="submit" className="btn-primary" disabled={!dirty || busy || !!uploading}>
            {busy ? 'Publicando…' : 'Guardar y publicar'}
          </button>
        </div>
      </form>}
    </div>
  )
}
