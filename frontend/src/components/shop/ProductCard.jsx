import { formatCOP } from '../../utils/currency'
import { Link } from 'react-router-dom'
import { Plus, Heart, ArrowUpRight } from 'lucide-react'
import { useCartStore, useWishlistStore } from '../../store'
import toast from 'react-hot-toast'
import ProductImage from './ProductImage'

const API_URL = import.meta.env.VITE_API_URL || ''


export default function ProductCard({ product, label, catalogMode = false, hideCategory = false, compact = false }) {
  const addItem = useCartStore((state) => state.addItem)
  const toggleFavorite = useWishlistStore((state) => state.toggle)
  const favorite = useWishlistStore((state) => state.items.some((item) => item.id === product.id))
  const stock = product.total_stock ?? product.stock
  const soldOut = stock !== null && stock !== undefined && Number(stock) <= 0
  const image = product.primary_image
    ? product.primary_image.startsWith('http') ? product.primary_image : `${API_URL}${product.primary_image}`
    : null

  const addToCart = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (soldOut || product.has_variants) return
    if (!addItem(product, 1)) {
      toast.error('No hay suficiente stock disponible')
      return
    }
    toast.success('Producto agregado al carrito')
  }

  return (
    <article className={`editorial-product ${catalogMode ? 'hj-catalog-product' : ''} ${compact ? 'is-crosssell' : ''}`}>
      <div className={`editorial-product-media ${soldOut && catalogMode ? 'is-unavailable' : ''}`}>
        <Link to={`/producto/${product.slug}`} aria-label={`Ver ${product.name}`}>
          <ProductImage src={image} alt={product.name}
            category={product.category_name} loading="lazy" fetchPriority="low"/>
        </Link>
        {soldOut ? (
          <span className="editorial-product-label is-sold-out">AGOTADO</span>
        ) : catalogMode && Number(stock) > 0 && Number(stock) <= Number(product.stock_min_alert || 3) ? (
          <span className="editorial-product-label is-low-stock">ÚLTIMAS UNIDADES</span>
        ) : label ? (
          <span className="editorial-product-label">{label}</span>
        ) : product.featured ? (
          <span className="editorial-product-label">DESTACADO</span>
        ) : null}
        <button type="button" onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          toggleFavorite(product)
        }}
          className="store-favorite-action absolute top-3 right-3 z-10 rounded-full bg-white/95 shadow-sm p-2 hover:bg-white"
          aria-label={favorite ? `Quitar ${product.name} de favoritos` : `Agregar ${product.name} a favoritos`}
          aria-pressed={favorite} title={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}>
          <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
        </button>
        {product.has_variants && !soldOut ? (
          <Link to={`/producto/${product.slug}`}
            className={`editorial-product-add ${catalogMode ? 'hj-catalog-cart-action' : ''}`}
            aria-label={`Elegir opciones de ${product.name}`} title="Elegir opciones">
            <Plus size={19} strokeWidth={1.8} />
            {catalogMode && <span>Elegir color y talla</span>}
          </Link>
        ) : !soldOut && (
          <button type="button"
            className={`editorial-product-add ${catalogMode ? 'hj-catalog-cart-action' : ''}`}
            onClick={addToCart}
            aria-label={`Agregar ${product.name} al carrito`} title="Agregar al carrito">
            <Plus size={19} strokeWidth={1.8}/>
            {catalogMode && <span>Agregar al carrito</span>}
          </button>
        )}
      </div>
      <div className="editorial-product-details">
        {!hideCategory && product.category_name && <span className="editorial-product-category">{product.category_name}</span>}
        <Link to={`/producto/${product.slug}`} className="editorial-product-info">
          <span className="editorial-product-name">{product.name}</span>
          <span className="editorial-product-price">
            {product.has_variants ? 'Desde ' : ''}{formatCOP(product.sale_price)}
          </span>
        </Link>
        {catalogMode && soldOut && <span className="hj-catalog-stock is-soldout">Agotado</span>}
        {catalogMode && !soldOut && Number(stock) > 0 && Number(stock) <= Number(product.stock_min_alert || 3) &&
          <span className="hj-catalog-stock">Quedan {stock} unidades</span>}
        <Link to={`/producto/${product.slug}`} className="store-product-quick-link">
          {soldOut ? 'VER PRODUCTO' : product.has_variants ? (catalogMode ? 'ELEGIR COLOR Y TALLA' : 'ELEGIR OPCIONES') : 'VER DETALLES'}
          <ArrowUpRight size={14} aria-hidden="true"/>
        </Link>
      </div>
    </article>
  )
}
