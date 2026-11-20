import { useState } from 'react'
import toast from 'react-hot-toast'
import { storefrontSettingsApi } from '../../services/api'
import { verifyUploadedImage } from '../../utils/verifyUploadedImage'

const API_URL = import.meta.env.VITE_API_URL || ''
const fileSrc = url => url?.startsWith('/') ? `${API_URL}${url}` : url
const TYPES = [
  ['banner', 'Banner completo'],
  ['mosaic', 'Mosaico fotográfico'],
  ['carousel', 'Carrusel de imágenes'],
]
const emptyItem = () => ({
  image_url: '', mobile_image_url: '', title: '', subtitle: '',
  button_text: 'VER AHORA', link: '/catalogo',
})

export default function HomeVisualBlocksEditor({ blocks = [], onChange, onBusyChange = () => {} }) {
  const [uploading, setUploading] = useState('')
  const [preview, setPreview] = useState('desktop')
  const replaceBlock = (index, patch) => onChange(blocks.map((block, i) =>
    i === index ? { ...block, ...patch } : block))
  const replaceItem = (blockIndex, itemIndex, patch) => {
    const items = blocks[blockIndex].items.map((item, i) => i === itemIndex ? { ...item, ...patch } : item)
    replaceBlock(blockIndex, { items })
  }
  const move = (list, index, direction) => {
    const target = index + direction
    if (target < 0 || target >= list.length) return list
    const result = [...list]
    ;[result[index], result[target]] = [result[target], result[index]]
    return result
  }
  const uploadImage = async (blockIndex, itemIndex, field, file) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Usa una imagen JPG, PNG o WEBP')
      return
    }
    const key = `${blocks[blockIndex].id}-${itemIndex}-${field}`
    setUploading(key)
    onBusyChange(true)
    try {
      const { data } = await storefrontSettingsApi.upload(file)
      await verifyUploadedImage(data.url)
      replaceItem(blockIndex, itemIndex, { [field]: data.url })
      toast.success('Imagen cargada. Guarda y publica para mostrarla.')
    } catch (error) {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo subir la imagen')
    } finally {
      setUploading('')
      onBusyChange(false)
    }
  }

  return <section className="admin-settings-section" id="settings-visual-blocks">
    <div className="d-flex align-items-start justify-content-between flex-wrap gap-3 mb-3">
      <div>
        <h2 className="admin-settings-section-title">Bloques visuales personalizados</h2>
        <p className="admin-settings-section-description">
          Diseña banners, mosaicos y carruseles para el inicio. Hasta 6 bloques con 8 imágenes cada uno.
          Los bloques nuevos empiezan ocultos y solo se publican al guardar.
        </p>
      </div>
      <button type="button" className="btn btn-outline-primary btn-sm"
        disabled={blocks.length >= 6 || !!uploading}
        onClick={() => onChange([...blocks, {
          id: crypto.randomUUID(), type: 'mosaic', title: '', active: false, items: [emptyItem()],
        }])}>+ Crear bloque</button>
    </div>
    <div className="d-flex align-items-center gap-2 mb-3">
      <span className="small">Vista previa:</span>
      {['desktop', 'mobile'].map(device => <button key={device} type="button"
        className={`btn btn-sm ${preview === device ? 'btn-dark' : 'btn-outline-secondary'}`}
        onClick={() => setPreview(device)}>{device === 'desktop' ? 'Escritorio' : 'Celular'}</button>)}
    </div>
    {blocks.length === 0 && <p className="small text-secondary">Todavía no hay bloques visuales. Crea el primero cuando quieras.</p>}
    {blocks.map((block, blockIndex) => <div className="border rounded-3 p-3 p-md-4 mb-3" key={block.id}>
      <div className="d-flex justify-content-between flex-wrap gap-2 mb-3">
        <strong>Bloque {blockIndex + 1} · {TYPES.find(([type]) => type === block.type)?.[1]}</strong>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" aria-label="Subir bloque"
            disabled={blockIndex === 0 || !!uploading}
            onClick={() => onChange(move(blocks, blockIndex, -1))}>↑</button>
          <button type="button" className="btn btn-outline-secondary btn-sm" aria-label="Bajar bloque"
            disabled={blockIndex === blocks.length - 1 || !!uploading}
            onClick={() => onChange(move(blocks, blockIndex, 1))}>↓</button>
          <button type="button" className="btn btn-outline-danger btn-sm" disabled={!!uploading}
            onClick={() => onChange(blocks.filter((_, i) => i !== blockIndex))}>Eliminar</button>
        </div>
      </div>
      <div className="row g-3 mb-3">
        <div className="col-12 col-md-5">
          <label className="form-label" htmlFor={`visual-type-${block.id}`}>Presentación</label>
          <select id={`visual-type-${block.id}`} className="form-select" value={block.type}
            onChange={event => replaceBlock(blockIndex, { type: event.target.value })}>
            {TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </div>
        <div className="col-12 col-md-7">
          <label className="form-label" htmlFor={`visual-title-${block.id}`}>Encabezado (opcional)</label>
          <input id={`visual-title-${block.id}`} className="form-control" maxLength={90}
            value={block.title || ''} onChange={event => replaceBlock(blockIndex, { title: event.target.value })}/>
        </div>
        <div className="col-12">
          <label className="d-inline-flex align-items-center gap-2">
            <input type="checkbox" checked={!!block.active}
              onChange={event => {
                if (event.target.checked && (!block.items.length || block.items.some(item => !item.image_url))) {
                  toast.error('Carga una imagen en cada elemento antes de activar el bloque')
                  return
                }
                replaceBlock(blockIndex, { active: event.target.checked })
              }}/>
            Publicar este bloque en la tienda
          </label>
        </div>
      </div>
      {block.items.map((item, itemIndex) => <div className="border rounded p-3 mb-3" key={itemIndex}>
        <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
          <strong className="small">Imagen {itemIndex + 1}</strong>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={itemIndex === 0 || !!uploading}
              onClick={() => replaceBlock(blockIndex, { items: move(block.items, itemIndex, -1) })}>←</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={itemIndex === block.items.length - 1 || !!uploading}
              onClick={() => replaceBlock(blockIndex, { items: move(block.items, itemIndex, 1) })}>→</button>
            <button type="button" className="btn btn-outline-danger btn-sm" disabled={!!uploading}
              onClick={() => replaceBlock(blockIndex, { active: false, items: block.items.filter((_, i) => i !== itemIndex) })}>Quitar</button>
          </div>
        </div>
        {item.image_url && <div className="d-flex justify-content-center bg-dark p-2 mb-3 rounded">
          <div className="position-relative overflow-hidden rounded" style={{
            width: preview === 'mobile' ? 180 : '100%', maxWidth: 660,
            aspectRatio: preview === 'mobile' ? '9/16' : '16/7',
          }}>
            <img src={fileSrc(preview === 'mobile' ? item.mobile_image_url || item.image_url : item.image_url)}
              alt={item.title || 'Vista previa del bloque'} className="w-100 h-100" style={{ objectFit: 'cover' }}/>
            <div className="position-absolute bottom-0 start-0 text-white p-3 w-100"
              style={{ background: 'linear-gradient(transparent,rgba(0,0,0,.85))' }}>
              <small>{item.subtitle}</small><div className="fw-bold">{item.title}</div>
              <small>{item.button_text}</small>
            </div>
          </div>
        </div>}
        <div className="row g-3">
          {['image_url', 'mobile_image_url'].map(field => <div className="col-12 col-md-6" key={field}>
            <label className="form-label" htmlFor={`visual-${block.id}-${itemIndex}-${field}`}>
              {field === 'image_url' ? 'Imagen escritorio (obligatoria)' : 'Imagen celular (opcional)'}
            </label>
            <input id={`visual-${block.id}-${itemIndex}-${field}`} className="form-control"
              type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading}
              onChange={event => {
                uploadImage(blockIndex, itemIndex, field, event.target.files?.[0])
                event.target.value = ''
              }}/>
            {field === 'mobile_image_url' && item.mobile_image_url &&
              <button type="button" className="btn btn-outline-secondary btn-sm mt-2"
                onClick={() => replaceItem(blockIndex, itemIndex, { mobile_image_url: '' })}>Eliminar imagen móvil</button>}
          </div>)}
          {[
            ['title', 'Título', 80], ['subtitle', 'Descripción corta', 160],
            ['button_text', 'Texto del botón', 40], ['link', 'Enlace interno', 300],
          ].map(([field, label, maxLength]) => <div className="col-12 col-md-6" key={field}>
            <label className="form-label" htmlFor={`visual-${block.id}-${itemIndex}-${field}`}>{label}</label>
            <input id={`visual-${block.id}-${itemIndex}-${field}`} className="form-control"
              maxLength={maxLength} value={item[field] || ''}
              onChange={event => replaceItem(blockIndex, itemIndex, { [field]: event.target.value })}/>
          </div>)}
        </div>
      </div>)}
      <button type="button" className="btn btn-outline-secondary btn-sm" disabled={block.items.length >= 8 || !!uploading}
        onClick={() => replaceBlock(blockIndex, { active: false, items: [...block.items, emptyItem()] })}>+ Agregar imagen</button>
    </div>)}
    <p className="text-secondary small mb-0">Los cambios se verán en la tienda únicamente después de pulsar «Guardar y publicar».</p>
  </section>
}
