import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Search,
    Package,
    Clock,
    CheckCircle,
    Truck,
    XCircle,
    Eye,
    MapPin,
    User,
    Phone,
    ChevronDown,
    X,
} from 'lucide-react'
import { ordersApi } from '../services/api'
import toast from 'react-hot-toast'

function formatCOP(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
    }).format(Number(n || 0))
}

function formatDate(d) {
    return new Date(d).toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short',
    })
    }

    const STATUS_META = {
    pending: {
        label: 'Pendiente',
        icon: Clock,
        badge: 'bg-amber-100 text-amber-700',
    },
    paid: {
        label: 'Pagado',
        icon: CheckCircle,
        badge: 'bg-green-100 text-green-700',
    },
    preparing: {
        label: 'En preparación',
        icon: Package,
        badge: 'bg-blue-100 text-blue-700',
    },
    shipped: {
        label: 'Enviado',
        icon: Truck,
        badge: 'bg-indigo-100 text-indigo-700',
    },
    delivered: {
        label: 'Entregado',
        icon: CheckCircle,
        badge: 'bg-emerald-100 text-emerald-700',
    },
    cancelled: {
        label: 'Cancelado',
        icon: XCircle,
        badge: 'bg-red-100 text-red-700',
    },
}

const STATUS_OPTIONS = [
    { value: '', label: 'Todos los estados' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'paid', label: 'Pagado' },
    { value: 'preparing', label: 'En preparación' },
    { value: 'shipped', label: 'Enviado' },
    { value: 'delivered', label: 'Entregado' },
    { value: 'cancelled', label: 'Cancelado' },
]

const NEXT_STATUS_OPTIONS = ['pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled']

function OrderDetailModal({ order, onClose }) {
    if (!order) return null

    const statusInfo = STATUS_META[order.status] || STATUS_META.pending
    const StatusIcon = statusInfo.icon
    const shipping = order.shipping_address || {}

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
                <h3 className="text-lg font-bold text-gray-900">Detalle del pedido web</h3>
                <p className="text-sm text-gray-500 mt-1">{order.order_number}</p>
            </div>
            <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
                <X size={18} />
            </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 border-b border-gray-100">
            <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Estado</p>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${statusInfo.badge}`}>
                <StatusIcon size={14} />
                {statusInfo.label}
                </div>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Fecha</p>
                <p className="font-semibold text-gray-900">{formatDate(order.created_at)}</p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Subtotal</p>
                <p className="font-bold text-gray-900">{formatCOP(order.subtotal)}</p>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Total</p>
                <p className="font-black text-brand-700">{formatCOP(order.total_amount)}</p>
            </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
                <h4 className="font-bold text-gray-900 mb-4">Productos del pedido</h4>

                <div className="space-y-3">
                {(order.items || []).map((item, idx) => (
                    <div
                    key={`${order.id}-${idx}`}
                    className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
                    >
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{item.product_name}</p>
                        <p className="text-xs text-gray-400 mt-1">SKU: {item.product_sku}</p>
                        <p className="text-xs text-gray-500 mt-1">
                        {formatCOP(item.unit_price)} × {item.qty}
                        </p>
                    </div>

                    <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900">{formatCOP(item.line_total)}</p>
                    </div>
                    </div>
                ))}
                </div>

                {order.notes && (
                <div className="mt-6 rounded-xl bg-gray-50 border border-gray-100 p-4">
                    <p className="text-sm font-medium text-gray-700 mb-1">Notas</p>
                    <p className="text-sm text-gray-600">{order.notes}</p>
                </div>
                )}
            </div>

            <div className="lg:col-span-2">
                <h4 className="font-bold text-gray-900 mb-4">Datos de envío</h4>

                <div className="space-y-3">
                <div className="rounded-xl border border-gray-100 p-4">
                    <div className="flex items-start gap-3">
                    <User size={16} className="text-brand-600 mt-0.5" />
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Cliente</p>
                        <p className="font-semibold text-gray-900 mt-1">
                        {shipping.full_name || 'No disponible'}
                        </p>
                    </div>
                    </div>
                </div>

                <div className="rounded-xl border border-gray-100 p-4">
                    <div className="flex items-start gap-3">
                    <Phone size={16} className="text-brand-600 mt-0.5" />
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Teléfono</p>
                        <p className="font-semibold text-gray-900 mt-1">
                        {shipping.phone || 'No disponible'}
                        </p>
                    </div>
                    </div>
                </div>

                <div className="rounded-xl border border-gray-100 p-4">
                    <div className="flex items-start gap-3">
                    <MapPin size={16} className="text-brand-600 mt-0.5" />
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Dirección</p>
                        <p className="font-semibold text-gray-900 mt-1">
                        {shipping.address_line1 || 'No disponible'}
                        </p>
                        {shipping.address_line2 && (
                        <p className="text-sm text-gray-500 mt-1">{shipping.address_line2}</p>
                        )}
                        <p className="text-sm text-gray-500 mt-2">
                        {[shipping.city, shipping.department].filter(Boolean).join(', ') || 'No disponible'}
                        </p>
                        {shipping.postal_code && (
                        <p className="text-xs text-gray-400 mt-1">CP: {shipping.postal_code}</p>
                        )}
                    </div>
                    </div>
                </div>

                <div className="rounded-xl bg-brand-50 border border-brand-100 p-4">
                    <p className="text-sm text-gray-500 mb-1">Total del pedido</p>
                    <p className="text-2xl font-black text-brand-700">{formatCOP(order.total_amount)}</p>
                </div>
                </div>
            </div>
            </div>
        </div>
        </div>
    )
}

export default function WebOrdersPage() {
    const queryClient = useQueryClient()

    const [statusFilter, setStatusFilter] = useState('')
    const [search, setSearch] = useState('')
    const [selectedOrder, setSelectedOrder] = useState(null)

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['web-orders-list', statusFilter],
        queryFn: () =>
        ordersApi
            .list(statusFilter ? { status_filter: statusFilter } : {})
            .then((r) => r.data),
    })

    const filteredOrders = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return orders

        return orders.filter((order) => {
        const shipping = order.shipping_address || {}
        return (
            String(order.order_number || '').toLowerCase().includes(term) ||
            String(shipping.full_name || '').toLowerCase().includes(term) ||
            String(shipping.phone || '').toLowerCase().includes(term) ||
            String(shipping.city || '').toLowerCase().includes(term) ||
            String(shipping.department || '').toLowerCase().includes(term)
        )
        })
    }, [orders, search])

    const totals = useMemo(() => {
        const totalOrders = filteredOrders.length
        const totalRevenue = filteredOrders.reduce(
        (acc, o) => acc + Number(o.total_amount || 0),
        0
        )
        const pendingOrders = filteredOrders.filter((o) => o.status === 'pending').length
        const paidOrders = filteredOrders.filter((o) => o.status === 'paid').length

        return {
        totalOrders,
        totalRevenue,
        pendingOrders,
        paidOrders,
        }
    }, [filteredOrders])

    const statusMutation = useMutation({
        mutationFn: async ({ id, status }) => {
        const { data } = await ordersApi.updateStatus(id, status)
        return data
        },
        onSuccess: (_, vars) => {
        toast.success(`Pedido actualizado a ${vars.status}`)
        queryClient.invalidateQueries({ queryKey: ['web-orders-list'] })
        },
        onError: (error) => {
        toast.error(
            error?.response?.data?.detail || 'No fue posible actualizar el estado del pedido'
        )
        },
    })

    const handleStatusChange = (orderId, newStatus) => {
        statusMutation.mutate({ id: orderId, status: newStatus })
    }

    return (
        <div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
            <h1 className="text-2xl font-bold text-gray-900">Pedidos web</h1>
            <p className="text-sm text-gray-500 mt-1">
                Gestión de pedidos realizados desde la tienda en línea
            </p>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="card">
            <p className="text-sm text-gray-500">Pedidos</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{totals.totalOrders}</p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Ingresos</p>
            <p className="text-2xl font-black text-brand-700 mt-2">
                {formatCOP(totals.totalRevenue)}
            </p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Pendientes</p>
            <p className="text-2xl font-black text-amber-600 mt-2">{totals.pendingOrders}</p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Pagados</p>
            <p className="text-2xl font-black text-green-700 mt-2">{totals.paidOrders}</p>
            </div>
        </div>

        <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div>
                <h2 className="font-bold text-gray-900">Listado de pedidos web</h2>
                <p className="text-xs text-gray-500 mt-1">
                {filteredOrders.length} resultados
                </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <div className="relative min-w-[260px]">
                <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                    className="input pl-9"
                    placeholder="Buscar por orden, cliente, teléfono o ciudad..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                </div>

                <div className="relative min-w-[220px]">
                <ChevronDown
                    size={15}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <select
                    className="input appearance-none pr-9"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value || 'all'} value={opt.value}>
                        {opt.label}
                    </option>
                    ))}
                </select>
                </div>
            </div>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Orden</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Cliente</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Destino</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-semibold">Total</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Estado</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Fecha</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Actualizar</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Detalle</th>
                </tr>
                </thead>

                <tbody>
                {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                        {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                        ))}
                    </tr>
                    ))
                ) : filteredOrders.length === 0 ? (
                    <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                        <Package size={40} className="text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">No hay pedidos web para mostrar</p>
                    </td>
                    </tr>
                ) : (
                    filteredOrders.map((order) => {
                    const shipping = order.shipping_address || {}
                    const statusInfo = STATUS_META[order.status] || STATUS_META.pending
                    const StatusIcon = statusInfo.icon

                    return (
                        <tr
                        key={order.id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                        >
                        <td className="px-4 py-3">
                            <span className="font-mono text-xs font-bold text-gray-700">
                            {order.order_number}
                            </span>
                        </td>

                        <td className="px-4 py-3">
                            <div className="min-w-0">
                            <p className="font-medium text-gray-900 line-clamp-1">
                                {shipping.full_name || 'No disponible'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                {shipping.phone || 'Sin teléfono'}
                            </p>
                            </div>
                        </td>

                        <td className="px-4 py-3">
                            <div className="min-w-0">
                            <p className="text-gray-900 text-sm line-clamp-1">
                                {shipping.address_line1 || 'Dirección no disponible'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                {[shipping.city, shipping.department].filter(Boolean).join(', ') || 'Sin ciudad'}
                            </p>
                            </div>
                        </td>

                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                            {formatCOP(order.total_amount)}
                        </td>

                        <td className="px-4 py-3 text-center">
                            <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusInfo.badge}`}
                            >
                            <StatusIcon size={12} />
                            {statusInfo.label}
                            </span>
                        </td>

                        <td className="px-4 py-3 text-xs text-gray-500">
                            {formatDate(order.created_at)}
                        </td>

                        <td className="px-4 py-3 text-center">
                            <select
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                            value={order.status}
                            onChange={(e) => handleStatusChange(order.id, e.target.value)}
                            disabled={statusMutation.isPending}
                            >
                            {NEXT_STATUS_OPTIONS.map((status) => (
                                <option key={`${order.id}-${status}`} value={status}>
                                {STATUS_META[status]?.label || status}
                                </option>
                            ))}
                            </select>
                        </td>

                        <td className="px-4 py-3 text-center">
                            <button
                            onClick={() => setSelectedOrder(order)}
                            className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 text-xs font-semibold"
                            >
                            <Eye size={13} />
                            Ver
                            </button>
                        </td>
                        </tr>
                    )
                    })
                )}
                </tbody>
            </table>
            </div>
        </div>

        {selectedOrder && (
            <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
        )}
        </div>
    )
}