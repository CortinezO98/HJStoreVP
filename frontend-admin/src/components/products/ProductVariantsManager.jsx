import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, inventoryApi, locationsApi, productsApi } from '../../services/api'
import toast from 'react-hot-toast'
import ImageCropModal from './ImageCropModal'
import ProductPhotoQuality from './ProductPhotoQuality'
import { verifyUploadedImage } from '../../utils/verifyUploadedImage'

const asMoney = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v || 0))
const detail = (error) => error?.response?.data?.detail || error?.message || 'No se pudo completar la operación'
const API_URL = import.meta.env.VITE_API_URL || ''
const imageUrl = (url) => url?.startsWith('http') ? url : url ? `${API_URL}${url}` : null
const emptyForm = { label: '', sku: '', color: '', talla: '', presentacion: '', cost_price: '', sale_price: '' }

export default function ProductVariantsManager({ product, onClose }) {
  const client = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [stockTarget, setStockTarget] = useState('')
  const [stockLocation, setStockLocation] = useState('')
  const [stockQty, setStockQty] = useState('')
  const [imageTarget, setImageTarget] = useState('')
  const [imageFiles, setImageFiles] = useState([])
  const [cropQueue, setCropQueue] = useState([])
  const [imageDescriptions, setImageDescriptions] = useState({})
  const [imageBusy, setImageBusy] = useState(false)

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ['admin-variants', product.id],
    queryFn: () => productsApi.variants(product.id).then(({ data }) => data),
  })
  const { data: locations = [] } = useQuery({
    queryKey: ['admin-variant-locations'],
    queryFn: () => locationsApi.list().then(({ data }) => data),
  })

  const invalidate = () => {
    client.invalidateQueries({ queryKey: ['admin-variants', product.id] })
    client.invalidateQueries({ queryKey: ['admin-products'] })
    client.invalidateQueries({ queryKey: ['products'] })
    client.invalidateQueries({ queryKey: ['product-detail'] })
  }
  const save = useMutation({
    mutationFn: (payload) => editing
      ? productsApi.updateVariant(product.id, editing, payload)
      : productsApi.createVariant(product.id, payload),
    onSuccess: () => {
      toast.success(editing ? 'Variante actualizada' : 'Variante creada')
      setEditing(null)
      setForm(emptyForm)
      invalidate()
    },
    onError: (error) => toast.error(detail(error)),
  })
  const replenish = useMutation({
    mutationFn: (payload) => inventoryApi.replenish(payload),
    onSuccess: () => {
      toast.success('Stock actualizado')
      setStockTarget('')
      setStockQty('')
      invalidate()
    },
    onError: (error) => toast.error(detail(error)),
  })
  const toggle = useMutation({
    mutationFn: ({ id, active }) => productsApi.updateVariant(product.id, id, { active }),
    onSuccess: invalidate,
    onError: (error) => toast.error(detail(error)),
  })

  const selectVariantImages = selected => {
    const incoming = Array.from(selected || [])
    if (!incoming.length) return
    if (incoming.length + imageFiles.length + cropQueue.length > 10) {
      toast.error('Máximo diez fotografías por lote')
      return
    }
    if (incoming.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      toast.error('Selecciona imágenes JPG, PNG o WebP')
      return
    }
    setCropQueue(current => [...current, ...incoming])
  }
  const cropVariantPhoto = file => {
    setImageFiles(current => [...current, file])
    setCropQueue(current => current.slice(1))
  }

  const uploadImages = async (variantId) => {
    if (!imageFiles.length) return toast.error('Selecciona las imágenes')
    const formData = new FormData()
    imageFiles.forEach((file) => formData.append('files', file))
    setImageBusy(true)
    try {
      const { data } = await apiClient.post(`/products/${variantId}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      try {
        await Promise.all((data || []).map(entry => verifyUploadedImage(entry.url)))
        toast.success('Fotos optimizadas y verificadas')
      } catch (error) {
        toast.error(error?.message || 'Fotos guardadas, pero no se pudo verificar su visualización')
      }
      setImageFiles([])
      invalidate()
    } catch (error) {
      toast.error(detail(error))
    } finally {
      setImageBusy(false)
    }
  }

  const updateImage = async (variantId, imageId, operation) => {
    setImageBusy(true)
    try {
      if (operation === 'primary') {
        await apiClient.patch(`/products/${variantId}/images/primary`, { image_id: imageId })
      } else {
        await apiClient.delete(`/products/${variantId}/images/${imageId}`)
      }
      toast.success(operation === 'primary' ? 'Foto principal actualizada' : 'Foto eliminada')
      invalidate()
    } catch (error) {
      toast.error(detail(error))
    } finally {
      setImageBusy(false)
    }
  }

  const reorderVariantPhotos = async (variantId, images, index, direction) => {
    const ordered = [...images].sort((a,b) => (a.sort_order - b.sort_order) || (a.id - b.id))
    const target = index + direction
    if (imageBusy || target < 0 || target >= ordered.length) return
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    setImageBusy(true)
    try {
      await apiClient.patch(`/products/${variantId}/images/order`, {
        image_ids: ordered.map(image => image.id),
      })
      invalidate()
      toast.success('Orden de imágenes de variante actualizado')
    } catch (error) {
      toast.error(detail(error))
    } finally { setImageBusy(false) }
  }

  const saveVariantAlt = async (variantId, image) => {
    const description = (imageDescriptions[image.id] ?? image.alt_text ?? '').trim()
    if (description.length < 3 || description.length > 180) {
      toast.error('La descripción debe tener entre 3 y 180 caracteres')
      return
    }
    setImageBusy(true)
    try {
      await apiClient.patch(`/products/${variantId}/images/${image.id}/alt`, {
        alt_text: description,
      })
      invalidate()
      toast.success('Descripción de imagen actualizada')
    } catch (error) { toast.error(detail(error)) }
    finally { setImageBusy(false) }
  }

  const options = Object.fromEntries(
    ['color', 'talla', 'presentacion']
      .filter((key) => form[key].trim())
      .map((key) => [key, form[key].trim()])
  )
  const handleEdit = (item) => {
    setEditing(item.id)
    setForm({
      label: item.label, sku: item.sku,
      cost_price: String(item.cost_price ?? ''),
      sale_price: String(item.sale_price),
      color: item.options?.color || '',
      talla: item.options?.talla || '',
      presentacion: item.options?.presentacion || '',
    })
  }
  return <div className="admin-catalog-modal-backdrop admin-variant-backdrop" role="presentation">
    <div role="dialog" aria-modal="true" aria-label={`Variantes de ${product.name}`}
      className="admin-catalog-modal admin-variants-dialog">
      <div className="admin-variants-scroll">
      <div className="flex justify-between items-center gap-4 admin-variants-heading">
        <div><p className="admin-page-kicker mb-1">Gestión de referencias</p><h2 className="font-bold text-xl">Variantes de {product.name}</h2>
          <p className="text-xs text-gray-500">Cada variante usa SKU, precio y existencias independientes.</p></div>
        <button className="btn-secondary" type="button" onClick={onClose}>Cerrar</button>
      </div>
      <form className="admin-variant-form space-y-3" onSubmit={(e) => {
        e.preventDefault()
        const payload = { label: form.label.trim(), options,
          cost_price: Number(form.cost_price), sale_price: Number(form.sale_price) }
        if (!editing) payload.sku = form.sku.trim()
        save.mutate(payload)
      }}>
        <h3 className="font-semibold fs-6">{editing ? 'Editar referencia' : 'Nueva referencia'}</h3>
        <p className="text-secondary small mb-0">Define las propiedades del SKU y su precio independiente.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs space-y-1">Nombre / etiqueta *
            <input className="input w-full" required maxLength={120} value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Azul / 100 ml" /></label>
          <label className="text-xs space-y-1">SKU propio *
            <input className="input w-full" required={!editing} disabled={!!editing} maxLength={100} value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="GOR-AZUL-001" /></label>
          <label className="text-xs space-y-1">Color
            <input className="input w-full" value={form.color} maxLength={80}
              onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Azul" /></label>
          <label className="text-xs space-y-1">Talla
            <input className="input w-full" value={form.talla} maxLength={80}
              onChange={(e) => setForm({ ...form, talla: e.target.value })} placeholder="M" /></label>
          <label className="text-xs space-y-1">Presentación
            <input className="input w-full" value={form.presentacion} maxLength={80}
              onChange={(e) => setForm({ ...form, presentacion: e.target.value })} placeholder="100 ml" /></label>
          <label className="text-xs space-y-1">Costo COP *
            <input className="input w-full" required type="number" min="0" step="0.01" value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></label>
          <label className="text-xs space-y-1">Precio venta COP *
            <input className="input w-full" required type="number" min="0" step="0.01" value={form.sale_price}
              onChange={(e) => setForm({ ...form, sale_price: e.target.value })} /></label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={save.isPending}>{editing ? 'Guardar cambios' : 'Crear variante'}</button>
          {editing && <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setForm(emptyForm) }}>Cancelar edición</button>}
        </div>
      </form>
      <div className="space-y-3">
        <h3 className="font-semibold fs-6">Referencias y existencias</h3>
        {isLoading && <p className="text-sm text-gray-500">Cargando referencias...</p>}
        {variants.map((item) => <div key={item.id} className="admin-variant-item space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {item.primary_image && <img src={imageUrl(item.primary_image)} alt={item.label} className="w-16 h-16 object-cover rounded-lg border" />}
              <div><strong>{item.label}</strong><p className="text-xs text-gray-500">SKU: {item.sku} · ID inventario: {item.id} · {item.active ? 'Activo' : 'Inactivo'}</p>
              <p className="text-sm">Precio: {asMoney(item.sale_price)} · Existencias: {item.total_stock}</p></div></div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" type="button" onClick={() => handleEdit(item)}>Editar</button>
              <button className="btn-secondary" type="button" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: item.id, active: !item.active })}>
                {item.active ? 'Desactivar' : 'Activar'}</button>
              {item.active && <button type="button" className="btn-primary" onClick={() => setStockTarget(String(item.id))}>Ingresar stock</button>}
              <button type="button" className="btn-secondary" onClick={() => { setImageTarget(imageTarget === String(item.id) ? '' : String(item.id)); setImageFiles([]); setCropQueue([]) }}>
                {imageTarget === String(item.id) ? 'Cerrar fotos' : `Gestionar fotos (${item.images?.length || 0})`}
              </button>
            </div>
          </div>
          {imageTarget === String(item.id) && <div className="rounded-lg bg-gray-50 p-3 space-y-3">
            <p className="font-medium text-sm">Fotografías de esta variante</p>
            <p className="text-xs text-gray-600">
              Selecciona la fotografía principal y organiza el orden; cada variante
              conserva su galería independiente.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...(item.images || [])].sort((a,b) => (a.sort_order - b.sort_order) || (a.id - b.id))
                .map((img, index, ordered) => <div key={img.id}
                  className="bg-white border rounded-lg p-2 space-y-2">
                  <img src={imageUrl(img.url)} alt={img.alt_text || item.label}
                    loading="lazy" className="w-full aspect-square object-contain p-2 rounded bg-gray-50"/>
                  <ProductPhotoQuality src={imageUrl(img.url)}
                    altText={img.alt_text} isPrimary={img.is_primary} compact/>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500">Foto {index + 1} de {ordered.length}</span>
                    <button type="button" disabled={imageBusy || index === 0}
                      className="text-xs text-brand-700 underline" title="Mover fotografía antes"
                      aria-label={`Mover fotografía ${index + 1} de ${item.label} hacia atrás`}
                      onClick={() => reorderVariantPhotos(item.id, ordered, index, -1)}>←</button>
                    <button type="button" disabled={imageBusy || index === ordered.length - 1}
                      className="text-xs text-brand-700 underline" title="Mover fotografía después"
                      aria-label={`Mover fotografía ${index + 1} de ${item.label} hacia adelante`}
                      onClick={() => reorderVariantPhotos(item.id, ordered, index, 1)}>→</button>
                    {img.is_primary ? <span className="text-xs text-green-700">Principal</span> :
                      <button type="button" disabled={imageBusy}
                        onClick={() => updateImage(item.id, img.id, 'primary')}
                        className="text-xs text-brand-700 underline">Hacer principal</button>}
                  </div>
                  <label className="block text-xs text-gray-600">Descripción de fotografía
                    <input type="text" className="input w-full mt-1" maxLength={180}
                      value={imageDescriptions[img.id] ?? img.alt_text ?? ''}
                      onChange={e => setImageDescriptions(current => ({
                        ...current, [img.id]: e.target.value,
                      }))}/>
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" disabled={imageBusy}
                      onClick={() => saveVariantAlt(item.id, img)}
                      className="text-xs text-brand-700 underline">Guardar descripción</button>
                    <button type="button" disabled={imageBusy}
                      onClick={() => {
                        if (window.confirm('¿Eliminar esta fotografía de la variante?')) {
                          updateImage(item.id, img.id, 'delete')
                        }
                      }} className="text-xs text-red-700 underline">Eliminar</button>
                  </div>
                </div>)}
            </div>
            <label className="block text-xs">Cargar y recortar fotografías (JPG, PNG o WebP)
              <input type="file" multiple accept="image/jpeg,image/png,image/webp"
                className="input w-full mt-1"
                onChange={e => { selectVariantImages(e.target.files); e.target.value = '' }}/>
            </label>
            {(imageFiles.length > 0 || cropQueue.length > 0) && <p className="text-xs text-gray-600">
              {imageFiles.length} imágenes listas · {cropQueue.length} pendientes de recortar
            </p>}
            <button type="button"
              disabled={imageBusy || imageFiles.length === 0 || cropQueue.length > 0}
              onClick={() => uploadImages(item.id)} className="btn-primary">
              {imageBusy ? 'Guardando...' : 'Subir fotografías optimizadas'}
            </button>
            <p className="text-xs text-gray-500">Si esta variante no tiene fotos, la tienda utilizará las imágenes generales del producto.</p>
          </div>}
          {stockTarget === String(item.id) && <form className="grid grid-cols-1 sm:grid-cols-3 gap-2" onSubmit={(e) => {
            e.preventDefault()
            replenish.mutate({ product_id: item.id, location_id: Number(stockLocation),
              qty: Number(stockQty), notes: `Reposición variante ${item.sku}` })
          }}>
            <select required className="input" value={stockLocation} onChange={(e) => setStockLocation(e.target.value)}>
              <option value="">Selecciona una sede</option>
              {locations.filter((loc) => loc.active).map((loc) => <option value={loc.id} key={loc.id}>{loc.name}</option>)}
            </select>
            <input required min="1" step="1" className="input" type="number" value={stockQty}
              onChange={(e) => setStockQty(e.target.value)} placeholder="Unidades a ingresar" />
            <button disabled={replenish.isPending || !stockLocation} className="btn-primary" type="submit">Registrar ingreso</button>
          </form>}
        </div>)}
        {!isLoading && variants.length === 0 && <p className="text-sm text-gray-500">Este producto todavía no tiene variantes. Su inventario actual se gestiona como referencia única.</p>}
      </div>
      {cropQueue[0] && <ImageCropModal
        key={cropQueue[0].name + cropQueue[0].lastModified}
        file={cropQueue[0]} ratio={1} width={1800}
        title="Encuadrar fotografía de variante"
        onCancel={() => setCropQueue(current => current.slice(1))}
        onConfirm={cropVariantPhoto}/>}
      <p className="text-xs text-gray-500">Importante: si el producto original aún tiene inventario, primero concilia sus unidades. No se convierten existencias existentes automáticamente.</p>
      </div>
    </div>
  </div>
}
