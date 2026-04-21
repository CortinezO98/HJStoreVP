import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ShoppingBag, MapPin, CheckCircle, ArrowLeft,
  CreditCard, Loader, ChevronRight, Info
} from 'lucide-react'
import { useCartStore } from '../../store'
import { apiClient } from '../../services/api'
import { useQuery } from '@tanstack/react-query'
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

// ── Configuración visual de cada método de pago ──────────────────────────────
const PAYMENT_METHODS = {
  wompi: {
    name: 'Wompi',
    description: 'Tarjeta débito, crédito o PSE',
    color: 'border-[#00C48C] bg-[#00C48C]',
    textColor: 'text-[#00C48C]',
    borderSelected: 'border-[#00C48C]',
    disabledNote: 'Sin configurar — modo demo',
    fields: [],
  },
  sistecreditos: {
    name: 'Sistecréditos',
    description: 'Crédito a cuotas · Sin tarjeta de crédito',
    color: 'border-blue-600 bg-blue-600',
    textColor: 'text-blue-600',
    borderSelected: 'border-blue-600',
    disabledNote: 'Sin configurar — modo demo',
    fields: [
      { key: 'customer_phone', label: 'Teléfono celular', placeholder: '3001234567', required: true },
      { key: 'customer_id',    label: 'Número de cédula', placeholder: '10000000',   required: true },
    ],
  },
  addi: {
    name: 'Addi',
    description: 'Crédito instantáneo con tu cédula',
    color: 'border-orange-500 bg-orange-500',
    textColor: 'text-orange-500',
    borderSelected: 'border-orange-500',
    disabledNote: 'Sin configurar — modo demo',
    fields: [
      { key: 'customer_phone', label: 'Teléfono celular', placeholder: '3001234567', required: true },
    ],
  },
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, total, clearCart } = useCartStore()
  const [step, setStep] = useState('form')
  const [loading, setLoading] = useState(false)
  const [createdOrder, setCreatedOrder] = useState(null)
  const [paymentInfo, setPaymentInfo] = useState(null)
  const [selectedMethod, setSelectedMethod] = useState('wompi')
  const [extraFields, setExtraFields] = useState({
    customer_phone: '',
    customer_id: '',
  })

  const [form, setForm] = useState({
    full_name: '', phone: '', address_line1: '',
    address_line2: '', city: '', department: 'Atlántico', postal_code: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Cargar métodos disponibles desde el backend
  const { data: methods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => apiClient.get('/payments/methods').then(r => r.data),
  })

  const getMethodStatus = (id) => methods.find(m => m.id === id) || { enabled: false }

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

  // ── Pantalla de confirmación ──────────────────────────────────────────────
  if (step === 'confirmed') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-green-600" />
        </div>
        <h1 className="text-3xl font-black text-gray-900 mb-2">¡Pago confirmado!</h1>
        <p className="font-mono font-bold text-gray-700 mb-8">{createdOrder?.order_number}</p>
        <div className="flex gap-3">
          <Link to="/" className="btn-secondary flex-1">Inicio</Link>
          <Link to="/mi-cuenta" className="btn-primary flex-1">Mis pedidos</Link>
        </div>
      </div>
    )
  }

  // ── Pantalla de selección de pago ─────────────────────────────────────────
  if (step === 'payment' && paymentInfo) {
    const methodConfig = PAYMENT_METHODS[paymentInfo.method] || PAYMENT_METHODS.wompi
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard size={28} className="text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Completa tu pago</h1>
          <p className="text-gray-500 mt-1 font-mono font-bold">{createdOrder?.order_number}</p>
          <p className="text-3xl font-black text-brand-700 mt-2">{formatCOP(paymentInfo.amount)}</p>
        </div>

        <div className="space-y-4">
          {/* Botón pagar */}
          <button
            onClick={() => window.location.href = paymentInfo.checkout_url}
            className={`w-full ${methodConfig.color} text-white rounded-2xl p-5 flex items-center justify-between hover:opacity-90 transition-opacity`}
          >
            <div className="text-left">
              <p className="font-bold text-lg">{methodConfig.name}</p>
              <p className="text-sm opacity-80">
                {paymentInfo.enabled ? methodConfig.description : methodConfig.disabledNote}
              </p>
            </div>
            <ChevronRight size={24} />
          </button>

          {/* Demo: confirmar sin pago */}
          {!paymentInfo.enabled && (
            <button
              onClick={async () => {
                setLoading(true)
                try {
                  await apiClient.post('/payments/confirm-demo', {
                    order_number: createdOrder.order_number,
                    method: paymentInfo.method,
                  })
                  setStep('confirmed')
                } catch {
                  toast.error('Error al confirmar pago demo')
                } finally {
                  setLoading(false)
                }
              }}
              disabled={loading}
              className="w-full btn-secondary flex items-center justify-center gap-2 py-4 rounded-2xl"
            >
              {loading ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} className="text-green-600" />}
              Confirmar sin pago (modo desarrollo)
            </button>
          )}

          <div className="flex items-start gap-2 text-xs text-gray-400 px-1">
            <Info size={13} className="mt-0.5 flex-shrink-0" />
            <p>
              {paymentInfo.enabled
                ? 'Serás redirigido a la página segura del proveedor para completar el pago.'
                : `⚠️ Credenciales de ${methodConfig.name} no configuradas. Actívalas en el .env.`
              }
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Formulario de dirección y método de pago ──────────────────────────────
  const handleCreateOrder = async (e) => {
    e.preventDefault()

    const methodFields = PAYMENT_METHODS[selectedMethod]?.fields || []
    for (const field of methodFields) {
      if (field.required && !extraFields[field.key]) {
        toast.error(`El campo "${field.label}" es requerido para ${PAYMENT_METHODS[selectedMethod].name}`)
        return
      }
    }

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

      const { data: payment } = await apiClient.post('/payments/initiate', {
        order_number: order.order_number,
        method: selectedMethod,
        customer_phone: extraFields.customer_phone || form.phone || undefined,
        customer_id: extraFields.customer_id || undefined,
      })

      setPaymentInfo(payment)
      setStep('payment')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al procesar el pedido')
    } finally {
      setLoading(false)
    }
  }

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

          {/* Dirección */}
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

          {/* Método de pago */}
          <div className="card">
            <h2 className="font-bold text-gray-900 text-lg mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-brand-600" /> Método de pago
            </h2>

            <div className="space-y-3">
              {Object.entries(PAYMENT_METHODS).map(([id, config]) => {
                const status = getMethodStatus(id)
                const isSelected = selectedMethod === id
                return (
                  <label
                    key={id}
                    className={`flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      isSelected ? config.borderSelected + ' bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio" name="payment_method"
                      value={id} checked={isSelected}
                      onChange={() => setSelectedMethod(id)}
                      className="mt-1 accent-brand-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{config.name}</p>
                        {!status.enabled && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            Demo
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{config.description}</p>

                      {/* Campos extra según el método */}
                      {isSelected && config.fields.length > 0 && (
                        <div className="mt-3 space-y-3">
                          {config.fields.map(field => (
                            <div key={field.key}>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                {field.label} {field.required && '*'}
                              </label>
                              <input
                                className="input text-sm"
                                placeholder={field.placeholder}
                                value={extraFields[field.key]}
                                onChange={e => setExtraFields(f => ({ ...f, [field.key]: e.target.value }))}
                                required={isSelected && field.required}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                )
              })}
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

        {/* Resumen lateral */}
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
