import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  Tag,
  BadgeDollarSign,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  Star,
  Boxes,
  X,
  SlidersHorizontal,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { categoriesApi, productsApi, apiClient } from '../services/api'
import toast from 'react-hot-toast'
import ProductVariantsManager from '../components/products/ProductVariantsManager'
import ImageCropModal from '../components/products/ImageCropModal'
import ProductPhotoQuality from '../components/products/ProductPhotoQuality'
import AdminTableMessage from '../components/AdminTableMessage'
import { verifyUploadedImage } from '../utils/verifyUploadedImage'

const API_URL = import.meta.env.VITE_API_URL || ''

function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n || 0))
}

function resolveImage(url) {
  if (!url) return null
  return url.startsWith('http') ? url : `${API_URL}${url}`
}

function calcSalePrice(cost, margin) {
  const c = Number(cost || 0)
  const m = Number(margin || 0)
  return c * (1 + m / 100)
}

function ImageAltEditor({ image, productId, onSaved }) {
  const [draft, setDraft] = useState(image.alt_text || '')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    const value = draft.trim()
    if (value.length < 3 || value.length > 180) {
      toast.error('Escribe una descripción entre 3 y 180 caracteres')
      return
    }
    setSaving(true)
    try {
      await apiClient.patch(`/products/${productId}/images/${image.id}/alt`, { alt_text: value })
      toast.success('Descripción de fotografía guardada')
      onSaved()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No se pudo guardar la descripción')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-1">
      <label className="block text-xs text-gray-600" htmlFor={`product-image-alt-${image.id}`}>
        Descripción de la foto
      </label>
      <input id={`product-image-alt-${image.id}`} className="form-control text-xs"
        type="text" maxLength={180} value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Ej. Gorra negra vista frontal"/>
      <button type="button" className="btn btn-outline-secondary btn-sm"
        disabled={saving || draft.trim() === (image.alt_text || '')}
        onClick={save}>{saving ? 'Guardando...' : 'Guardar descripción'}</button>
    </div>
  )
}

function ProductImagesManager({ product, onClose, onUploaded }) {
  const queryClient = useQueryClient()
  const [files, setFiles] = useState([])
  const [cropQueue, setCropQueue] = useState([])
  const [uploading, setUploading] = useState(false)

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['product-images', product.id],
    queryFn: () => apiClient.get(`/products/${product.id}/images`).then((r) => r.data),
    enabled: !!product?.id,
  })

  const prepareFiles = (selected) => {
    const candidates = Array.from(selected || [])
    if (!candidates.length) return
    if (candidates.length + files.length + cropQueue.length > 10) {
      toast.error('Prepara máximo 10 fotografías por lote')
      return
    }
    if (candidates.some((item) => !['image/jpeg', 'image/png', 'image/webp'].includes(item.type))) {
      toast.error('Usa fotografías JPG, PNG o WEBP')
      return
    }
    setCropQueue((current) => [...current, ...candidates])
  }
  const confirmCrop = async (file) => {
    setFiles((current) => [...current, file])
    setCropQueue((current) => current.slice(1))
  }

  const handleUpload = async () => {
    if (!files.length) {
      toast.error('Selecciona al menos una imagen')
      return
    }

    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))

    setUploading(true)
    try {
      const response = await apiClient.post(`/products/${product.id}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      try {
        await Promise.all((response.data || []).map((entry) => verifyUploadedImage(entry.url)))
      } catch (validationError) {
        queryClient.invalidateQueries({ queryKey: ['product-images', product.id] })
        onUploaded?.()
        toast.error(validationError.message)
        setFiles([])
        return
      }
      toast.success('Imágenes subidas y visualización verificada')
      setFiles([])
      queryClient.invalidateQueries({ queryKey: ['product-images', product.id] })
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      onUploaded?.()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Error subiendo imágenes')
    } finally {
      setUploading(false)
    }
  }

  const setPrimary = async (imageId) => {
    try {
      await apiClient.patch(`/products/${product.id}/images/primary`, { image_id: imageId })
      toast.success('Imagen principal actualizada')
      queryClient.invalidateQueries({ queryKey: ['product-images', product.id] })
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      onUploaded?.()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No se pudo actualizar la imagen principal')
    }
  }

  const [reordering, setReordering] = useState(false)
  const moveImage = async (imageId, direction) => {
    if (reordering || uploading) return
    const ordered = [...images].sort((a, b) =>
      (a.sort_order - b.sort_order) || (a.id - b.id))
    const at = ordered.findIndex((image) => image.id === imageId)
    const target = at + direction
    if (at < 0 || target < 0 || target >= ordered.length) return
    ;[ordered[at], ordered[target]] = [ordered[target], ordered[at]]
    setReordering(true)
    try {
      await apiClient.patch(`/products/${product.id}/images/order`, {
        image_ids: ordered.map((image) => image.id),
      })
      queryClient.invalidateQueries({ queryKey: ['product-images', product.id] })
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      onUploaded?.()
      toast.success('Orden de galería actualizado')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No se pudo cambiar el orden')
      queryClient.invalidateQueries({ queryKey: ['product-images', product.id] })
    } finally {
      setReordering(false)
    }
  }

  const deleteImage = async (imageId) => {
    try {
      await apiClient.delete(`/products/${product.id}/images/${imageId}`)
      toast.success('Imagen eliminada')
      queryClient.invalidateQueries({ queryKey: ['product-images', product.id] })
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      onUploaded?.()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No se pudo eliminar la imagen')
    }
  }

  return (
    <div className="admin-catalog-overlay">
      <div className="admin-catalog-modal admin-catalog-modal-wide" role="dialog" aria-modal="true" aria-label="Imágenes del producto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Imágenes del producto</h3>
            <p className="text-sm text-gray-500 mt-1">
              {product.name} · SKU: {product.sku}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cerrar
          </button>
        </div>

        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
            <div className="flex-1">
              <label className="form-label">Seleccionar imágenes</label>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="form-control"
                onChange={(e) => { prepareFiles(e.target.files); e.target.value = '' }}
              />
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading || cropQueue.length > 0 || files.length === 0}
              className="btn-primary flex items-center gap-2"
            >
              {uploading ? 'Subiendo...' : <><ImageIcon size={16} /> Subir imágenes</>}
            </button>
          </div>
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 items-center text-sm text-gray-600">
              <span>{files.length} fotografías encuadradas listas para subir</span>
              <button type="button" className="btn btn-outline-secondary btn-sm"
                onClick={() => setFiles([])} disabled={uploading}>Descartar preparadas</button>
            </div>
          )}
          {cropQueue.length > 0 && <p className="text-sm text-gray-600 mt-2">
            Ajustando fotografía 1 de {cropQueue.length} pendientes.
          </p>}
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-500 mb-4">
            Marca una fotografía como principal para la portada del catálogo y utiliza las flechas
            para establecer la secuencia de la galería en la tienda pública. La primera imagen será la principal.
            Las alertas fotográficas orientan la revisión; no cambian ni eliminan imágenes existentes.
          </p>
          {!isLoading && images.length > 0 && <div className="mb-4 border rounded-lg px-3 py-2 bg-gray-50 text-sm text-gray-700">
            {images.length} fotografía{images.length !== 1 ? 's' : ''} ·
            {images.filter(img => img.is_primary).length === 1
              ? ' Imagen principal configurada' : ' Revisa cuál es la imagen principal'}
          </div>}
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ImageIcon size={40} className="mx-auto mb-3 text-gray-200" />
              No hay imágenes cargadas
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...images].sort((a,b) => (a.sort_order-b.sort_order) || (a.id-b.id)).map((img, imageIndex) => {
                const src = resolveImage(img.url)
                return (
                  <div key={img.id} className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                    <div className="aspect-square bg-gray-50 overflow-hidden">
                      {src ? (
                        <img src={src} alt={img.alt_text || product.name} loading="lazy"
                          className="w-full h-full object-contain p-2" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={24} className="text-gray-300" />
                        </div>
                      )}
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-gray-500">Posición {imageIndex + 1} / {images.length}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" className="btn btn-outline-secondary btn-sm"
                            aria-label={`Mover fotografía ${imageIndex + 1} a la izquierda`}
                            title="Mover antes" disabled={reordering || uploading || imageIndex === 0}
                            onClick={() => moveImage(img.id, -1)}><ChevronLeft size={15}/></button>
                          <button type="button" className="btn btn-outline-secondary btn-sm"
                            aria-label={`Mover fotografía ${imageIndex + 1} a la derecha`}
                            title="Mover después" disabled={reordering || uploading || imageIndex === images.length - 1}
                            onClick={() => moveImage(img.id, 1)}><ChevronRight size={15}/></button>
                        </div>
                      </div>
                      {img.is_primary ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-700">
                          <Star size={12} />
                          Principal
                        </span>
                      ) : (
                        <button
                          onClick={() => setPrimary(img.id)}
                          className="text-xs text-brand-600 hover:text-brand-700 font-semibold"
                        >
                          Marcar como principal
                        </button>
                      )}

                      <ProductPhotoQuality src={src} altText={img.alt_text}
                        isPrimary={img.is_primary} compact />
                      <ImageAltEditor key={`${img.id}-${img.alt_text || ''}`} image={img} productId={product.id}
                        onSaved={() => {
                          queryClient.invalidateQueries({ queryKey: ['product-images', product.id] })
                          onUploaded?.()
                        }}/>
                      <button
                        onClick={() => deleteImage(img.id)}
                        className="text-xs text-red-500 hover:text-red-600 font-semibold block"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {cropQueue[0] && <ImageCropModal key={cropQueue[0].name + cropQueue[0].lastModified}
        file={cropQueue[0]} ratio={1} width={1800}
        title="Encuadrar fotografía del producto"
        onCancel={() => setCropQueue((current) => current.slice(1))}
        onConfirm={confirmCrop}/>}
    </div>
  )
}

function ProductFormModal({ product, categories, onClose }) {
  const isEdit = !!product
  const queryClient = useQueryClient()
  const [showImages, setShowImages] = useState(false)
  const [showVariants, setShowVariants] = useState(false)

  const [form, setForm] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    description: product?.description || '',
    category_id: product?.category_id ? String(product.category_id) : '',
    cost_price: product?.cost_price ?? '',
    margin_pct: product?.margin_pct ?? '',
    stock_min_alert: product?.stock_min_alert ?? 5,
    featured: product?.featured || false,
    active: product?.active ?? true,
  })

  const salePricePreview = useMemo(
    () => calcSalePrice(form.cost_price, form.margin_pct),
    [form.cost_price, form.margin_pct]
  )

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.sku.trim() || form.cost_price === '' || form.margin_pct === '') {
        throw new Error('Completa nombre, SKU, costo y porcentaje de ganancia')
      }
      const cost = Number(form.cost_price)
      const margin = Number(form.margin_pct)
      const alertQty = Number(form.stock_min_alert)
      if (![cost, margin, alertQty].every(Number.isFinite) ||
          cost < 0 || margin < 0 || !Number.isSafeInteger(alertQty) || alertQty < 0) {
        throw new Error('Costo y margen deben ser valores positivos; la alerta debe ser un entero mayor o igual a cero')
      }
      if (!Number.isFinite(salePricePreview) || salePricePreview < 0) {
        throw new Error('El precio de venta calculado no es válido')
      }

      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        description: form.description || null,
        category_id: form.category_id ? Number(form.category_id) : null,
        cost_price: cost,
        margin_pct: margin,
        stock_min_alert: alertQty,
        featured: Boolean(form.featured),
        active: Boolean(form.active),
      }

      if (isEdit) {
        const { data } = await productsApi.update(product.id, payload)
        return data
      }

      const { data } = await productsApi.create(payload)
      return data
    },
    onSuccess: (data) => {
      toast.success(isEdit ? 'Producto actualizado' : 'Producto creado')
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      if (!isEdit) {
        onClose()
      } else {
        if (data?.id) {
          // no-op, backend already refreshed
        }
      }
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || error.message || 'Error guardando el producto')
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      if (!product?.id) return
      await productsApi.delete(product.id)
    },
    onSuccess: () => {
      toast.success('Producto desactivado')
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      onClose()
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || 'No se pudo desactivar el producto')
    },
  })

  return (
    <>
      <div className="admin-catalog-overlay">
        <div className="admin-catalog-modal" role="dialog" aria-modal="true" aria-label={isEdit ? "Editar producto" : "Nuevo producto"}>
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {isEdit ? 'Editar producto' : 'Nuevo producto'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Gestiona costo, margen y precio automático
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cerrar
            </button>
          </div>

          <div className="admin-catalog-form-grid">
            <div className="md:col-span-2">
              <label htmlFor="admin-product-name" className="block text-sm text-gray-600 mb-1">Nombre *</label>
              <input id="admin-product-name" required maxLength={200}
                className="input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Perfume HJ Gold 100ml"
              />
            </div>

            <div>
              <label htmlFor="admin-product-sku" className="block text-sm text-gray-600 mb-1">SKU *</label>
              <input id="admin-product-sku" required maxLength={100}
                className="input"
                value={form.sku}
                onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))}
                placeholder="Ej: PER-001"
              />
            </div>

            <div>
              <label htmlFor="admin-product-category" className="block text-sm text-gray-600 mb-1">Categoría</label>
              <select id="admin-product-category"
                className="input"
                value={form.category_id}
                onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
              >
                <option value="">Sin categoría</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="admin-product-cost" className="block text-sm text-gray-600 mb-1">Costo del producto *</label>
              <input id="admin-product-cost" required step="0.01"
                type="number"
                min="0"
                className="input"
                value={form.cost_price}
                onChange={(e) => setForm((p) => ({ ...p, cost_price: e.target.value }))}
                placeholder="Ej: 50000"
              />
            </div>

            <div>
              <label htmlFor="admin-product-margin" className="block text-sm text-gray-600 mb-1">% de ganancia *</label>
              <input id="admin-product-margin" required step="0.01"
                type="number"
                min="0"
                className="input"
                value={form.margin_pct}
                onChange={(e) => setForm((p) => ({ ...p, margin_pct: e.target.value }))}
                placeholder="Ej: 50"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Precio de venta calculado</label>
              <div className="admin-catalog-price-preview">
                {Number.isFinite(salePricePreview) && salePricePreview >= 0
                  ? formatCOP(salePricePreview)
                  : 'Revisa el costo y margen'}
              </div>
            </div>

            <div>
              <label htmlFor="admin-product-stock-alert" className="block text-sm text-gray-600 mb-1">Alerta mínima de stock</label>
              <input id="admin-product-stock-alert" step="1"
                type="number"
                min="0"
                className="input"
                value={form.stock_min_alert}
                onChange={(e) => setForm((p) => ({ ...p, stock_min_alert: e.target.value }))}
                placeholder="Ej: 5"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="admin-product-description" className="block text-sm text-gray-600 mb-1">Descripción</label>
              <textarea id="admin-product-description"
                className="form-control min-h-[110px]"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Describe el producto..."
              />
            </div>

            <div className="flex items-center gap-6 md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm((p) => ({ ...p, featured: e.target.checked }))}
                />
                Destacado
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                />
                Activo
              </label>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex gap-3">
              {isEdit && (
                <>
                  <button
                    onClick={() => setShowVariants(true)}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Boxes size={16} />
                    Gestionar variantes
                  </button>

                  <button
                    onClick={() => setShowImages(true)}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <ImageIcon size={16} />
                    Gestionar imágenes
                  </button>

                  <button
                    onClick={() => { if (window.confirm(`¿Desactivar el producto "${product.name}"? No aparecerá en el catálogo público.`)) deactivateMutation.mutate() }}
                    disabled={deactivateMutation.isPending}
                    className="btn-secondary flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                    Desactivar
                  </button>
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="btn-primary flex items-center gap-2"
              >
                {mutation.isPending ? 'Guardando...' : <><CheckCircle size={16} /> Guardar producto</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showVariants && isEdit && (
        <ProductVariantsManager
          product={product}
          onClose={() => setShowVariants(false)}
        />
      )}

      {showImages && isEdit && (
        <ProductImagesManager
          product={product}
          onClose={() => setShowImages(false)}
          onUploaded={() => {
            // no-op, product list refresh handled by query invalidation
          }}
        />
      )}
    </>
  )
}

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [featuredFilter, setFeaturedFilter] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(15)
  const [sortBy, setSortBy] = useState('name')

  const { data: categories = [] } = useQuery({
    queryKey: ['admin-categories-products'],
    queryFn: () => categoriesApi.list().then((r) => r.data),
  })

  const { data: products = [], isLoading, isError: listError, refetch: retryList } = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      // El backend permite un máximo de 100 productos por solicitud.
      // Recuperar todas las páginas evita truncar el catálogo administrativo.
      const pageSize = 100
      const allProducts = []
      let page = 1

      while (true) {
        const { data } = await productsApi.list({
          include_inactive: true,
          page,
          per_page: pageSize,
        })
        allProducts.push(...data)
        if (data.length < pageSize) break
        page += 1
      }

      return allProducts
    },
  })

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const term = search.trim().toLowerCase()
      const matchesSearch = !term
        ? true
        : `${p.name} ${p.sku} ${p.category_name || ''}`.toLowerCase().includes(term)

      const matchesCategory = categoryFilter
        ? String(p.category_id || '') === String(categoryFilter)
        : true

      const matchesStatus =
        statusFilter === ''
          ? true
          : statusFilter === 'active'
          ? Boolean(p.active)
          : !Boolean(p.active)

      const matchesFeatured =
        featuredFilter === ''
          ? true
          : featuredFilter === 'featured'
          ? Boolean(p.featured)
          : !Boolean(p.featured)

      return matchesSearch && matchesCategory && matchesStatus && matchesFeatured
    })
  }, [products, search, categoryFilter, statusFilter, featuredFilter])

  // Paginación sobre la lista completa consultada, sin cambiar el contrato API.
  const sortedProducts = useMemo(() => [...filteredProducts].sort((a, b) => {
    if (sortBy === 'price_asc') return Number(a.sale_price || 0) - Number(b.sale_price || 0)
    if (sortBy === 'price_desc') return Number(b.sale_price || 0) - Number(a.sale_price || 0)
    if (sortBy === 'sku') return String(a.sku || '').localeCompare(String(b.sku || ''), 'es')
    return String(a.name || '').localeCompare(String(b.name || ''), 'es')
  }), [filteredProducts, sortBy])
  const pageCount = Math.max(1, Math.ceil(sortedProducts.length / perPage))
  const currentPage = Math.min(page, pageCount)
  const pageProducts = sortedProducts.slice((currentPage - 1) * perPage, currentPage * perPage)
  const resetFilters = () => {
    setSearch('')
    setCategoryFilter('')
    setStatusFilter('')
    setFeaturedFilter('')
    setSortBy('name')
    setPage(1)
  }
  const filtersActive = Boolean(search || categoryFilter || statusFilter || featuredFilter || sortBy !== 'name')
  
  const stats = useMemo(() => {
    const active = products.filter((p) => p.active).length
    const inactive = products.filter((p) => !p.active).length
    const featured = products.filter((p) => p.featured).length
    return {
      total: products.length,
      active,
      inactive,
      featured,
    }
  }, [products])

  return (
    <div className="admin-catalog-page space-y-6">
      <div className="admin-page-intro flex-wrap">
        <div>
          <p className="admin-page-kicker">Gestión del catálogo</p>
          <h1 className="admin-page-heading">Productos</h1>
          <p className="admin-page-description">Administra precios, variantes, imágenes y visibilidad de tus referencias desde un solo lugar.</p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="btn btn-primary d-inline-flex align-items-center gap-2"
        >
          <Plus size={16} />
          Nuevo producto
        </button>
      </div>

      {/* Estado del catálogo: tarjetas Bootstrap responsivas. */}
      <div className="row g-3" aria-label="Resumen de productos">
        {[
          { label: 'Total productos', value: stats.total },
          { label: 'Activos', value: stats.active },
          { label: 'Inactivos', value: stats.inactive },
          { label: 'Destacados', value: stats.featured },
        ].map(item => <div className="col-12 col-sm-6 col-xl-3" key={item.label}>
          <div className="admin-catalog-stat">
            <span>{item.label}</span><strong>{item.value.toLocaleString('es-CO')}</strong>
          </div>
        </div>)}
      </div>

      {/* Búsqueda, filtros y ordenación sin modificar las consultas existentes. */}
      <section className="admin-catalog-filter card" aria-label="Filtros de productos">
        <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
          <h2 className="h6 fw-bold mb-0 d-inline-flex align-items-center gap-2">
            <SlidersHorizontal size={18}/> Buscar y filtrar
          </h2>
          <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2"
            disabled={!filtersActive} onClick={resetFilters}><RotateCcw size={14}/> Limpiar</button>
        </div>
        <div className="row g-3">
          <div className="col-12 col-lg-5">
            <label className="form-label" htmlFor="products-search">Buscar producto</label>
            <div className="admin-catalog-search"><Search size={17} aria-hidden="true"/>
              <input id="products-search" type="search" className="form-control"
                placeholder="Nombre, SKU o categoría" value={search}
                onChange={event => { setSearch(event.target.value); setPage(1) }}/>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="products-category">Categoría</label>
            <select id="products-category" className="form-select" value={categoryFilter}
              onChange={event => { setCategoryFilter(event.target.value); setPage(1) }}>
              <option value="">Todas las categorías</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </div>
          <div className="col-6 col-lg-2">
            <label className="form-label" htmlFor="products-status">Estado</label>
            <select id="products-status" className="form-select" value={statusFilter}
              onChange={event => { setStatusFilter(event.target.value); setPage(1) }}>
              <option value="">Todos</option><option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
          <div className="col-6 col-lg-2">
            <label className="form-label" htmlFor="products-featured">Destacados</label>
            <select id="products-featured" className="form-select" value={featuredFilter}
              onChange={event => { setFeaturedFilter(event.target.value); setPage(1) }}>
              <option value="">Todos</option><option value="featured">Sí</option><option value="normal">No</option>
            </select>
          </div>
          <div className="col-12 col-sm-6 col-lg-4">
            <label className="form-label" htmlFor="products-sort">Ordenar por</label>
            <select id="products-sort" className="form-select" value={sortBy}
              onChange={event => { setSortBy(event.target.value); setPage(1) }}>
              <option value="name">Nombre (A–Z)</option>
              <option value="sku">Código SKU</option>
              <option value="price_asc">Precio: menor a mayor</option>
              <option value="price_desc">Precio: mayor a menor</option>
            </select>
          </div>
        </div>
      </section>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <h2 className="font-bold text-gray-900">Listado de productos</h2>
          <p className="text-xs text-gray-500 mt-1">
            {filteredProducts.length} productos encontrados
          </p>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle admin-catalog-table mb-0">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Producto</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Categoría</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Costo</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">% ganancia</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Precio venta</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Alerta</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Estado</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Destacado</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : listError ? (
                <AdminTableMessage columns={9} error onRetry={() => retryList()}/>
              ) : filteredProducts.length === 0 ? (
                <AdminTableMessage columns={9} emptyTitle="No hay productos para este filtro"/>
              ) : (
                pageProducts.map((product) => {
                  const image = resolveImage(product.primary_image)

                  return (
                    <tr
                      key={product.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                            {image ? (
                              <img src={image} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package size={18} className="text-gray-300" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 line-clamp-1">{product.name}</p>
                            <p className="text-xs text-gray-500 mt-1">SKU: {product.sku}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {product.category_name || 'Sin categoría'}
                      </td>

                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {product.cost_price !== undefined ? formatCOP(product.cost_price) : '—'}
                      </td>

                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {product.margin_pct !== undefined ? `${product.margin_pct}%` : '—'}
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-brand-700">
                        {formatCOP(product.sale_price)}
                      </td>

                      <td className="px-4 py-3 text-center text-gray-700">
                        {product.stock_min_alert ?? '—'}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {product.active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            <CheckCircle size={12} />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                            <XCircle size={12} />
                            Inactivo
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {product.featured ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-700">
                            <Star size={12} />
                            Sí
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">No</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedProduct(product)}
                          className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2"
                          aria-label={`Editar producto ${product.name}`}
                        >
                          <Pencil size={13} />
                          Editar
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-catalog-pagination">
        <span className="text-secondary small">
          {sortedProducts.length === 0 ? 'Sin resultados' : `Mostrando ${(currentPage - 1) * perPage + 1}–${Math.min(currentPage * perPage, sortedProducts.length)} de ${sortedProducts.length}`}
        </span>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <label className="small text-secondary" htmlFor="products-per-page">Por página</label>
          <select id="products-per-page" value={perPage} className="form-select form-select-sm admin-catalog-per-page"
            onChange={event => { setPerPage(Number(event.target.value)); setPage(1) }}>
            {[10, 15, 25, 50].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={currentPage === 1}
            onClick={() => setPage(previous => Math.max(1, previous - 1))} aria-label="Página anterior">
            <ChevronLeft size={17}/>
          </button>
          <span className="small fw-semibold">{currentPage} / {pageCount}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" disabled={currentPage >= pageCount}
            onClick={() => setPage(previous => Math.min(pageCount, previous + 1))} aria-label="Página siguiente">
            <ChevronRight size={17}/>
          </button>
        </div>
      </div>

      {showCreate && (
        <ProductFormModal
          categories={categories}
          onClose={() => setShowCreate(false)}
        />
      )}

      {selectedProduct && (
        <ProductFormModal
          product={selectedProduct}
          categories={categories}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  )
}