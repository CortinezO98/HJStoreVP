import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ShoppingCart, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { productsApi } from '../../services/api'
import { useCartStore } from '../../store'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''

function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)
}

export default function ProductPage() {
  const { slug } = useParams()
  const addItem = useCartStore((s) => s.addItem)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => productsApi.get(slug).then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="animate-pulse flex gap-10">
          <div className="w-1/2 aspect-square bg-gray-200 rounded-2xl" />
          <div className="flex-1 space-y-4">
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/4" />
            <div className="h-10 bg-gray-200 rounded w-1/3 mt-4" />
          </div>
        </div>
      </div>
    )
  }

  if (!product) return (
    <div className="text-center py-24">
      <p className="text-gray-400">Producto no encontrado</p>
      <Link to="/catalogo" className="mt-4 text-brand-600 underline text-sm block">Ver catálogo</Link>
    </div>
  )

  const primaryImg = product.images?.find((i) => i.is_primary) || product.images?.[0]
  const imgUrl = primaryImg?.url
    ? (primaryImg.url.startsWith('http') ? primaryImg.url : `${API_URL}${primaryImg.url}`)
    : null

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link to="/catalogo" className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 mb-8 transition-colors">
        <ArrowLeft size={16} /> Volver al catálogo
      </Link>

      <div className="flex flex-col md:flex-row gap-10">
        {/* Imagen */}
        <div className="md:w-1/2">
          <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden">
            {imgUrl
              ? <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><ShoppingCart size={60} className="text-gray-200" /></div>
            }
          </div>
        </div>

        {/* Info */}
        <div className="md:w-1/2">
          {product.category && (
            <span className="badge bg-brand-100 text-brand-700 mb-3">{product.category.name}</span>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>
          <p className="text-sm text-gray-400 mb-4">SKU: {product.sku}</p>

          {product.description && (
            <p className="text-gray-600 text-sm leading-relaxed mb-6">{product.description}</p>
          )}

          <div className="text-4xl font-black text-brand-700 mb-8">
            {formatCOP(product.sale_price)}
          </div>

          <button
            onClick={() => { addItem(product); toast.success('Agregado al carrito!') }}
            className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3"
          >
            <ShoppingCart size={20} /> Agregar al carrito
          </button>
        </div>
      </div>
    </div>
  )
}
