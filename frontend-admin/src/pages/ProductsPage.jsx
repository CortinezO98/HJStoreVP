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
} from 'lucide-react'
import { categoriesApi, productsApi, apiClient } from '../services/api'
import toast from 'react-hot-toast'

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

function ProductImagesManager({ product, onClose, onUploaded }) {
  const queryClient = useQueryClient()
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['product-images', product.id],
    queryFn: () => apiClient.get(`/products/${product.id}/images`).then((r) => r.data),
    enabled: !!product?.id,
  })

  const handleUpload = async () => {
    if (!files.length) {
      toast.error('Selecciona al menos una imagen')
      return
    }

    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))

    setUploading(true)
    try {
      await apiClient.post(`/products/${product.id}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      toast.success('Imágenes subidas correctamente')
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden">
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
              <label className="block text-sm text-gray-600 mb-1">Seleccionar imágenes</label>
              <input
                type="file"
                multiple
                accept="image/*"
                className="input"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading}
              className="btn-primary flex items-center gap-2"
            >
              {uploading ? 'Subiendo...' : <><ImageIcon size={16} /> Subir imágenes</>}
            </button>
          </div>
        </div>

        <div className="p-6">
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
              {images.map((img) => {
                const src = resolveImage(img.url)
                return (
                  <div key={img.id} className="border border-gray-100 rounded-xl overflow-hidden bg-white">
                    <div className="aspect-square bg-gray-50 overflow-hidden">
                      {src ? (
                        <img src={src} alt={img.alt_text || product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={24} className="text-gray-300" />
                        </div>
                      )}
                    </div>

                    <div className="p-3 space-y-2">
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
    </div>
  )
}

function ProductFormModal({ product, categories, onClose }) {
  const isEdit = !!product
  const queryClient = useQueryClient()
  const [showImages, setShowImages] = useState(false)

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
      if (!form.name || !form.sku || form.cost_price === '' || form.margin_pct === '') {
        throw new Error('Completa los campos obligatorios')
      }

      const payload = {
        name: form.name,
        sku: form.sku,
        description: form.description || null,
        category_id: form.category_id ? Number(form.category_id) : null,
        cost_price: Number(form.cost_price),
        margin_pct: Number(form.margin_pct),
        stock_min_alert: Number(form.stock_min_alert || 5),
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
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden">
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

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Nombre *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Perfume HJ Gold 100ml"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">SKU *</label>
              <input
                className="input"
                value={form.sku}
                onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))}
                placeholder="Ej: PER-001"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Categoría</label>
              <select
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
              <label className="block text-sm text-gray-600 mb-1">Costo del producto *</label>
              <input
                type="number"
                min="0"
                className="input"
                value={form.cost_price}
                onChange={(e) => setForm((p) => ({ ...p, cost_price: e.target.value }))}
                placeholder="Ej: 50000"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">% de ganancia *</label>
              <input
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
              <div className="input bg-gray-50 font-bold text-brand-700">
                {formatCOP(salePricePreview)}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Alerta mínima de stock</label>
              <input
                type="number"
                min="0"
                className="input"
                value={form.stock_min_alert}
                onChange={(e) => setForm((p) => ({ ...p, stock_min_alert: e.target.value }))}
                placeholder="Ej: 5"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Descripción</label>
              <textarea
                className="input min-h-[110px]"
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
                    onClick={() => setShowImages(true)}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <ImageIcon size={16} />
                    Gestionar imágenes
                  </button>

                  <button
                    onClick={() => deactivateMutation.mutate()}
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

  const { data: categories = [] } = useQuery({
    queryKey: ['admin-categories-products'],
    queryFn: () => categoriesApi.list().then((r) => r.data),
  })

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () =>
      productsApi
        .list({ include_inactive: true, per_page: 200 })
        .then((r) => r.data),
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
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Costo, margen, precio automático, categoría e imágenes
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          Nuevo producto
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">Total productos</p>
          <p className="text-2xl font-black text-gray-900 mt-2">{stats.total}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Activos</p>
          <p className="text-2xl font-black text-green-700 mt-2">{stats.active}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Inactivos</p>
          <p className="text-2xl font-black text-red-600 mt-2">{stats.inactive}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Destacados</p>
          <p className="text-2xl font-black text-brand-700 mt-2">{stats.featured}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por nombre, SKU o categoría..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>

          <select
            className="input"
            value={featuredFilter}
            onChange={(e) => setFeaturedFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="featured">Destacados</option>
            <option value="normal">No destacados</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Listado de productos</h2>
          <p className="text-xs text-gray-500 mt-1">
            {filteredProducts.length} productos encontrados
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
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
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <Boxes size={40} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-gray-400 text-sm">No hay productos para este filtro</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
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
                          className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 text-xs font-semibold"
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