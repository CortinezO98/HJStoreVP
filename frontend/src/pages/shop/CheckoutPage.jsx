import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ShoppingBag, MapPin, CheckCircle, ArrowLeft, Truck, CreditCard, Loader } from 'lucide-react'
import { useCartStore } from '../../store'
import { apiClient } from '../../services/api'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''

function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
  }).format(n)
}

const DEPARTAMENTOS = [
  'Amazonas','Antioquia','Arauca','Atlántico','Bolívar','Boyacá',
  'Caldas','Caquetá','Casanare','Cauca','Cesar','Chocó','Córdoba',
  'Cundinamarca','Guainía','Guaviare','Huila','La Guajira','Magdalena',
  'Meta','Nariño','Norte de Santander','Putumayo','Quindío','Risaralda',
  'San Andrés','Santander','Sucre','Tolima','Valle del Cauca','Vaupés','Vichada',
]

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, total, clearCart } = useCartStore()
  const [step, setStep] = useState('form')  // 'form' | 'payment' | 'confirmed'
  const [loading, setLoading] = useState(false)
  const [createdOrder, setCreatedOrder] = useState(null)
  const [paymentInfo, setPaymentInfo] = useState(null)

  const [form, setForm] = useState({
    full_name: '', phone: '', address_line1: '',
    address_line2: '', city: '', department: 'Atlántico', postal_code: '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  if (items.length === 0 && step === 'form') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <ShoppingBag size={64} className="text-gray-200 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-gray-700 mb-2">Tu carrito está vacío</h2>
        <Link to="/catalogo" className="btn-primary inline-flex items-center gap-2 mt-4">
          <ArrowLeft size={16} /> Ver catálogo
        </Link>
      </div>
    )
  }

  // ── PASO 1: Crear orden ───────────────────────────────────────────────────
  const handleCreateOrder = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data: order } = await apiClient.post('/orders/web', {
        items: items.map(({ product, qty }) => ({ product_id: product.id, qty })),
        shipping_address: {
          full_name: form.full_name, phone: form.phone,
          address_line1: form.address_line1,
          address_line2: form.address_line2 || undefined,
          city: form.city, department: form.department,
          postal_code: form.postal_code || undefined,
        },
      })

      setCreatedOrder(order)
      clearCart()

      // Iniciar pago con Wompi
      const { data: payment } = await apiClient.post('/payments/initiate', {
        order_number: order.order_number,
      })

      setPaymentInfo(payment)
      setStep('payment')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al procesar el pedido')
    } finally {
      setLoading(false)
    }
  }

  // ── PASO 2: Ir a pagar con Wompi ─────────────────────────────────────────
  const handleGoToWompi = () => {
    window.location.href = paymentInfo.checkout_url
  }

  // ── PASO 2b: Confirmar pago demo (solo desarrollo) ───────────────────────
  const handleDemoConfirm = async () => {
    setLoading(true)
    try {
      await apiClient.post('/payments/confirm-demo', {
        order_number: createdOrder.order_number,
      })
      setStep('confirmed')
    } catch (err) {
      toast.error('Error al confirmar pago demo')
    } finally {
      setLoading(false)
    }
  }

  // ── PANTALLA: Pago confirmado ────────────────────────────────────────────
  if (step === 'confirmed') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-green-600" />
        </div>
        <h1 className="text-3xl font-black text-gray-900 mb-2">¡Pago confirmado!</h1>
        <p className="text-gray-500 mb-2">Tu pedido está en proceso</p>
        <p className="text-sm font-mono font-bold text-gray-700 mb-8">
          {createdOrder?.order_number}
        </p>
        <div className="flex gap-3">
          <Link to="/" className="btn-secondary flex-1">Ir al inicio</Link>
          <Link to="/mi-cuenta" className="btn-primary flex-1">Ver mis pedidos</Link>
        </div>
      </div>
    )
  }

  // ── PANTALLA: Opciones de pago ───────────────────────────────────────────
  if (step === 'payment' && paymentInfo) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard size={28} className="text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Elige cómo pagar</h1>
          <p className="text-gray-500 mt-2">
            Orden <span className="font-mono font-bold text-gray-700">{createdOrder?.order_number}</span>
          </p>
          <p className="text-2xl font-black text-brand-700 mt-1">
            {formatCOP(paymentInfo.amount)}
          </p>
        </div>

        <div className="space-y-4">
          {/* Wompi — Tarjeta / PSE */}
          <button
            onClick={handleGoToWompi}
            className="w-full bg-[#00C48C] hover:bg-[#00A876] text-white rounded-2xl p-5 flex items-center justify-between transition-colors group"
          >
            <div className="text-left">
              <p className="font-bold text-lg">Pagar con Wompi</p>
              <p className="text-sm opacity-80">
                {paymentInfo.wompi_enabled
                  ? 'Tarjeta débito, crédito o PSE'
                  : 'Modo demo — sin cargo real'
                }
              </p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-colors">
              <CreditCard size={24} />
            </div>
          </button>

          {/* Solo en desarrollo: botón de confirmar sin pago real */}
          {!paymentInfo.wompi_enabled && (
            <button
              onClick={handleDemoConfirm}
              disabled={loading}
              className="w-full btn-secondary flex items-center justify-center gap-2 py-4 rounded-2xl"
            >
              {loading
                ? <Loader size={18} className="animate-spin" />
                : <CheckCircle size={18} className="text-green-600" />
              }
              Confirmar sin pago (modo desarrollo)
            </button>
          )}

          <p className="text-xs text-gray-400 text-center pt-2">
            {paymentInfo.wompi_enabled
              ? 'Serás redirigido a la página segura de Wompi para completar el pago.'
              : '⚠️ Sin credenciales de Wompi. Agrega WOMPI_PUBLIC_KEY al .env para activar pagos reales.'
            }
          </p>
        </div>
      </div>
    )
  }

  // ── PANTALLA: Formulario de dirección ────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/carrito" className="text-gray-400 hover:text-brand-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Finalizar pedido</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <form onSubmit={handleCreateOrder} className="flex-1 space-y-6">
          <div className="card">
            <h2 className="font-bold text-gray-900 text-lg mb-5 flex items-center gap-2">
              <MapPin size={18} className="text-brand-600" /> Dirección de entrega
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                <input className="input" required value={form.full_name}
                  onChange={e => set('full_name', e.target.value)} placeholder="¿Quién recibe?" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
                <input className="input" required value={form.phone}
                  onChange={e => set('phone', e.target.value)} placeholder="+57 300 000 0000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Departamento *</label>
                <select className="input" required value={form.department}
                  onChange={e => set('department', e.target.value)}>
                  {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad *</label>
                <input className="input" required value={form.city}
                  onChange={e => set('city', e.target.value)} placeholder="Barranquilla" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código postal</label>
                <input className="input" value={form.postal_code}
                  onChange={e => set('postal_code', e.target.value)} placeholder="080001" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección *</label>
                <input className="input" required value={form.address_line1}
                  onChange={e => set('address_line1', e.target.value)} placeholder="Cra 53 #82-15" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Info adicional</label>
                <input className="input" value={form.address_line2}
                  onChange={e => set('address_line2', e.target.value)} placeholder="Apto 301, Barrio El Prado" />
              </div>
            </div>
          </div>

          {/* Método de pago preview */}
          <div className="card">
            <h2 className="font-bold text-gray-900 text-lg mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-brand-600" /> Método de pago
            </h2>
            <div className="flex items-center gap-4 p-4 border-2 border-[#00C48C] bg-green-50 rounded-xl">
              <div className="w-10 h-10 bg-[#00C48C] rounded-xl flex items-center justify-center flex-shrink-0">
                <CreditCard size={20} className="text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Wompi — Pago seguro</p>
                <p className="text-xs text-gray-500">Tarjeta débito, crédito o PSE · Colombia</p>
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3">
            {loading
              ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><CreditCard size={20} /> Continuar al pago · {formatCOP(total())}</>
            }
          </button>
        </form>

        {/* Resumen */}
        <div className="lg:w-80 flex-shrink-0">
          <div className="card sticky top-20">
            <h2 className="font-bold text-gray-900 text-lg mb-4">Tu pedido</h2>
            <div className="space-y-3 pb-4 border-b border-gray-100">
              {items.map(({ product, qty }) => {
                const imgUrl = product.primary_image
                  ? (product.primary_image.startsWith('http') ? product.primary_image : `${API_URL}${product.primary_image}`)
                  : null
                return (
                  <div key={product.id} className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                      {imgUrl
                        ? <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <ShoppingBag size={16} className="text-gray-300" />
                          </div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-clamp-1">{product.name}</p>
                      <p className="text-xs text-gray-400">×{qty}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 flex-shrink-0">
                      {formatCOP(product.sale_price * qty)}
                    </p>
                  </div>
                )
              })}
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-lg mt-3">
              <span>Total</span>
              <span className="text-brand-700">{formatCOP(total())}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
