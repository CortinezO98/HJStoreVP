import { Link, useNavigate } from 'react-router-dom'
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, ShieldCheck, Truck } from 'lucide-react'
import { useCartStore, useAuthStore } from '../../store'
import toast from 'react-hot-toast'

function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0))
}

function getAvailableStock(product) {
  const raw = product?.total_stock ?? product?.stock ?? null
  return raw === null || raw === undefined ? null : Number(raw)
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

  const handleQtyChange = (productId, newQty) => {
    const ok = updateQty(productId, newQty)
    if (!ok) {
      toast.error('No puedes superar el stock disponible')
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Mi carrito</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-4">
          {items.map(({ product, qty }) => {
            const availableStock = getAvailableStock(product)
            const lowStock = availableStock !== null && availableStock <= 5 && availableStock > 0
            const outOfStock = availableStock !== null && availableStock <= 0

            return (
              <div key={product.id} className="card flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-24 h-24 bg-gray-100 rounded-2xl overflow-hidden flex-shrink-0">
                  {product.primary_image ? (
                    <img
                      src={product.primary_image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag size={26} className="text-gray-300" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 line-clamp-2">{product.name}</p>
                  <p className="text-xs text-gray-400 mt-1">SKU: {product.sku}</p>
                  <p className="text-brand-700 font-bold mt-2">{formatCOP(product.sale_price)}</p>

                  {availableStock !== null && (
                    <p
                      className={`text-xs mt-1 font-medium ${
                        outOfStock
                          ? 'text-red-500'
                          : lowStock
                          ? 'text-amber-600'
                          : 'text-green-600'
                      }`}
                    >
                      {outOfStock
                        ? 'Producto agotado'
                        : lowStock
                        ? `Solo quedan ${availableStock} unidades`
                        : `Disponible: ${availableStock}`}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleQtyChange(product.id, qty - 1)}
                      className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                    >
                      <Minus size={14} />
                    </button>

                    <span className="w-10 text-center font-semibold text-sm">{qty}</span>

                    <button
                      onClick={() => handleQtyChange(product.id, qty + 1)}
                      className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
                      disabled={availableStock !== null && qty >= availableStock}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="text-right min-w-[110px]">
                    <p className="font-bold text-gray-900">
                      {formatCOP(Number(product.sale_price) * qty)}
                    </p>
                  </div>

                  <button
                    onClick={() => removeItem(product.id)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={clearCart}
              className="text-sm text-red-500 hover:text-red-600 transition-colors"
            >
              Vaciar carrito
            </button>

            <Link
              to="/catalogo"
              className="text-sm text-brand-600 hover:text-brand-700 transition-colors"
            >
              Seguir comprando
            </Link>
          </div>
        </div>

        <div className="lg:w-96 flex-shrink-0">
          <div className="card sticky top-20">
            <h2 className="font-bold text-gray-900 text-lg mb-4">Resumen del pedido</h2>

            <div className="space-y-2 pb-4 border-b border-gray-100">
              {items.map(({ product, qty }) => (
                <div key={product.id} className="flex justify-between text-sm gap-3">
                  <span className="text-gray-500 line-clamp-1 flex-1">
                    {product.name} ×{qty}
                  </span>
                  <span className="font-medium">
                    {formatCOP(Number(product.sale_price) * qty)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-3 py-4 border-b border-gray-100">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Envío</span>
                <span className="font-medium text-green-600">Calculado al pagar</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ShieldCheck size={14} className="text-brand-600" />
                Pago seguro
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Truck size={14} className="text-brand-600" />
                Envíos a todo Colombia
              </div>
            </div>

            <div className="flex justify-between items-center py-4">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-2xl text-brand-700">
                {formatCOP(total())}
              </span>
            </div>

            <button
              onClick={handleCheckout}
              className="btn-primary w-full flex items-center justify-center gap-2 text-base"
            >
              Proceder al pago <ArrowRight size={18} />
            </button>

            <p className="text-xs text-gray-400 text-center mt-3">
              Compra protegida y proceso de pago confiable
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}