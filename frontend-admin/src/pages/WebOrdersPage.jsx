import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShoppingBag, Eye, ChevronDown, Search, MapPin } from 'lucide-react'
import { apiClient } from '../services/api'
import toast from 'react-hot-toast'

function formatCOP(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', maximumFractionDigits: 0
    }).format(n)
}

function formatDate(d) {
    return new Date(d).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS_OPTIONS = [
    { value: 'pending',   label: 'Pendiente',       color: 'badge-yellow' },
    { value: 'paid',      label: 'Pagado',           color: 'badge-green' },
    { value: 'preparing', label: 'En preparación',   color: 'badge-blue' },
    { value: 'shipped',   label: 'Enviado',          color: 'badge-blue' },
    { value: 'delivered', label: 'Entregado',        color: 'badge-green' },
    { value: 'cancelled', label: 'Cancelado',        color: 'badge-red' },
]

function getStatusInfo(status) {
    return STATUS_OPTIONS.find(s => s.value === status) || { label: status, color: 'badge-gray' }
}

// ── Modal detalle de orden ────────────────────────────────────────────────────
function OrderDetailModal({ order, onClose }) {
    const qc = useQueryClient()
    const [newStatus, setNewStatus] = useState(order.status)

    const updateMutation = useMutation({
        mutationFn: (status) => apiClient.patch(`/orders/${order.id}/status`, null, {
        params: { status }
        }),
        onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['web-orders'] })
        toast.success('Estado actualizado')
        onClose()
        },
        onError: (e) => toast.error(e.response?.data?.detail || 'Error al actualizar'),
    })

    const addr = order.shipping_address || {}
    const statusInfo = getStatusInfo(order.status)

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div>
                <h2 className="font-bold text-gray-900">Orden {order.order_number}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.created_at)}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>

            <div className="p-5 space-y-5">
            {/* Estado actual + cambio */}
            <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Estado del pedido</p>
                <div className="flex items-center gap-3">
                <span className={statusInfo.color}>{statusInfo.label}</span>
                <ChevronDown size={14} className="text-gray-400" />
                <select
                    className="input flex-1"
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                >
                    {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                </select>
                <button
                    onClick={() => updateMutation.mutate(newStatus)}
                    disabled={newStatus === order.status || updateMutation.isPending}
                    className="btn-primary text-xs px-3 py-2 whitespace-nowrap"
                >
                    {updateMutation.isPending ? 'Guardando...' : 'Actualizar'}
                </button>
                </div>
            </div>

            {/* Productos */}
            <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Productos</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between items-center px-4 py-2.5 border-b border-gray-50 last:border-0">
                    <div>
                        <p className="text-sm font-medium text-gray-900">{item.product_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{item.product_sku} ×{item.qty}</p>
                    </div>
                    <p className="font-bold text-gray-900 text-sm">{formatCOP(item.line_total)}</p>
                    </div>
                ))}
                <div className="flex justify-between items-center px-4 py-3 bg-gray-50">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="font-black text-brand-700 text-lg">{formatCOP(order.total_amount)}</span>
                </div>
                </div>
            </div>

            {/* Dirección */}
            {addr.full_name && (
                <div>
                <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <MapPin size={14} className="text-brand-500" /> Dirección de entrega
                </p>
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600 space-y-0.5">
                    <p className="font-semibold text-gray-900">{addr.full_name}</p>
                    <p>{addr.phone}</p>
                    <p>{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''}</p>
                    <p>{addr.city}, {addr.department}{addr.postal_code ? ` ${addr.postal_code}` : ''}</p>
                </div>
                </div>
            )}

            {/* Pago */}
            {order.payment_ref && (
                <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Referencia de pago</p>
                <p className="font-mono text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">{order.payment_ref}</p>
                </div>
            )}

            {order.notes && (
                <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Notas del cliente</p>
                <p className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">{order.notes}</p>
                </div>
            )}
            </div>

            <div className="p-5 border-t border-gray-100">
            <button onClick={onClose} className="btn-secondary w-full">Cerrar</button>
            </div>
        </div>
        </div>
    )
    }

    // ── Página principal ──────────────────────────────────────────────────────────
    export default function WebOrdersPage() {
    const [selectedOrder, setSelectedOrder] = useState(null)
    const [filterStatus, setFilterStatus] = useState('')
    const [search, setSearch] = useState('')

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['web-orders', filterStatus],
        queryFn: () => apiClient.get('/orders', {
        params: filterStatus ? { status_filter: filterStatus } : {}
        }).then(r => r.data),
    })

    const filtered = orders.filter(o =>
        !search ||
        o.order_number.toLowerCase().includes(search.toLowerCase()) ||
        o.shipping_address?.full_name?.toLowerCase().includes(search.toLowerCase())
    )

    const totalRevenue = filtered
        .filter(o => ['paid','preparing','shipped','delivered'].includes(o.status))
        .reduce((acc, o) => acc + o.total_amount, 0)

    return (
        <div>
        <div className="flex items-center justify-between mb-6">
            <div>
            <h1 className="text-2xl font-bold text-gray-900">Pedidos Web</h1>
            <p className="text-sm text-gray-500 mt-1">
                {filtered.length} pedidos · {formatCOP(totalRevenue)} en ventas confirmadas
            </p>
            </div>
        </div>

        {/* Filtros */}
        <div className="card mb-4 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
                className="input pl-9 text-sm"
                placeholder="Buscar por orden o cliente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
            />
            </div>
            <div className="flex gap-2 flex-wrap">
            {[{ value: '', label: 'Todos' }, ...STATUS_OPTIONS].map(s => (
                <button
                key={s.value}
                onClick={() => setFilterStatus(s.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    filterStatus === s.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                >
                {s.label}
                </button>
            ))}
            </div>
        </div>

        {/* Tabla */}
        <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Orden</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Cliente</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Ciudad</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-semibold">Total</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Estado</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Fecha</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Ver</th>
                </tr>
                </thead>
                <tbody>
                {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                        {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                        ))}
                    </tr>
                    ))
                ) : filtered.length === 0 ? (
                    <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                        <ShoppingBag size={40} className="text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">No hay pedidos con estos filtros</p>
                    </td>
                    </tr>
                ) : filtered.map(order => {
                    const si = getStatusInfo(order.status)
                    const addr = order.shipping_address || {}
                    return (
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-gray-700">{order.order_number}</span>
                        </td>
                        <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 text-sm">{addr.full_name || '—'}</p>
                        <p className="text-xs text-gray-400">{addr.phone || ''}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                        {addr.city ? `${addr.city}, ${addr.department}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {formatCOP(order.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                        <span className={si.color}>{si.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(order.created_at)}</td>
                        <td className="px-4 py-3 text-center">
                        <button
                            onClick={() => setSelectedOrder(order)}
                            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        >
                            <Eye size={15} />
                        </button>
                        </td>
                    </tr>
                    )
                })}
                </tbody>
            </table>
            </div>
        </div>

        {selectedOrder && (
            <OrderDetailModal
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            />
        )}
        </div>
    )
}
