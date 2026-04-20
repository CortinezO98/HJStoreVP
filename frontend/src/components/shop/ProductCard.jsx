import { Link } from 'react-router-dom'
import { ShoppingCart, Eye } from 'lucide-react'
import { useCartStore } from '../../store'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''

function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)
}

export default function ProductCard({ product }) {
  const addItem = useCartStore((s) => s.addItem)

  const imageUrl = product.primary_image
    ? product.primary_image.startsWith('http')
      ? product.primary_image
      : `${API_URL}${product.primary_image}`
    : null

  const handleAddToCart = (e) => {
    e.preventDefault()
    addItem(product)
    toast.success(`${product.name} agregado al carrito`)
  }

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
      {/* Imagen */}
      <Link to={`/producto/${product.slug}`} className="block relative aspect-square bg-gray-50 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingCart size={40} className="text-gray-200" />
          </div>
        )}
        {product.featured && (
          <span className="absolute top-2 left-2 badge bg-brand-600 text-white">Destacado</span>
        )}
        {/* Overlay con acción rápida */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Link
            to={`/producto/${product.slug}`}
            className="bg-white text-gray-800 rounded-full p-2 shadow-md hover:bg-gray-50 transition-colors"
          >
            <Eye size={18} />
          </Link>
        </div>
      </Link>

      {/* Info */}
      <div className="p-4">
        <Link to={`/producto/${product.slug}`}>
          <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1 line-clamp-2 hover:text-brand-600 transition-colors">
            {product.name}
          </h3>
        </Link>
        <p className="text-xs text-gray-400 mb-3">SKU: {product.sku}</p>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-brand-700">
            {formatCOP(product.sale_price)}
          </span>
          <button
            onClick={handleAddToCart}
            className="w-9 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-xl flex items-center justify-center transition-colors"
            title="Agregar al carrito"
          >
            <ShoppingCart size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
