import { formatCOP } from '../../utils/currency'
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
  Share2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { productsApi, recommendationsApi } from '../../services/api'
import { useCartStore, useWishlistStore, useBrowsingStore } from '../../store'
import ProductCard from '../../components/shop/ProductCard'
import ProductImage from '../../components/shop/ProductImage'
import useAutoCarousel from '../../hooks/useAutoCarousel'
import { ErrorState, QuantityStepper } from '../../components/shop/StoreUI'
import { updateMeta, updateCanonical, updateStructuredData } from '../../components/shop/StoreMetadata'

const API_URL = import.meta.env.VITE_API_URL || ''



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
  const recordView = useBrowsingStore((s) => s.recordView)

  const [qty, setQty] = useState(1)
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [failedImages, setFailedImages] = useState([])

  const { data: product, isLoading, isError, refetch } = useQuery({
    queryKey: ['product-detail', slug],
    queryFn: async () => {
      const res = await productsApi.get(slug)
      return res.data
    },
    enabled: !!slug,
  })

  useEffect(() => {
    if (!product) return
    const canonical = `${window.location.origin}/producto/${encodeURIComponent(product.slug)}`
    const description = String(product.description || `Compra ${product.name} en HJStoreVP.`)
      .replace(/\s+/g, ' ').slice(0, 155)
    const title = `${product.name} | HJStoreVP`
    document.title = title
    updateMeta('name', 'description', description)
    updateMeta('name', 'robots', 'index,follow')
    updateMeta('property', 'og:type', 'product')
    updateMeta('property', 'og:title', title)
    updateMeta('property', 'og:description', description)
    updateMeta('property', 'og:url', canonical)
    updateMeta('name', 'twitter:title', title)
    updateMeta('name', 'twitter:description', description)
    const photo = product.primary_image
      ? buildImageUrl(product.primary_image)
      : null
    if (photo) updateMeta('property', 'og:image', photo)
    updateCanonical(canonical)
    const inStock = Number(product.total_stock || 0) > 0
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name, description, sku: product.sku, url: canonical,
      ...(photo ? { image: [photo] } : {}),
      offers: {
        '@type': 'Offer', priceCurrency: 'COP',
        price: Number(product.sale_price || 0).toFixed(2),
        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: canonical,
      },
    }
    updateStructuredData(data)
    return () => updateStructuredData(null)
  }, [product])

  useEffect(() => {
    if (product?.id) recordView(product)
  }, [product?.id, product?.slug, recordView])

  const categorySlug = product?.category?.slug || product?.category_slug || ''
  const categoryName = product?.category?.name || product?.category_name || ''

  const { data: relatedProducts = [] } = useQuery({
    queryKey: ['commercial-recommendations-product', product?.id],
    queryFn: () => recommendationsApi.product(product.id).then((response) => response.data),
    enabled: !!product?.id,
  })

  const selectedVariant = (product?.variants || []).find(
    (variant) => String(variant.id) === selectedVariantId
  )

  const images = useMemo(() => {
    if (!product) return []

    const productImages = Array.isArray(product.images)
      ? [...product.images]
          .sort((a, b) =>
            (Number(b.is_primary) - Number(a.is_primary)) ||
            (Number(a.sort_order || 0) - Number(b.sort_order || 0)) ||
            (Number(a.id || 0) - Number(b.id || 0))
          )
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

    const variantImages = Array.isArray(selectedVariant?.images)
      ? [...selectedVariant.images].sort((a,b) =>
          (Number(b.is_primary) - Number(a.is_primary)) ||
          (Number(a.sort_order || 0) - Number(b.sort_order || 0)) ||
          (Number(a.id || 0) - Number(b.id || 0))
        ).map((img) => ({
          id: `variant-${img.id}`,
          url: buildImageUrl(img.url),
          alt: img.alt_text || selectedVariant.label || product.name,
        }))
      : []
    return variantImages.length ? variantImages : productImages.length ? productImages : fallbackPrimary
  }, [product, selectedVariant])

  // Omit broken/deleted assets in the gallery without editing catalog data.
  const usableImages = useMemo(() => images.filter(img => img.url &&
    !failedImages.includes(img.url)), [images, failedImages])
  const productCarousel = useAutoCarousel(
    usableImages.length, 5000, `${slug}:${selectedVariantId}`, false
  )
  const mainImage = usableImages[productCarousel.index]?.url || null

  const hasVariants = Boolean(product?.has_variants)
  const sellableProduct = hasVariants
    ? selectedVariant
      ? {
          ...product,
          id: selectedVariant.id,
          name: `${product.name} — ${selectedVariant.label}`,
          sku: selectedVariant.sku,
          slug: product.slug,
          sale_price: selectedVariant.sale_price,
          total_stock: selectedVariant.total_stock,
          primary_image: selectedVariant.primary_image || product.primary_image,
        }
      : null
    : product

  const availableStockRaw = hasVariants && !selectedVariant
    ? product?.total_stock ?? 0
    : sellableProduct?.total_stock ?? sellableProduct?.stock ?? null
  const availableStock =
    availableStockRaw === null || availableStockRaw === undefined
      ? null
      : Number(availableStockRaw)

  const isOutOfStock = availableStock !== null && availableStock <= 0
  const isLowStock = availableStock !== null && availableStock > 0 && availableStock <= 5
  const cartQty = sellableProduct?.id ? getItemQty(sellableProduct.id) : 0
  const maxQtyAllowed = hasVariants && !selectedVariant
    ? 0
    : availableStock === null ? 99 : Math.max(availableStock - cartQty, 0)

  const shareProduct = async () => {
    const link = `${window.location.origin}/share/product/${encodeURIComponent(product.slug)}`
    const data = { title: product.name, text: `Mira ${product.name} en HJStoreVP`, url: link }
    try {
      if (navigator.share) {
        await navigator.share(data)
      } else {
        await navigator.clipboard.writeText(link)
        toast.success('Enlace del producto copiado')
      }
    } catch (error) {
      if (error.name !== 'AbortError') toast.error('No se pudo compartir este producto')
    }
  }

  const handleDecrease = () => setQty((prev) => Math.max(1, prev - 1))

  const handleIncrease = () =>
    setQty((prev) => {
      if (maxQtyAllowed <= 0) return prev
      return Math.min(prev + 1, maxQtyAllowed)
    })

  const handleAddToCart = () => {
    if (!sellableProduct || isOutOfStock || qty > maxQtyAllowed) { toast.error('Selecciona una variante disponible y revisa la cantidad'); return }

    const ok = addItem(sellableProduct, qty)
    if (!ok) {
      toast.error('No hay suficiente stock disponible')
      return
    }

    syncProduct(sellableProduct)
    toast.success(`${sellableProduct.name} agregado al carrito`)
  }

  const handleBuyNow = () => {
    if (!sellableProduct || isOutOfStock) { toast.error('Selecciona una variante disponible'); return }

    if (qty > maxQtyAllowed) { toast.error('No hay unidades suficientes'); return }
    const ok = addItem(sellableProduct, qty)
    if (!ok) {
      toast.error('No hay suficiente stock disponible')
      return
    }

    syncProduct(sellableProduct)
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
      <nav className="store-purchase-journey" aria-label="Ubicación en la tienda">
        <Link to="/">Inicio</Link><span aria-hidden="true">/</span>
        <Link to="/catalogo">Catálogo</Link>
        {categorySlug && <>
          <span aria-hidden="true">/</span>
          <Link to={`/catalogo?categoria=${encodeURIComponent(categorySlug)}`}>{categoryName}</Link>
        </>}
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="truncate max-w-44 sm:max-w-72">{product.name}</span>
      </nav>
      <Link
        to="/catalogo"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Volver al catálogo
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start store-product-layout">
        <div className="store-product-gallery"
          onMouseEnter={() => productCarousel.setPaused(true)}
          onMouseLeave={() => productCarousel.setPaused(false)}
          onFocusCapture={() => productCarousel.setPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) productCarousel.setPaused(false)
          }}>
          <div className="bg-neutral-50 overflow-hidden store-product-main-image">
            <div className="aspect-square bg-neutral-50 flex items-center justify-center overflow-hidden">
              <ProductImage key={mainImage || 'no-photo'} src={mainImage}
                alt={usableImages[productCarousel.index]?.alt || product.name}
                category={categoryName} className="w-full h-full object-contain"
                loading="eager" fetchPriority="high"
                onError={() => setFailedImages(current => current.includes(mainImage)
                  ? current : [...current, mainImage])}/>
            </div>
            {usableImages.length > 1 && (
              <>
                <button type="button" className="store-product-gallery-prev"
                  aria-label="Fotografía anterior" onClick={() => productCarousel.goTo(productCarousel.index - 1)}>
                  <ChevronLeft size={22} />
                </button>
                <button type="button" className="store-product-gallery-next"
                  aria-label="Fotografía siguiente" onClick={() => productCarousel.goTo(productCarousel.index + 1)}>
                  <ChevronRight size={22} />
                </button>
                <span className="store-product-gallery-count" aria-live="off">
                  {productCarousel.index + 1} / {usableImages.length}
                </span>
              </>
            )}
          </div>
          {usableImages.length > 1 && (
            <div className="store-product-gallery-thumbnails" role="group" aria-label="Elegir fotografía del producto">
              {usableImages.map((img, index) => (
                <button key={img.id ?? `${img.url}-${index}`} type="button"
                  aria-label={`Ver fotografía ${index + 1} de ${product.name}`}
                  aria-pressed={productCarousel.index === index}
                  onClick={() => productCarousel.goTo(index)}
                  className={`store-product-gallery-thumb ${productCarousel.index === index ? 'is-active' : ''}`}>
                  <img src={img.url} alt="" loading="lazy" decoding="async" fetchPriority="low"
                    onError={() => setFailedImages(current => current.includes(img.url)
                      ? current : [...current, img.url])}/>
                </button>
              ))}
            </div>
          )}
          {usableImages.length > 1 && (
            <p className="store-product-gallery-hint">Elige una fotografía con las miniaturas o las flechas. Las imágenes no cambian solas.</p>
          )}
        </div>

        <div className="store-product-purchase-panel">
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

          <p className="text-sm text-gray-400 mt-2">SKU: {selectedVariant?.sku || product.sku}</p>
          {hasVariants && (
            <div className="mt-5 space-y-2 store-variant-picker">
              <label className="block text-sm font-semibold" htmlFor="variant-choice">Selecciona presentación, talla o color <span className="text-red-700">*</span></label>
              <select id="variant-choice" className="input w-full" required
                aria-describedby="variant-choice-help"
                value={selectedVariantId}
                onChange={(e) => { setSelectedVariantId(e.target.value); setQty(1) }}>
                <option value="">Selecciona una opción</option>
                {(product.variants || []).map((variant) => (
                  <option key={variant.id} value={variant.id} disabled={!variant.total_stock}>
                    {variant.label} · {formatCOP(variant.sale_price)}{variant.total_stock ? '' : ' · Agotado'}
                  </option>
                ))}
              </select>
              <p id="variant-choice-help" className="text-sm text-gray-500" role="status">
                {selectedVariant
                  ? `Seleccionado: ${selectedVariant.label}. Disponibles: ${selectedVariant.total_stock ?? 0}.`
                  : 'Elige una referencia disponible antes de agregar el producto al carrito.'}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center">
          <button type="button" onClick={shareProduct}
            className="mt-3 inline-flex items-center gap-2 border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50">
            <Share2 size={17}/> Compartir producto
          </button>
          <button type="button" onClick={() => toggleFavorite(product)}
            className="mt-3 inline-flex items-center gap-2 border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
            aria-pressed={favorites.some((item) => item.id === product.id)}>
            <Heart size={17} fill={favorites.some((item) => item.id === product.id) ? 'currentColor' : 'none'} />
            {favorites.some((item) => item.id === product.id) ? 'Guardado en favoritos' : 'Guardar en favoritos'}
          </button>
          </div>

          <div className="mt-5">
            <div className="flex items-end gap-3">
              <span className="text-3xl md:text-4xl font-black text-neutral-950">
                {formatCOP(selectedVariant?.sale_price ?? product.sale_price)}
              </span>

            </div>

            <p role="status" aria-live="polite"
              className={`mt-2 text-sm font-medium ${
                isOutOfStock
                  ? 'text-red-500'
                  : isLowStock
                  ? 'text-amber-600'
                  : 'text-green-600'
              }`}
            >
              {hasVariants && !selectedVariant ? 'Selecciona una referencia'
                : isOutOfStock
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
                Verifica los medios habilitados al pagar
              </p>
            </div>

            <div className="border border-neutral-200 p-4 bg-white">
              <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
                <BadgeCheck size={16} className="text-neutral-900" />
                Confianza
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Revisa la información y disponibilidad
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

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 store-product-purchase-actions">
                <button
                  onClick={handleAddToCart}
                  type="button"
                  disabled={!sellableProduct || maxQtyAllowed <= 0}
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
              <p className="text-xs text-neutral-500 mt-3">La disponibilidad y el total definitivo se verifican antes de confirmar el pedido.</p>
            </>
          )}
        </div>
      </div>

      {relatedProducts.length > 0 && (
        <section className="mt-16 sm:mt-24">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl uppercase font-black text-black">
              Recomendados para ti
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
              <ProductCard key={item.id} product={item} label={item.recommendation_reason} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}