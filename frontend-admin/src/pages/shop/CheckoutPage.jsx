import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ShoppingBag, MapPin, CheckCircle, ArrowLeft, Truck } from 'lucide-react'
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
    const [loading, setLoading] = useState(false)
    const [confirmedOrder, setConfirmedOrder] = useState(null)

    const [form, setForm] = useState({
        full_name: '',
        phone: '',
        address_line1: '',
        address_line2: '',
        city: '',
        department: 'Atlántico',
        postal_code: '',
    })

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

    if (items.length === 0 && !confirmedOrder) {
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

    // Pantalla de confirmación
    if (confirmedOrder) {
        return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-green-600" />
            </div>
            <h1 className="text-3xl font-black text-gray-900 mb-2">¡Pedido recibido!</h1>
            <p className="text-gray-500 mb-2">Gracias por tu compra</p>
            <p className="text-sm text-gray-400 mb-8">
            Número de orden: <span className="font-mono font-bold text-gray-700">{confirmedOrder.order_number}</span>
            </p>

            <div className="card text-left mb-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ShoppingBag size={16} className="text-brand-600" /> Resumen del pedido
            </h3>
            <div className="space-y-2 mb-4">
                {confirmedOrder.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.product_name} ×{item.qty}</span>
                    <span className="font-medium">{formatCOP(item.line_total)}</span>
                </div>
                ))}
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-brand-700">{formatCOP(confirmedOrder.total_amount)}</span>
            </div>
            </div>

            <div className="card text-left mb-8">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Truck size={16} className="text-brand-600" /> Dirección de envío
            </h3>
            <p className="text-sm text-gray-600">{confirmedOrder.shipping_address.full_name}</p>
            <p className="text-sm text-gray-600">{confirmedOrder.shipping_address.address_line1}</p>
            {confirmedOrder.shipping_address.address_line2 && (
                <p className="text-sm text-gray-600">{confirmedOrder.shipping_address.address_line2}</p>
            )}
            <p className="text-sm text-gray-600">
                {confirmedOrder.shipping_address.city}, {confirmedOrder.shipping_address.department}
            </p>
            </div>

            <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-8">
            <p className="text-sm text-brand-700 font-medium">
                Te contactaremos pronto para coordinar el pago y la entrega.
            </p>
            </div>

            <div className="flex gap-3">
            <Link to="/" className="btn-secondary flex-1">Ir al inicio</Link>
            <Link to="/mi-cuenta" className="btn-primary flex-1">Ver mis pedidos</Link>
            </div>
        </div>
        )
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (items.length === 0) return

        setLoading(true)
        try {
        const payload = {
            items: items.map(({ product, qty }) => ({
            product_id: product.id,
            qty,
            })),
            shipping_address: {
            full_name: form.full_name,
            phone: form.phone,
            address_line1: form.address_line1,
            address_line2: form.address_line2 || undefined,
            city: form.city,
            department: form.department,
            postal_code: form.postal_code || undefined,
            },
        }

        const { data } = await apiClient.post('/orders/web', payload)
        clearCart()
        setConfirmedOrder(data)
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
            {/* Formulario */}
            <form onSubmit={handleSubmit} className="flex-1 space-y-6">
            {/* Dirección */}
            <div className="card">
                <h2 className="font-bold text-gray-900 text-lg mb-5 flex items-center gap-2">
                <MapPin size={18} className="text-brand-600" /> Dirección de entrega
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                    <input
                    className="input" required value={form.full_name}
                    onChange={e => set('full_name', e.target.value)}
                    placeholder="¿Quién recibe el pedido?"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
                    <input
                    className="input" required value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="+57 300 000 0000"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Departamento *</label>
                    <select
                    className="input" required value={form.department}
                    onChange={e => set('department', e.target.value)}
                    >
                    {DEPARTAMENTOS.map(d => (
                        <option key={d} value={d}>{d}</option>
                    ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad *</label>
                    <input
                    className="input" required value={form.city}
                    onChange={e => set('city', e.target.value)}
                    placeholder="Barranquilla"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Código postal</label>
                    <input
                    className="input" value={form.postal_code}
                    onChange={e => set('postal_code', e.target.value)}
                    placeholder="080001"
                    />
                </div>

                <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección *</label>
                    <input
                    className="input" required value={form.address_line1}
                    onChange={e => set('address_line1', e.target.value)}
                    placeholder="Cra 53 #82-15"
                    />
                </div>

                <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                    Información adicional (apto, barrio...)
                    </label>
                    <input
                    className="input" value={form.address_line2}
                    onChange={e => set('address_line2', e.target.value)}
                    placeholder="Apto 301, Barrio El Prado"
                    />
                </div>
                </div>
            </div>

            {/* Método de pago (próximamente Wompi) */}
            <div className="card">
                <h2 className="font-bold text-gray-900 text-lg mb-4 flex items-center gap-2">
                <ShoppingBag size={18} className="text-brand-600" /> Método de pago
                </h2>
                <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-brand-800 mb-1">
                    Pago contra entrega / transferencia
                </p>
                <p className="text-sm text-brand-600">
                    Te contactaremos para coordinar el pago. Próximamente habilitaremos pago en línea con tarjeta y PSE.
                </p>
                </div>
            </div>

            <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3"
            >
                {loading
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><CheckCircle size={20} /> Confirmar pedido · {formatCOP(total())}</>
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
                    ? (product.primary_image.startsWith('http')
                        ? product.primary_image
                        : `${API_URL}${product.primary_image}`)
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

                <div className="py-3 space-y-2">
                <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span>{formatCOP(total())}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                    <span>Envío</span>
                    <span className="text-green-600 font-medium">Por coordinar</span>
                </div>
                </div>

                <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-brand-700">{formatCOP(total())}</span>
                </div>
            </div>
            </div>
        </div>
        </div>
    )
}
