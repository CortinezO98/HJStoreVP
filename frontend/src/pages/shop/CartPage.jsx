import { Link, useNavigate } from 'react-router-dom'
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight } from 'lucide-react'
import { useCartStore, useAuthStore } from '../../store'

function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)
}

export default function CartPage() {
  const { items, removeItem, updateQty, clearCart, total } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <ShoppingBag size={64} className="text-gray-200 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-gray-700 mb-2">Tu carrito está vacío</h2>
        <p className="text-gray-400 mb-8">Agrega productos desde el catálogo</p>
        <Link to="/catalogo" className="btn-primary inline-flex items-center gap-2">
          Ver catálogo <ArrowRight size={16} />
        </Link>
      </div>
    )
  }

  const handleCheckout = () => {
    if (!isAuthenticated) {
      navigate('/login?next=/checkout')
    } else {
      navigate('/checkout')
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Mi Carrito</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Items */}
        <div className="flex-1 space-y-4">
          {items.map(({ product, qty }) => (
            <div key={product.id} className="card flex items-center gap-4">
              {/* Imagen */}
              <div className="w-20 h-20 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                {product.primary_image ? (
                  <img src={product.primary_image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag size={24} className="text-gray-300" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm line-clamp-2">{product.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">SKU: {product.sku}</p>
                <p className="text-brand-700 font-bold mt-1">{formatCOP(product.sale_price)}</p>
              </div>

              {/* Qty */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQty(product.id, qty - 1)}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center font-semibold text-sm">{qty}</span>
                <button
                  onClick={() => updateQty(product.id, qty + 1)}
                  className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Subtotal */}
              <div className="text-right flex-shrink-0 min-w-[80px]">
                <p className="font-bold text-gray-900">{formatCOP(product.sale_price * qty)}</p>
              </div>

              {/* Eliminar */}
              <button
                onClick={() => removeItem(product.id)}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          <div className="flex justify-between items-center pt-2">
            <button onClick={clearCart} className="text-sm text-red-500 hover:text-red-600 transition-colors">
              Vaciar carrito
            </button>
            <Link to="/catalogo" className="text-sm text-brand-600 hover:text-brand-700 transition-colors">
              Seguir comprando
            </Link>
          </div>
        </div>

        {/* Resumen */}
        <div className="lg:w-80 flex-shrink-0">
          <div className="card sticky top-20">
            <h2 className="font-bold text-gray-900 text-lg mb-4">Resumen del pedido</h2>

            <div className="space-y-2 pb-4 border-b border-gray-100">
              {items.map(({ product, qty }) => (
                <div key={product.id} className="flex justify-between text-sm">
                  <span className="text-gray-500 line-clamp-1 flex-1 mr-2">{product.name} ×{qty}</span>
                  <span className="font-medium">{formatCOP(product.sale_price * qty)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center py-4 border-b border-gray-100">
              <span className="text-gray-500 text-sm">Envío</span>
              <span className="text-sm font-medium text-green-600">Calculado al pagar</span>
            </div>

            <div className="flex justify-between items-center py-4">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-xl text-brand-700">{formatCOP(total())}</span>
            </div>

            <button
              onClick={handleCheckout}
              className="btn-primary w-full flex items-center justify-center gap-2 text-base"
            >
              Proceder al pago <ArrowRight size={18} />
            </button>

            <p className="text-xs text-gray-400 text-center mt-3">
              Pago seguro con tarjeta o PSE
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
