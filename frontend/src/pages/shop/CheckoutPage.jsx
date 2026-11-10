import { useEffect, useState } from 'react'
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
    disabledNote: 'No disponible por ahora',
    fields: [],
  },
  sistecreditos: {
    name: 'Sistecréditos',
    description: 'Crédito a cuotas · Sin tarjeta de crédito',
    color: 'border-blue-600 bg-blue-600',
    borderSelected: 'border-blue-600',
    disabledNote: 'No disponible por ahora',
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
    disabledNote: 'No disponible por ahora',
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
  const [shippingRateId, setShippingRateId] = useState(null)
  const [couponInput, setCouponInput] = useState('')
  const [couponQuote, setCouponQuote] = useState(null)
  const [couponChecking, setCouponChecking] = useState(false)
  const [quoteCity, setQuoteCity] = useState('')
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

  const set = (key, value) => {
    if (createdOrder) return // Pedido ya fijado: no modificar dirección ni tarifa sin cancelar.
    if (key === 'city' || key === 'department') setShippingRateId(null)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    const timeout = setTimeout(() => setQuoteCity(form.city.trim()), 350)
    return () => clearTimeout(timeout)
  }, [form.city])

  const { data: shippingQuotes = [], isLoading: shippingLoading, isError: shippingError } = useQuery({
    queryKey: ['shipping-quote', form.department, quoteCity],
    queryFn: () => apiClient.get('/shipping/quote', {
      params: { department: form.department, city: quoteCity },
    }).then(({ data }) => data),
    enabled: quoteCity.length >= 2 && Boolean(form.department),
    staleTime: 30_000,
  })
  const selectedShipping = shippingQuotes.find((rate) => rate.id === shippingRateId) || null
  const shippingAmount = selectedShipping ? Number(selectedShipping.price) : 0
  const couponDiscount = couponQuote ? Number(couponQuote.discount_amount) : 0
  const checkoutTotal = Number(total()) - couponDiscount + shippingAmount
  const cartFingerprint = items.map(({product,qty}) => `${product.id}:${qty}`).sort().join('|')
  const [validatedFingerprint, setValidatedFingerprint] = useState('')

  useEffect(() => {
    if (validatedFingerprint && validatedFingerprint !== cartFingerprint && !createdOrder) {
      setCouponQuote(null)
      setValidatedFingerprint('')
    }
  }, [cartFingerprint, validatedFingerprint, createdOrder])

  const checkCoupon = async () => {
    if (!couponInput.trim() || createdOrder) return
    setCouponChecking(true)
    try {
      const { data } = await apiClient.post('/promotions/quote', {
        code: couponInput.trim(),
        items: items.map(({product,qty}) => ({ product_id: product.id, qty })),
      })
      setCouponQuote(data)
      setValidatedFingerprint(cartFingerprint)
      toast.success('Cupón validado para esta cotización')
    } catch (err) {
      setCouponQuote(null)
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'El cupón no está disponible')
    } finally {
      setCouponChecking(false)
    }
  }

  const { data: methods = [], isError: methodsError } = useQuery({
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
            <CreditCard size={28} className="text-neutral-950" />
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

          {import.meta.env.VITE_ENABLE_DEMO_PAYMENTS === 'true' && !selectedMethodStatus.enabled && (
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

    // No confiar en cantidades ni precios del carrito persistido en el navegador.
    if (!items.length || items.some(({ product, qty }) =>
      !Number.isSafeInteger(qty) || qty <= 0 ||
      !Number.isFinite(Number(product.sale_price)) || Number(product.sale_price) < 0 ||
      (product.total_stock != null && qty > Number(product.total_stock))
    )) {
      toast.error('Revisa las cantidades y existencias de tu carrito')
      return
    }

    if (!selectedMethodStatus.enabled && import.meta.env.VITE_ENABLE_DEMO_PAYMENTS !== 'true') {
      toast.error('Este método de pago no está habilitado todavía')
      return
    }

    if (couponQuote && validatedFingerprint !== cartFingerprint) {
      toast.error('Actualiza la promoción para los artículos del carrito')
      return
    }

    if (shippingError || shippingLoading || !selectedShipping) {
      toast.error('Selecciona una tarifa de envío disponible para tu dirección')
      return
    }

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
        shipping_rate_id: selectedShipping.id,
        shipping_price_confirmed: selectedShipping.price,
        coupon_code: couponQuote?.code || null,
        discount_confirmed: couponQuote?.discount_amount || 0,
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

      // En un fallo de la pasarela reutilizar el pedido pendiente:
      // no reservar nuevamente el stock ni crear órdenes duplicadas.
      let order = createdOrder
      if (!order) {
        const { data } = await apiClient.post('/orders/web', orderPayload)
        order = data
        setCreatedOrder(order)
      }

      const paymentPayload = {
        order_number: order.order_number,
        method: selectedMethod,
        customer_phone: extraFields.customer_phone || form.phone,
        customer_id: extraFields.customer_id || '',
      }

      const { data: checkout } = await apiClient.post(
        '/payments/initiate',
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
    <div className="store-container store-section">
      <Link
        to="/carrito"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Volver al carrito
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_350px] xl:grid-cols-[minmax(0,1fr)_420px] gap-8 xl:gap-12 items-start">
        <form onSubmit={handleSubmit} className="store-card min-w-0">
          <div className="store-checkout-step mb-4"><strong>01</strong> ENTREGA Y PAGO</div>
          <h1 className="text-4xl font-black text-neutral-950 uppercase tracking-tight mb-8">FINALIZAR COMPRA</h1>

          {createdOrder && <p className="bg-amber-50 text-amber-900 text-sm p-4 mb-5" role="status">
            El pedido {createdOrder.order_number} ya tiene dirección, tarifa y total fijados.
            Para cambiarlos debes cancelar el pedido pendiente desde tu cuenta.
          </p>}
          <fieldset disabled={Boolean(createdOrder)} className="disabled:opacity-70">
          <div className="store-field-grid">
            <div className="md:col-span-2">
              <label className="store-label" htmlFor="checkout-full-name">Nombre completo</label>
              <input
                className="store-input"
                id="checkout-full-name" name="full_name" autoComplete="name" required maxLength={200}
                value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                placeholder="Nombre de quien recibe"
              />
            </div>

            <div>
              <label className="store-label" htmlFor="checkout-phone">Teléfono</label>
              <input
                className="store-input"
                id="checkout-phone" name="phone" autoComplete="tel" type="tel" required
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="3001234567"
              />
            </div>

            <div>
              <label className="store-label" htmlFor="checkout-postal">Código postal</label>
              <input
                className="store-input"
                id="checkout-postal" name="postal_code" autoComplete="postal-code"
                value={form.postal_code}
                onChange={(e) => set('postal_code', e.target.value)}
                placeholder="Opcional"
              />
            </div>

            <div className="md:col-span-2">
              <label className="store-label" htmlFor="checkout-street">Dirección principal</label>
              <input
                className="store-input"
                id="checkout-street" name="street-address" autoComplete="street-address" required
                value={form.address_line1}
                onChange={(e) => set('address_line1', e.target.value)}
                placeholder="Dirección de entrega"
              />
            </div>

            <div className="md:col-span-2">
              <label className="store-label" htmlFor="checkout-address2">Dirección complementaria</label>
              <input
                className="store-input"
                id="checkout-address2" name="address-line2" autoComplete="address-line2"
                value={form.address_line2}
                onChange={(e) => set('address_line2', e.target.value)}
                placeholder="Apto, torre, referencia, etc. (opcional)"
              />
            </div>

            <div>
              <label className="store-label" htmlFor="checkout-city">Ciudad</label>
              <input
                className="store-input"
                id="checkout-city" name="address-level2" autoComplete="address-level2" required
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Ciudad de entrega"
              />
            </div>

            <div>
              <label className="store-label" htmlFor="checkout-department">Departamento</label>
              <select
                className="store-input"
                id="checkout-department" name="address-level1" autoComplete="address-level1" required
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
          </fieldset>

          <div className="mt-8">
            <h2 className="font-bold text-lg uppercase mb-3">Selecciona el envío</h2>
            {shippingLoading && <p className="text-sm text-neutral-500" role="status">Cotizando transportadoras…</p>}
            {shippingError && <p className="text-sm text-red-700" role="alert">No se pudieron consultar las tarifas. Revisa la conexión.</p>}
            {!shippingLoading && !shippingError && quoteCity.length >= 2 && shippingQuotes.length === 0 &&
              <p className="text-sm text-amber-800 bg-amber-50 p-4" role="status">
                No hay una tarifa configurada para esta ciudad. Aún no es posible continuar al pago.
              </p>}
            {quoteCity.length < 2 && <p className="text-sm text-neutral-500">Ingresa una ciudad para ver precios de entrega.</p>}
            <div className="space-y-2">
              {shippingQuotes.map((rate) => (
                <label key={rate.id} className={`flex items-center justify-between gap-3 border p-4 cursor-pointer ${shippingRateId === rate.id ? 'border-black bg-neutral-50' : 'border-neutral-200'}`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="shipping_rate" value={rate.id}
                      checked={shippingRateId === rate.id}
                      disabled={Boolean(createdOrder)}
                      onChange={() => setShippingRateId(rate.id)} />
                    <span className="text-sm">
                      <strong className="block">{rate.carrier} · {rate.service}</strong>
                      <span className="text-neutral-500">{rate.days_min}–{rate.days_max} días estimados</span>
                    </span>
                  </span>
                  <strong className="shrink-0 text-sm">{formatCOP(rate.price)}</strong>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-8 border border-neutral-200 p-4 rounded-xl">
            <h2 className="font-bold text-lg uppercase mb-3">Cupón de descuento</h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" aria-label="Código promocional" className="store-input flex-1"
                value={couponInput} maxLength={32} disabled={Boolean(createdOrder)}
                onChange={e => {
                  setCouponInput(e.target.value.toUpperCase())
                  setCouponQuote(null)
                  setValidatedFingerprint('')
                }}
                placeholder="Código promocional" />
              <button type="button" className="btn-secondary" onClick={checkCoupon}
                disabled={couponChecking || Boolean(createdOrder) || !couponInput.trim()}>
                {couponChecking ? 'Verificando…' : 'Aplicar cupón'}
              </button>
            </div>
            {couponQuote && <div className="mt-3 flex items-center justify-between text-sm text-emerald-800" role="status">
              <span>Aplicado: {couponQuote.code}</span>
              <strong>− {formatCOP(couponQuote.discount_amount)}</strong>
            </div>}
            <p className="text-xs text-neutral-500 mt-2">
              El descuento se valida nuevamente al confirmar el pedido.
            </p>
          </div>

          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={18} className="text-neutral-950" />
              <h2 className="text-lg font-bold text-gray-900">Método de pago</h2>
            </div>

            {methodsError && <p role="alert" className="bg-red-50 text-red-800 text-sm p-4 mb-4">No pudimos consultar los métodos de pago. Comprueba tu conexión antes de continuar.</p>}
            <div className="space-y-3">
              {Object.entries(PAYMENT_METHODS).map(([key, config]) => {
                const methodStatus = getMethodStatus(key)
                const isSelected = selectedMethod === key

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedMethod(key)}
                    aria-pressed={isSelected}
                    disabled={Boolean(createdOrder) || (!methodStatus.enabled && import.meta.env.VITE_ENABLE_DEMO_PAYMENTS !== 'true')}
                    className={`w-full text-left border p-4 transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'border-neutral-950 bg-neutral-50'
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
                    <label className="store-label" htmlFor={`checkout-extra-${field.key}`}>
                      {field.label}
                    </label>
                    <input
                      className="store-input"
                      id={`checkout-extra-${field.key}`}
                      name={field.key}
                      required={field.required}
                      autoComplete="off"
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

          <div className="mt-8 bg-neutral-100 border border-neutral-200 p-5">
            <div className="flex items-start gap-3">
              <MapPin size={18} className="text-neutral-950 mt-0.5" />
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
            disabled={loading || methodsError || shippingError || shippingLoading || !selectedShipping}
            aria-busy={loading}
            className="store-button store-button-dark w-full mt-8"
          >
            {loading ? (
              <>
                <Loader size={18} className="animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CreditCard size={20} />
                Continuar al pago · {formatCOP(createdOrder?.total_amount ?? checkoutTotal)}
              </>
            )}
          </button>
        </form>

        <div className="min-w-0">
          <div className="store-responsive-summary">
            <h2 className="font-black text-neutral-950 uppercase text-xl mb-5">RESUMEN DEL PEDIDO</h2>

            <div className="space-y-3 pb-4 border-b border-gray-100">
              {items.map(({ product, qty }) => {
                const imgUrl = getItemImage(product)

                return (
                  <div key={product.id} className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-neutral-100 overflow-hidden flex-shrink-0">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={product.name}
                          className="w-full h-full object-contain"
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
              <span className="text-sm font-medium text-neutral-700">
                {selectedShipping ? formatCOP(selectedShipping.price) : 'Selecciona una tarifa'}
              </span>
            </div>

            {(couponQuote || createdOrder?.discount_amount > 0) && (
              <div className="flex justify-between items-center py-4 border-b border-gray-100 text-emerald-800">
                <span className="text-sm">Descuento {createdOrder?.coupon_code || couponQuote?.code || ''}</span>
                <strong>− {formatCOP(createdOrder?.discount_amount ?? couponDiscount)}</strong>
              </div>
            )}

            <div className="border-t border-neutral-200 pt-5 flex justify-between font-bold text-lg mt-4">
              <span>Total</span>
              <span className="text-neutral-950">{selectedShipping ? formatCOP(createdOrder?.total_amount ?? checkoutTotal) : '—'}</span>
            </div>

            <p className="text-xs text-neutral-500 mt-4">
              El total incluye el descuento aplicado y el envío. El servidor vuelve a validar el cupón, los productos y la tarifa antes de crear el pedido.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}