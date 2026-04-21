import { Link } from 'react-router-dom'
import { ShoppingCart, Eye, Zap } from 'lucide-react'
import { useCartStore } from '../../store'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''

function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
  }).format(amount)
}

export default function ProductCard({ product }) {
  const addItem  = useCartStore((s) => s.addItem)
  const navigate = useNavigate()

  const imageUrl = product.primary_image
    ? product.primary_image.startsWith('http')
      ? product.primary_image
      : `${API_URL}${product.primary_image}`
    : null

  // Stock total sumado de todas las ubicaciones
  const totalStock = product.total_stock ?? product.stock ?? null
  const isOutOfStock = totalStock !== null && totalStock === 0
  const isLowStock   = totalStock !== null && totalStock > 0 && totalStock <= 5

  const handleAddToCart = (e) => {
    e.preventDefault()
    if (isOutOfStock) return
    addItem(product)
    toast.success(`${product.name} agregado al carrito`, { duration: 2000 })
  }

  const handleBuyNow = (e) => {
    e.preventDefault()
    if (isOutOfStock) return
    addItem(product)
    navigate('/checkout')
  }

  return (
    <div className={`group bg-white rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
      isOutOfStock ? 'border-gray-100 opacity-70' : 'border-gray-100'
    }`}>
      {/* Imagen */}
      <Link to={`/producto/${product.slug}`} className="block relative aspect-square bg-gray-50 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            className={`w-full h-full object-cover transition-transform duration-300 ${
              isOutOfStock ? '' : 'group-hover:scale-105'
            }`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingCart size={40} className="text-gray-200" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {product.featured && !isOutOfStock && (
            <span className="bg-brand-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              ⭐ Destacado
            </span>
          )}
          {isOutOfStock && (
            <span className="bg-gray-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              Agotado
            </span>
          )}
          {isLowStock && !isOutOfStock && (
            <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              ¡Últimas {totalStock}!
            </span>
          )}
        </div>

        {/* Overlay acciones rápidas */}
        {!isOutOfStock && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100 gap-2">
            <button
              onClick={handleBuyNow}
              className="bg-white text-gray-900 text-xs font-bold px-3 py-1.5 rounded-lg shadow-md hover:bg-brand-600 hover:text-white transition-colors flex items-center gap-1"
            >
              <Zap size={12} /> Comprar ya
            </button>
            <Link
              to={`/producto/${product.slug}`}
              className="bg-white text-gray-700 rounded-lg p-1.5 shadow-md hover:bg-gray-100 transition-colors"
            >
              <Eye size={16} />
            </Link>
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="p-4">
        <Link to={`/producto/${product.slug}`}>
          <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1 line-clamp-2 hover:text-brand-600 transition-colors">
            {product.name}
          </h3>
        </Link>

        {product.category_name && (
          <p className="text-xs text-gray-400 mb-1">{product.category_name}</p>
        )}

        {/* Stock indicator */}
        {totalStock !== null && (
          <p className={`text-xs mb-2 font-medium ${
            isOutOfStock ? 'text-red-500' :
            isLowStock ? 'text-amber-600' :
            'text-green-600'
          }`}>
            {isOutOfStock ? '✗ Agotado' :
              isLowStock ? `⚡ Solo ${totalStock} disponibles` :
              '✓ Disponible'}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-lg font-bold text-brand-700">
              {formatCOP(product.sale_price)}
            </span>
            {product.cost_price && product.sale_price > product.cost_price * 1.1 && (
              <p className="text-xs text-gray-400 line-through">
                {formatCOP(product.sale_price * 1.15)}
              </p>
            )}
          </div>

          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 ${
              isOutOfStock
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                : 'bg-brand-600 hover:bg-brand-700 text-white'
            }`}
            title={isOutOfStock ? 'Agotado' : 'Agregar al carrito'}
          >
            <ShoppingCart size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
