import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ShoppingBag, Package, Clock, CheckCircle, Truck, XCircle } from 'lucide-react'
import { apiClient } from '../../services/api'
import { useAuthStore } from '../../store'

function formatCOP(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', maximumFractionDigits: 0
    }).format(n)
}

function formatDate(d) {
    return new Date(d).toLocaleDateString('es-CO', {
        year: 'numeric', month: 'long', day: 'numeric'
    })
}

const STATUS_INFO = {
    pending:   { label: 'Pendiente',      icon: Clock,        color: 'badge-yellow' },
    paid:      { label: 'Pagado',         icon: CheckCircle,  color: 'badge-green' },
    preparing: { label: 'En preparación', icon: Package,      color: 'badge-blue' },
    shipped:   { label: 'Enviado',        icon: Truck,        color: 'badge-blue' },
    delivered: { label: 'Entregado',      icon: CheckCircle,  color: 'badge-green' },
    cancelled: { label: 'Cancelado',      icon: XCircle,      color: 'badge-red' },
}

export default function AccountPage() {
    const { user, logout } = useAuthStore()

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['my-orders'],
        queryFn: () => apiClient.get('/orders/my-orders').then(r => r.data),
    })

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Mi cuenta</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1">
            <div className="card">
                <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center">
                    <span className="text-brand-700 font-black text-xl">
                    {user?.fullName?.[0]?.toUpperCase() || '?'}
                    </span>
                </div>
                <div>
                    <p className="font-bold text-gray-900">{user?.fullName}</p>
                    <p className="text-sm text-gray-500 capitalize">{user?.role}</p>
                </div>
                </div>

                <div className="space-y-1">
                <div className="flex justify-between text-sm py-2 border-b border-gray-50">
                    <span className="text-gray-500">Pedidos</span>
                    <span className="font-semibold text-gray-900">{orders.length}</span>
                </div>
                <div className="flex justify-between text-sm py-2 border-b border-gray-50">
                    <span className="text-gray-500">Pendientes</span>
                    <span className="font-semibold text-gray-900">
                    {orders.filter(o => o.status === 'pending').length}
                    </span>
                </div>
                </div>

                <button
                onClick={logout}
                className="btn-secondary w-full mt-5 text-sm"
                >
                Cerrar sesión
                </button>
            </div>
            </div>

            {/* Pedidos */}
            <div className="lg:col-span-2 space-y-4">
            <h2 className="font-bold text-gray-900 text-lg">Mis pedidos</h2>

            {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card animate-pulse">
                    <div className="h-5 bg-gray-100 rounded w-1/3 mb-3" />
                    <div className="h-4 bg-gray-100 rounded w-1/2" />
                </div>
                ))
            ) : orders.length === 0 ? (
                <div className="card text-center py-12">
                <ShoppingBag size={48} className="text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">Todavía no tienes pedidos</p>
                <Link to="/catalogo" className="btn-primary inline-flex items-center gap-2">
                    Explorar catálogo
                </Link>
                </div>
            ) : orders.map(order => {
                const statusInfo = STATUS_INFO[order.status] || STATUS_INFO.pending
                const StatusIcon = statusInfo.icon

                return (
                <div key={order.id} className="card">
                    <div className="flex items-start justify-between mb-4">
                    <div>
                        <p className="font-mono font-bold text-gray-900 text-sm">{order.order_number}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.created_at)}</p>
                    </div>
                    <span className={`${statusInfo.color} flex items-center gap-1`}>
                        <StatusIcon size={12} />
                        {statusInfo.label}
                    </span>
                    </div>

                    {/* Items */}
                    <div className="space-y-1.5 mb-4">
                    {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.product_name} ×{item.qty}</span>
                        <span className="font-medium text-gray-900">{formatCOP(item.line_total)}</span>
                        </div>
                    ))}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                        <span>Envío a: </span>
                        <span className="font-medium text-gray-700">
                        {order.shipping_address?.city}, {order.shipping_address?.department}
                        </span>
                    </div>
                    <div className="font-bold text-brand-700">
                        {formatCOP(order.total_amount)}
                    </div>
                    </div>

                    {order.status === 'pending' && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <p className="text-xs text-amber-700">
                        Tu pedido está pendiente de pago. Te contactaremos pronto.
                        </p>
                    </div>
                    )}
                </div>
                )
            })}
            </div>
        </div>
        </div>
    )
}
