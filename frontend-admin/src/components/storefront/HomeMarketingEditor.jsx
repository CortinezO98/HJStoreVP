import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import ImageCropModal from '../products/ImageCropModal'
import { categoriesApi, storefrontSettingsApi } from '../../services/api'
import { verifyUploadedImage } from '../../utils/verifyUploadedImage'

const API_URL = import.meta.env.VITE_API_URL || ''
const src = url => url?.startsWith('/') ? `${API_URL}${url}` : url
const EMPTY_LOYALTY = {
  image_url: '', mobile_image_url: '', eyebrow: 'HJSTOREVP / CLUB',
  title: 'TU ESTILO TIENE BENEFICIOS', description: '',
  button_text: 'DESCUBRIR BENEFICIOS', link: '/mi-cuenta',
  active: false, starts_at: '', ends_at: '',
}

export default function HomeMarketingEditor({ tiles = [], loyalty = null, onTilesChange, onLoyaltyChange, onBusyChange = () => {} }) {
  const [categories, setCategories] = useState([])
  const [crop, setCrop] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [device, setDevice] = useState('desktop')
  const banner = loyalty || EMPTY_LOYALTY

  useEffect(() => {
    let active = true
    categoriesApi.list().then(({ data }) => {
      if (active) setCategories(Array.isArray(data) ? data.filter(c => c.active !== false) : [])
    }).catch(() => { if (active) toast.error('No fue posible cargar las categorías') })
    return () => { active = false }
  }, [])

  const updateTile = (index, patch) =>
    onTilesChange(tiles.map((item, i) => i === index ? { ...item, ...patch } : item))
  const updateBanner = patch => onLoyaltyChange({ ...banner, ...patch })
  const moveTile = (index, direction) => {
    const next = [...tiles], j = index + direction
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    onTilesChange(next)
  }
  const queueCrop = (target, index, field, file) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Solo JPG, PNG o WebP')
      return
    }
    setCrop({ target, index, field, file })
    onBusyChange(true)
  }
  const closeCrop = () => { setCrop(null); onBusyChange(false) }
  const confirmCrop = async file => {
    if (!crop) return
    setUploading(true)
    try {
      const { data } = await storefrontSettingsApi.upload(file)
      await verifyUploadedImage(data.url)
      if (crop.target === 'category') updateTile(crop.index, { [crop.field]: data.url })
      else updateBanner({ [crop.field]: data.url })
      closeCrop()
      toast.success('Imagen optimizada. Guarda el borrador o publica desde configuración.')
    } catch (error) {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo subir la imagen')
      throw error
    } finally { setUploading(false) }
  }
  const photoInput = (target, index, field) => <label className="form-label d-block">
    {field === 'image_url' ? 'Fotografía escritorio (16:9)' : 'Fotografía celular (9:16, opcional)'}
    <input className="form-control mt-1" type="file" accept="image/jpeg,image/png,image/webp"
      disabled={uploading || !!crop}
      onChange={e => { queueCrop(target, index, field, e.target.files?.[0]); e.target.value = '' }}/>
  </label>

  return <div className="d-flex flex-column gap-4">
    {crop && <ImageCropModal key={crop.target + crop.index + crop.field + crop.file.name}
      file={crop.file} ratio={crop.field === 'mobile_image_url' ? 9/16 : 16/9}
      width={crop.field === 'mobile_image_url' ? 720 : 1600}
      title={crop.target === 'category' ? 'Recortar fotografía de categoría' : 'Recortar banner del club'}
      onCancel={closeCrop} onConfirm={confirmCrop}/>}
    <section className="border rounded-3 p-3">
      <div className="d-flex align-items-start justify-content-between flex-wrap gap-3 mb-2">
        <div>
          <h3 className="h5 fw-bold">Galería fotográfica de categorías</h3>
          <p className="small text-secondary">Cada categoría tiene su propia imagen, enlace automático y orden. Máximo 10 tarjetas.</p>
        </div>
        <button type="button" className="btn btn-outline-primary btn-sm" disabled={tiles.length >= 10 || uploading || !!crop ||
          !categories.some(c => !tiles.some(t => t.category_slug === c.slug))}
          onClick={() => {
            const category = categories.find(c => !tiles.some(t => t.category_slug === c.slug))
            if (category) onTilesChange([...tiles, { category_slug: category.slug, title: category.name,
              image_url: '', mobile_image_url: '' }])
          }}>+ Agregar categoría</button>
      </div>
      <p className="small text-secondary">Sin fotografía publicada se conserva la galería automática con imágenes de productos.</p>
      {tiles.map((item, index) => <div className="border rounded p-3 my-3" key={item.category_slug + '-' + index}>
        <div className="d-flex justify-content-between gap-2 align-items-center mb-2">
          <strong>Tarjeta {index + 1}</strong>
          <div className="d-flex gap-1">
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={index === 0}
              onClick={() => moveTile(index, -1)} aria-label="Mover arriba">↑</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={index === tiles.length - 1}
              onClick={() => moveTile(index, 1)} aria-label="Mover abajo">↓</button>
            <button type="button" className="btn btn-outline-danger btn-sm"
              onClick={() => onTilesChange(tiles.filter((_, i) => index !== i))}>Eliminar</button>
          </div>
        </div>
        <label className="form-label d-block">Categoría de destino
          <select className="form-select mt-1" value={item.category_slug}
            onChange={e => updateTile(index, { category_slug: e.target.value,
              title: categories.find(c => c.slug === e.target.value)?.name || '' })}>
            {!categories.some(c => c.slug === item.category_slug) &&
              <option value={item.category_slug}>{item.category_slug}</option>}
            {categories.filter(c => c.slug === item.category_slug ||
              !tiles.some(t => t.category_slug === c.slug)).map(c =>
              <option value={c.slug} key={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className="form-label d-block">Título de la tarjeta
          <input className="form-control mt-1" value={item.title || ''} maxLength={80}
            onChange={e => updateTile(index, { title: e.target.value })}/>
        </label>
        {item.image_url && <div className="rounded overflow-hidden bg-dark mb-3" style={{ height: device === 'desktop' ? 200 : 260, maxWidth: device === 'desktop' ? '100%' : 190 }}>
          <img src={src(device === 'mobile' ? item.mobile_image_url || item.image_url : item.image_url)}
            alt={item.title || item.category_slug} className="w-100 h-100" style={{ objectFit:'cover' }}/>
        </div>}
        {photoInput('category', index, 'image_url')}
        {photoInput('category', index, 'mobile_image_url')}
        {!item.image_url && <p className="small text-warning-emphasis">Añade la imagen de escritorio antes de guardar.</p>}
        {item.mobile_image_url && <button type="button" className="btn btn-outline-secondary btn-sm"
          onClick={() => updateTile(index, { mobile_image_url: '' })}>Quitar imagen móvil</button>}
      </div>)}
      <div className="btn-group btn-group-sm" aria-label="Vista de las fotografías">
        <button type="button" className={`btn ${device === 'desktop' ? 'btn-dark' : 'btn-outline-secondary'}`}
          onClick={() => setDevice('desktop')}>Escritorio</button>
        <button type="button" className={`btn ${device === 'mobile' ? 'btn-dark' : 'btn-outline-secondary'}`}
          onClick={() => setDevice('mobile')}>Celular</button>
      </div>
    </section>

    <section className="border rounded-3 p-3">
      <h3 className="h5 fw-bold">Banner de fidelización</h3>
      <p className="small text-secondary">Promociona el club de clientes sin prometer beneficios o canjes aún no habilitados.</p>
      {banner.image_url && <div className="rounded overflow-hidden position-relative bg-dark text-white mb-3"
        style={{ aspectRatio: device === 'desktop' ? '16/6' : '9/13', maxWidth: device === 'desktop' ? '100%' : 240 }}>
        <img src={src(device === 'mobile' ? banner.mobile_image_url || banner.image_url : banner.image_url)}
          alt="Vista previa del club" className="w-100 h-100" style={{ objectFit:'cover' }}/>
        <div className="position-absolute bottom-0 start-0 p-3 w-100"
          style={{ background: 'linear-gradient(transparent,#000c)' }}>
          <small>{banner.eyebrow}</small><div className="fw-bold fs-4">{banner.title}</div>
          <p className="small mb-0">{banner.description}</p>
        </div>
      </div>}
      {photoInput('loyalty', 0, 'image_url')}
      {photoInput('loyalty', 0, 'mobile_image_url')}
      {banner.mobile_image_url && <button type="button" className="btn btn-outline-secondary btn-sm mb-3"
        onClick={() => updateBanner({ mobile_image_url: '' })}>Quitar imagen móvil</button>}
      {[
        ['eyebrow', 'Texto superior',80], ['title', 'Título',110],
        ['description', 'Descripción',260], ['button_text','Botón',45], ['link','Enlace interno',300],
      ].map(([key,label,maxLength]) => <label className="form-label d-block" key={key}>{label}
        <input className="form-control mt-1" maxLength={maxLength} value={banner[key] || ''}
          onChange={e => updateBanner({ [key]: e.target.value })}/>
      </label>)}
      <div className="row g-2">
        {[['starts_at','Publicar desde (Bogotá)'],['ends_at','Retirar desde (Bogotá)']].map(([key,label]) =>
          <label className="col-12 col-md-6 form-label" key={key}>{label}
            <input type="datetime-local" className="form-control" value={banner[key] || ''}
              min={key === 'ends_at' ? banner.starts_at || undefined : undefined}
              onChange={e => updateBanner({ [key]: e.target.value })}/>
          </label>)}
      </div>
      <label className="d-flex align-items-center gap-2 mt-3">
        <input type="checkbox" checked={!!banner.active}
          onChange={e => {
            if (e.target.checked && !banner.image_url) { toast.error('Carga una imagen antes de activar el banner'); return }
            updateBanner({ active: e.target.checked })
          }}/> Publicar banner de fidelización
      </label>
    </section>
  </div>
}
