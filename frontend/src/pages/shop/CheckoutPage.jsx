import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ShoppingBag,
  MapPin,
  CheckCircle,
  ArrowLeft,
  CreditCard,
  Loader,
  ChevronRight,
  Info,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useCartStore } from '../../store'
import { apiClient } from '../../services/api'

const API_URL = import.meta.env.VITE_API_URL || ''

function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n || 0))
}

const DEPARTAMENTOS = [
  'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bolívar', 'Boyacá',
  'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba',
  'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena',
  'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda',
  'San Andrés', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada',
]

const PAYMENT_METHODS = {
  wompi: {
    name: 'Wompi',
    description: 'Tarjeta débito, crédito o PSE',
    color: 'border-[#00C48C] bg-[#00C48C]',
    borderSelected: 'border-[#00C48C]',
    disabledNote: 'Sin configurar — modo demo',
    fields: [],
  },
  sistecreditos: {
    name: 'Sistecréditos',
    description: 'Crédito a cuotas · Sin tarjeta de crédito',
    color: 'border-blue-600 bg-blue-600',
    borderSelected: 'border-blue-600',
    disabledNote: 'Sin configurar — modo demo',
    fields: [
      {
        key: 'customer_phone',
        label: 'Teléfono celular',
        placeholder: '3001234567',
        required: true,
      },
      {
        key: 'customer_id',
        label: 'Número de cédula',
        placeholder: '10000000',
        required: true,
      },
    ],
  },
  addi: {
    name: 'Addi',
    description: 'Crédito instantáneo con tu cédula',
    color: 'border-orange-500 bg-orange-500',
    borderSelected: 'border-orange-500',
    disabledNote: 'Sin configurar — modo demo',
    fields: [
      {
        key: 'customer_phone',
        label: 'Teléfono celular',
        placeholder: '3001234567',
        required: true,
      },
    ],
  },
}

function getItemImage(product) {
  if (!product?.primary_image) return null
  return product.primary_image.startsWith('http')
    ? product.primary_image
    : `${API_URL}${product.primary_image}`
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, total, clearCart } = useCartStore()

  const [step, setStep] = useState('form') // form | payment | confirmed
  const [loading, setLoading] = useState(false)
  const [createdOrder, setCreatedOrder] = useState(null)
  const [paymentInfo, setPaymentInfo] = useState(null)
  const [selectedMethod, setSelectedMethod] = useState('wompi')
  const [extraFields, setExtraFields] = useState({
    customer_phone: '',
    customer_id: '',
  })

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    department: 'Atlántico',
    postal_code: '',
  })

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const { data: methods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => apiClient.get('/payments/methods').then((r) => r.data),
  })

  const getMethodStatus = (id) =>
    methods.find((m) => m.id === id) || { id, enabled: false }

  const selectedMethodConfig =
    PAYMENT_METHODS[selectedMethod] || PAYMENT_METHODS.wompi

  const selectedMethodStatus = getMethodStatus(selectedMethod)

  if (items.length === 0 && step === 'form') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <ShoppingBag size={64} className="text-gray-200 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-gray-700 mb-2">
          Tu carrito está vacío
        </h2>
        <p className="text-gray-400 mb-8">
          Agrega productos antes de continuar al pago
        </p>
        <Link to="/catalogo" className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft size={16} />
          Volver al catálogo
        </Link>
      </div>
    )
  }

  if (step === 'confirmed') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-green-600" />
        </div>

        <h1 className="text-3xl font-black text-gray-900 mb-2">
          ¡Pago confirmado!
        </h1>
        <p className="text-gray-500 mb-2">Tu pedido fue creado correctamente</p>
        <p className="font-mono font-bold text-gray-700 mb-8">
          {createdOrder?.order_number}
        </p>

        <div className="flex gap-3">
          <Link to="/" className="btn-secondary flex-1">
            Inicio
          </Link>
          <Link to="/mi-cuenta" className="btn-primary flex-1">
            Mis pedidos
          </Link>
        </div>
      </div>
    )
  }

  if (step === 'payment' && paymentInfo) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard size={28} className="text-brand-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900">Completa tu pago</h1>
          <p className="text-gray-500 mt-1 font-mono font-bold">
            {createdOrder?.order_number}
          </p>
          <p className="text-3xl font-black text-brand-700 mt-2">
            {formatCOP(paymentInfo.amount)}
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => {
              if (paymentInfo.checkout_url) {
                window.location.href = paymentInfo.checkout_url
              }
            }}
            className={`w-full ${selectedMethodConfig.color} text-white rounded-2xl p-5 flex items-center justify-between hover:opacity-90 transition-opacity`}
          >
            <div className="text-left">
              <p className="font-bold text-lg">{selectedMethodConfig.name}</p>
              <p className="text-sm opacity-80">
                {selectedMethodStatus.enabled
                  ? selectedMethodConfig.description
                  : selectedMethodConfig.disabledNote}
              </p>
            </div>
            <ChevronRight size={24} />
          </button>

          {!selectedMethodStatus.enabled && (
            <button
              onClick={async () => {
                setLoading(true)
                try {
                  await apiClient.post('/payments/confirm-demo', {
                    order_number: createdOrder.order_number,
                    method: selectedMethod,
                  })
                  clearCart()
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
              {loading ? (
                <Loader size={18} className="animate-spin" />
              ) : (
                <CheckCircle size={18} className="text-green-600" />
              )}
              Confirmar sin pago (modo desarrollo)
            </button>
          )}

          <div className="flex items-start gap-2 text-xs text-gray-400 px-1">
            <Info size={13} className="mt-0.5 flex-shrink-0" />
            <p>
              Serás redirigido al proveedor de pago correspondiente. Cuando el pago
              se confirme, tu pedido quedará actualizado.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setStep('form')}
            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Volver y cambiar datos o método
          </button>
        </div>
      </div>
    )
  }

  const validateForm = () => {
    if (!form.full_name.trim()) return 'Ingresa el nombre completo'
    if (!form.phone.trim()) return 'Ingresa el teléfono'
    if (!form.address_line1.trim()) return 'Ingresa la dirección principal'
    if (!form.city.trim()) return 'Ingresa la ciudad'
    if (!form.department.trim()) return 'Selecciona el departamento'

    for (const field of selectedMethodConfig.fields) {
      if (field.required && !String(extraFields[field.key] || '').trim()) {
        return `Completa el campo: ${field.label}`
      }
    }

    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const validationError = validateForm()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setLoading(true)

    try {
      const orderPayload = {
        items: items.map(({ product, qty }) => ({
          product_id: product.id,
          qty,
        })),
        shipping_address: {
          full_name: form.full_name,
          phone: form.phone,
          address_line1: form.address_line1,
          address_line2: form.address_line2 || null,
          city: form.city,
          department: form.department,
          postal_code: form.postal_code || null,
        },
        notes: null,
      }

      const { data: order } = await apiClient.post('/orders/web', orderPayload)
      setCreatedOrder(order)

      const paymentPayload = {
        order_number: order.order_number,
        method: selectedMethod,
        customer_email: 'cliente@demo.com',
        customer_name: form.full_name,
        customer_phone: extraFields.customer_phone || form.phone,
        customer_id: extraFields.customer_id || '',
      }

      const { data: checkout } = await apiClient.post(
        '/payments/create-checkout',
        paymentPayload
      )

      setPaymentInfo({
        ...checkout,
        amount: order.total_amount,
        method: selectedMethod,
      })

      setStep('payment')
    } catch (error) {
      const message =
        error?.response?.data?.detail || 'No fue posible procesar tu pedido'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link
        to="/carrito"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Volver al carrito
      </Link>

      <div className="flex flex-col lg:flex-row gap-8">
        <form onSubmit={handleSubmit} className="flex-1 card">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Checkout</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Nombre completo
              </label>
              <input
                className="input"
                value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                placeholder="José Jorge Cortines Osorio"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Teléfono
              </label>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="3001234567"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Código postal
              </label>
              <input
                className="input"
                value={form.postal_code}
                onChange={(e) => set('postal_code', e.target.value)}
                placeholder="Opcional"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Dirección principal
              </label>
              <input
                className="input"
                value={form.address_line1}
                onChange={(e) => set('address_line1', e.target.value)}
                placeholder="Calle 90 # 49C - 20"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Dirección complementaria
              </label>
              <input
                className="input"
                value={form.address_line2}
                onChange={(e) => set('address_line2', e.target.value)}
                placeholder="Apto, torre, referencia, etc. (opcional)"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Ciudad
              </label>
              <input
                className="input"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Barranquilla"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Departamento
              </label>
              <select
                className="input"
                value={form.department}
                onChange={(e) => set('department', e.target.value)}
              >
                {DEPARTAMENTOS.map((dep) => (
                  <option key={dep} value={dep}>
                    {dep}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={18} className="text-brand-600" />
              <h2 className="text-lg font-bold text-gray-900">Método de pago</h2>
            </div>

            <div className="space-y-3">
              {Object.entries(PAYMENT_METHODS).map(([key, config]) => {
                const methodStatus = getMethodStatus(key)
                const isSelected = selectedMethod === key

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedMethod(key)}
                    className={`w-full text-left border rounded-2xl p-4 transition ${
                      isSelected
                        ? `${config.borderSelected} bg-gray-50`
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900">{config.name}</p>
                        <p className="text-sm text-gray-500">
                          {methodStatus.enabled
                            ? config.description
                            : config.disabledNote}
                        </p>
                      </div>

                      <div
                        className={`w-4 h-4 rounded-full border mt-1 ${
                          isSelected
                            ? 'bg-brand-600 border-brand-600'
                            : 'border-gray-300'
                        }`}
                      />
                    </div>
                  </button>
                )
              })}
            </div>

            {selectedMethodConfig.fields.length > 0 && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedMethodConfig.fields.map((field) => (
                  <div key={field.key}>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      {field.label}
                    </label>
                    <input
                      className="input"
                      value={extraFields[field.key] || ''}
                      onChange={(e) =>
                        setExtraFields((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 rounded-2xl bg-brand-50 border border-brand-100 p-4">
            <div className="flex items-start gap-3">
              <MapPin size={18} className="text-brand-600 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  Información de envío
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Revisa bien tus datos. Usaremos esta dirección para la entrega
                  del pedido.
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3 mt-8"
          >
            {loading ? (
              <>
                <Loader size={18} className="animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CreditCard size={20} />
                Continuar al pago · {formatCOP(total())}
              </>
            )}
          </button>
        </form>

        <div className="lg:w-96 flex-shrink-0">
          <div className="card sticky top-20">
            <h2 className="font-bold text-gray-900 text-lg mb-4">Tu pedido</h2>

            <div className="space-y-3 pb-4 border-b border-gray-100">
              {items.map(({ product, qty }) => {
                const imgUrl = getItemImage(product)

                return (
                  <div key={product.id} className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag size={16} className="text-gray-300" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 line-clamp-1">
                        {product.name}
                      </p>
                      <p className="text-xs text-gray-400">×{qty}</p>
                    </div>

                    <p className="text-sm font-bold text-gray-900 flex-shrink-0">
                      {formatCOP(Number(product.sale_price) * qty)}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-between items-center py-4 border-b border-gray-100">
              <span className="text-gray-500 text-sm">Envío</span>
              <span className="text-sm font-medium text-green-600">
                Calculado al pagar
              </span>
            </div>

            <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-lg mt-3">
              <span>Total</span>
              <span className="text-brand-700">{formatCOP(total())}</span>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              Pago seguro. Tus datos serán procesados de forma protegida.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}