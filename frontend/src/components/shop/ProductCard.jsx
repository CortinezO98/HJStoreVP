import { Link } from 'react-router-dom'
import { Plus, ShoppingBag, Heart } from 'lucide-react'
import { useCartStore, useWishlistStore } from '../../store'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''
const formatCOP = (amount) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(amount) || 0)

export default function ProductCard({ product, label }) {
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
    if (soldOut) return
    if (!addItem(product, 1)) {
      toast.error('No hay suficiente stock disponible')
      return
    }
    toast.success('Producto agregado al carrito')
  }

  return (
    <article className="editorial-product">
      <div className="editorial-product-media">
        <Link to={`/producto/${product.slug}`} aria-label={`Ver ${product.name}`}>
          {image ? (
            <img src={image} loading="lazy" alt={product.name} />
          ) : (
            <span className="editorial-product-fallback"><ShoppingBag size={45} strokeWidth={1}/></span>
          )}
        </Link>
        {soldOut ? (
          <span className="editorial-product-label is-sold-out">AGOTADO</span>
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
          className="absolute top-3 right-3 z-10 rounded-full bg-white/95 shadow-sm p-2 hover:bg-white"
          aria-label={favorite ? `Quitar ${product.name} de favoritos` : `Guardar ${product.name} en favoritos`}
          aria-pressed={favorite} title={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}>
          <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
        </button>
        {!soldOut && (
          <button type="button" className="editorial-product-add" onClick={addToCart}
            aria-label={`Agregar ${product.name} al carrito`} title="Agregar al carrito">
            <Plus size={19} strokeWidth={1.8}/>
          </button>
        )}
      </div>
      <Link to={`/producto/${product.slug}`} className="editorial-product-info">
        <span className="editorial-product-name">{product.name}</span>
        <span className="editorial-product-price">{formatCOP(product.sale_price)}</span>
        {product.category_name && <span className="editorial-product-category">{product.category_name}</span>}
      </Link>
    </article>
  )
}
