import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingCart,
  ArrowLeft,
  Zap,
  ShieldCheck,
  Truck,
  BadgeCheck,
  Heart,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { productsApi } from '../../services/api'
import { useCartStore, useWishlistStore } from '../../store'
import ProductCard from '../../components/shop/ProductCard'
import { ErrorState, QuantityStepper } from '../../components/shop/StoreUI'

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
  const toggleFavorite = useWishlistStore((s) => s.toggle)
  const favorites = useWishlistStore((s) => s.items)
  const getItemQty = useCartStore((s) => s.getItemQty)
  const syncProduct = useCartStore((s) => s.syncProduct)

  const [qty, setQty] = useState(1)
  const [selectedImage, setSelectedImage] = useState(null)

  const { data: product, isLoading, isError, refetch } = useQuery({
    queryKey: ['product-detail', slug],
    queryFn: async () => {
      const res = await productsApi.get(slug)
      return res.data
    },
    enabled: !!slug,
  })

  useEffect(() => {
    if (!product) return undefined
    document.title = `${product.name} | HJStoreVP`
    const description = document.querySelector('meta[name="description"]')
    const previous = description?.getAttribute('content')
    const excerpt = String(product.description || `Compra ${product.name} en HJStoreVP.`)
      .replace(/\s+/g, ' ').slice(0, 155)
    description?.setAttribute('content', excerpt)
    return () => {
      if (previous !== null && previous !== undefined) {
        description?.setAttribute('content', previous)
      }
    }
  }, [product])

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
      ? [...product.images]
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((img) => ({
            id: img.id,
            url: buildImageUrl(img.url),
            alt: img.alt_text || product.name,
          }))
      : []

    const fallbackPrimary = product.primary_image
      ? [
          {
            id: 'primary',
            url: buildImageUrl(product.primary_image),
            alt: product.name,
          },
        ]
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
    if (!product || isOutOfStock || qty > maxQtyAllowed) { toast.error('Revisa la cantidad disponible'); return }

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
      <div className="store-container store-section">
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
      <div className="store-container store-section">
        <ErrorState
          title={isError ? 'No pudimos cargar el producto' : 'Producto no encontrado'}
          description={isError ? 'Comprueba tu conexión e inténtalo nuevamente.' : 'Es posible que este artículo ya no esté disponible.'}
          onRetry={isError ? () => refetch() : undefined}
        />
        <div className="text-center mt-6">
          <Link to="/catalogo" className="store-inline-link">VOLVER AL CATÁLOGO</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="store-container store-section">
      <Link
        to="/catalogo"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Volver al catálogo
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">
        <div>
          <div className="bg-neutral-50 overflow-hidden">
            <div className="aspect-square bg-neutral-50 flex items-center justify-center overflow-hidden">
              {mainImage ? (
                <img
                  src={mainImage}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-gray-300">Sin imagen</div>
              )}
            </div>
          </div>

          {images.length > 1 && (
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 sm:gap-3 mt-4">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  aria-label={`Ver imagen de ${product.name}`}
                  aria-pressed={mainImage === img.url}
                  onClick={() => setSelectedImage(img.url)}
                  className={`aspect-square overflow-hidden border-2 transition ${
                    mainImage === img.url
                      ? 'border-black'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.alt}
                    className="w-full h-full object-contain"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {categoryName && (
              <span className="inline-flex items-center bg-neutral-100 text-neutral-800 px-3 py-1 text-xs font-bold uppercase tracking-widest">
                {categoryName}
              </span>
            )}

            {product.featured && (
              <span className="inline-flex items-center bg-neutral-100 text-neutral-800 px-3 py-1 text-xs font-bold uppercase tracking-widest">
                Destacado
              </span>
            )}

            {isOutOfStock && (
              <span className="inline-flex items-center bg-red-100 text-red-700 px-3 py-1 text-xs font-bold uppercase tracking-widest">
                Agotado
              </span>
            )}

            {isLowStock && !isOutOfStock && (
              <span className="inline-flex items-center bg-neutral-100 text-neutral-800 px-3 py-1 text-xs font-bold uppercase tracking-widest">
                Últimas unidades
              </span>
            )}
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-neutral-950 leading-tight tracking-tight uppercase">
            {product.name}
          </h1>

          <p className="text-sm text-gray-400 mt-2">SKU: {product.sku}</p>
          <button type="button" onClick={() => toggleFavorite(product)}
            className="mt-3 inline-flex items-center gap-2 border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
            aria-pressed={favorites.some((item) => item.id === product.id)}>
            <Heart size={17} fill={favorites.some((item) => item.id === product.id) ? 'currentColor' : 'none'} />
            {favorites.some((item) => item.id === product.id) ? 'Guardado en favoritos' : 'Guardar en favoritos'}
          </button>

          <div className="mt-5">
            <div className="flex items-end gap-3">
              <span className="text-3xl md:text-4xl font-black text-neutral-950">
                {formatCOP(product.sale_price)}
              </span>

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

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="border border-neutral-200 p-4 bg-white">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <Truck size={16} className="text-neutral-900" />
                Envíos
              </div>
              <p className="text-xs text-gray-500 mt-1">
                A todo Colombia
              </p>
            </div>

            <div className="border border-neutral-200 p-4 bg-white">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <ShieldCheck size={16} className="text-neutral-900" />
                Pago seguro
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Wompi, PSE y más
              </p>
            </div>

            <div className="border border-neutral-200 p-4 bg-white">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <BadgeCheck size={16} className="text-neutral-900" />
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
                <p className="store-label">Cantidad</p>
                <div className="flex items-center gap-3">
                  <QuantityStepper value={qty}
                    onChange={(next) => setQty(Math.max(1, Math.min(next, Math.max(1, Math.min(99, maxQtyAllowed)))))}
                    min={1} max={Math.max(1, Math.min(99, maxQtyAllowed))}
                    label={`Cantidad de ${product.name}`} />

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
                  type="button"
                  disabled={maxQtyAllowed <= 0}
                  className="store-button store-button-outline w-full"
                >
                  <ShoppingCart size={18} />
                  Agregar al carrito
                </button>

                <button
                  onClick={handleBuyNow}
                  type="button"
                  disabled={maxQtyAllowed <= 0}
                  className="store-button store-button-dark w-full"
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
        <section className="mt-16 sm:mt-24">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl uppercase font-black text-black">
              También te puede gustar
            </h2>
            <Link
              to={categorySlug ? `/catalogo?categoria=${categorySlug}` : '/catalogo'}
              className="store-inline-link"
            >
              Ver más
            </Link>
          </div>

          <div className="editorial-product-grid">
            {relatedProducts.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}