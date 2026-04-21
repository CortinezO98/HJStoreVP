import { useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingCart,
  ArrowLeft,
  Zap,
  ShieldCheck,
  Truck,
  BadgeCheck,
  Minus,
  Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { productsApi } from '../../services/api'
import { useCartStore } from '../../store'
import ProductCard from '../../components/shop/ProductCard'

const API_URL = import.meta.env.VITE_API_URL || ''

function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))
}

function buildImageUrl(url) {
  if (!url) return null
  return url.startsWith('http') ? url : `${API_URL}${url}`
}

export default function ProductPage() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const addItem = useCartStore((s) => s.addItem)
  const getItemQty = useCartStore((s) => s.getItemQty)
  const syncProduct = useCartStore((s) => s.syncProduct)

  const [qty, setQty] = useState(1)
  const [selectedImage, setSelectedImage] = useState(null)

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product-detail', slug],
    queryFn: async () => {
      const res = await productsApi.get(slug)
      return res.data
    },
    enabled: !!slug,
  })

  const categorySlug = product?.category?.slug || product?.category_slug || ''
  const categoryName = product?.category?.name || product?.category_name || ''

  const { data: relatedProducts = [] } = useQuery({
    queryKey: ['related-products', categorySlug, product?.id],
    queryFn: async () => {
      const res = await productsApi.list({
        category: categorySlug || undefined,
        per_page: 8,
      })
      return Array.isArray(res.data)
        ? res.data.filter((p) => p.id !== product.id).slice(0, 4)
        : []
    },
    enabled: !!product?.id,
  })

  const images = useMemo(() => {
    if (!product) return []

    const productImages = Array.isArray(product.images)
      ? product.images
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((img) => ({
            id: img.id,
            url: buildImageUrl(img.url),
            alt: img.alt_text || product.name,
          }))
      : []

    const fallbackPrimary = product.primary_image
      ? [{ id: 'primary', url: buildImageUrl(product.primary_image), alt: product.name }]
      : []

    return productImages.length ? productImages : fallbackPrimary
  }, [product])

  const mainImage = selectedImage || images[0]?.url || null
  const availableStockRaw = product?.total_stock ?? product?.stock ?? null
  const availableStock =
    availableStockRaw === null || availableStockRaw === undefined
      ? null
      : Number(availableStockRaw)

  const isOutOfStock = availableStock !== null && availableStock <= 0
  const isLowStock = availableStock !== null && availableStock > 0 && availableStock <= 5
  const cartQty = product?.id ? getItemQty(product.id) : 0
  const maxQtyAllowed =
    availableStock === null ? 99 : Math.max(availableStock - cartQty, 0)

  const handleDecrease = () => setQty((prev) => Math.max(1, prev - 1))
  const handleIncrease = () =>
    setQty((prev) => {
      if (maxQtyAllowed <= 0) return prev
      return Math.min(prev + 1, maxQtyAllowed)
    })

  const handleAddToCart = () => {
    if (!product || isOutOfStock) return

    const ok = addItem(product, qty)
    if (!ok) {
      toast.error('No hay suficiente stock disponible')
      return
    }

    syncProduct(product)
    toast.success(`${product.name} agregado al carrito`)
  }

  const handleBuyNow = () => {
    if (!product || isOutOfStock) return

    const ok = addItem(product, qty)
    if (!ok) {
      toast.error('No hay suficiente stock disponible')
      return
    }

    syncProduct(product)
    navigate('/checkout')
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="aspect-square rounded-3xl bg-gray-100" />
          <div className="space-y-4">
            <div className="h-6 w-24 bg-gray-100 rounded" />
            <div className="h-12 w-3/4 bg-gray-100 rounded" />
            <div className="h-8 w-40 bg-gray-100 rounded" />
            <div className="h-24 w-full bg-gray-100 rounded" />
            <div className="h-12 w-full bg-gray-100 rounded" />
            <div className="h-12 w-full bg-gray-100 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500 mb-4">No se encontró el producto.</p>
        <Link to="/catalogo" className="btn-primary">
          Volver al catálogo
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link
        to="/catalogo"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Volver al catálogo
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        <div>
          <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
            <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
              {mainImage ? (
                <img
                  src={mainImage}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-gray-300">Sin imagen</div>
              )}
            </div>
          </div>

          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-3 mt-4">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(img.url)}
                  className={`aspect-square rounded-2xl overflow-hidden border-2 transition ${
                    mainImage === img.url
                      ? 'border-brand-600'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.alt}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {categoryName && (
              <span className="inline-flex items-center rounded-full bg-brand-100 text-brand-700 px-3 py-1 text-xs font-semibold">
                {categoryName}
              </span>
            )}

            {product.featured && (
              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-semibold">
                Destacado
              </span>
            )}

            {isOutOfStock && (
              <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-semibold">
                Agotado
              </span>
            )}

            {isLowStock && !isOutOfStock && (
              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-semibold">
                Últimas unidades
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight">
            {product.name}
          </h1>

          <p className="text-sm text-gray-400 mt-2">SKU: {product.sku}</p>

          <div className="mt-5">
            <div className="flex items-end gap-3">
              <span className="text-3xl md:text-4xl font-black text-brand-700">
                {formatCOP(product.sale_price)}
              </span>
              {product.cost_price && Number(product.sale_price) > Number(product.cost_price) && (
                <span className="text-sm text-gray-400 line-through mb-1">
                  {formatCOP(Number(product.sale_price) * 1.15)}
                </span>
              )}
            </div>

            <p
              className={`mt-2 text-sm font-medium ${
                isOutOfStock
                  ? 'text-red-500'
                  : isLowStock
                  ? 'text-amber-600'
                  : 'text-green-600'
              }`}
            >
              {isOutOfStock
                ? 'Producto agotado'
                : availableStock === null
                ? 'Disponible'
                : isLowStock
                ? `Solo quedan ${availableStock} unidades`
                : `Stock disponible: ${availableStock}`}
            </p>
          </div>

          {product.description && (
            <div className="mt-6 text-gray-600 leading-7">
              {product.description}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-gray-200 p-4 bg-white">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <Truck size={16} className="text-brand-600" />
                Envíos
              </div>
              <p className="text-xs text-gray-500 mt-1">
                A todo Colombia
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4 bg-white">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <ShieldCheck size={16} className="text-brand-600" />
                Pago seguro
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Wompi, PSE y más
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4 bg-white">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <BadgeCheck size={16} className="text-brand-600" />
                Confianza
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Productos originales
              </p>
            </div>
          </div>

          {!isOutOfStock && (
            <>
              <div className="mt-8">
                <p className="text-sm font-semibold text-gray-800 mb-3">Cantidad</p>
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center rounded-2xl border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={handleDecrease}
                      className="w-11 h-11 flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <div className="w-14 text-center font-bold text-gray-900">
                      {qty}
                    </div>
                    <button
                      type="button"
                      onClick={handleIncrease}
                      className="w-11 h-11 flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  {availableStock !== null && (
                    <span className="text-xs text-gray-500">
                      Máx. disponible para agregar: {Math.max(maxQtyAllowed, 0)}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleAddToCart}
                  className="btn-secondary w-full flex items-center justify-center gap-2 py-3"
                >
                  <ShoppingCart size={18} />
                  Agregar al carrito
                </button>

                <button
                  onClick={handleBuyNow}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3"
                >
                  <Zap size={18} />
                  Comprar ahora
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {relatedProducts.length > 0 && (
        <section className="mt-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">También te puede gustar</h2>
            <Link
              to={categorySlug ? `/catalogo?categoria=${categorySlug}` : '/catalogo'}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              Ver más
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {relatedProducts.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}