import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    BarChart2, Download, ShoppingBag, Globe, TrendingUp,
    Calendar, Package, MapPin, FileText
} from 'lucide-react'
import { apiClient } from '../services/api'

function formatCOP(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', maximumFractionDigits: 0
    }).format(n || 0)
}

function formatDate(d) {
    return new Date(d).toLocaleDateString('es-CO', {
        year: 'numeric', month: 'short', day: 'numeric'
    })
}

// ── Utilidad: exportar a CSV ──────────────────────────────────────────────────
function exportToCSV(data, filename) {
    if (!data || data.length === 0) return

    const headers = Object.keys(data[0])
    const rows = data.map(row =>
        headers.map(h => {
        const val = row[h]
        if (val === null || val === undefined) return ''
        const str = String(val)
        return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str
        }).join(',')
    )

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

// ── Tarjeta de resumen ────────────────────────────────────────────────────────
function SummaryCard({ icon: Icon, label, value, sub, color }) {
    return (
        <div className="card flex items-center gap-4">
        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
            <Icon size={22} className="text-white" />
        </div>
        <div>
            <p className="text-xs text-gray-400 font-medium">{label}</p>
            <p className="text-xl font-black text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-500">{sub}</p>}
        </div>
        </div>
    )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ReportsPage() {
    const currentYear = new Date().getFullYear()
    const [year, setYear] = useState(currentYear)
    const [activeTab, setActiveTab] = useState('ventas')

    // Datos del dashboard
    const { data: summary } = useQuery({
        queryKey: ['analytics', 'summary'],
        queryFn: () => apiClient.get('/analytics/dashboard').then(r => r.data),
    })

    // Ventas por mes
    const { data: salesByMonth = [], isLoading: loadingMonths } = useQuery({
        queryKey: ['analytics', 'sales-month', year],
        queryFn: () => apiClient.get('/analytics/sales-by-month', { params: { year } }).then(r => r.data),
    })

    // Top productos
    const { data: topProducts = [], isLoading: loadingTop } = useQuery({
        queryKey: ['analytics', 'top-products'],
        queryFn: () => apiClient.get('/analytics/top-products', { params: { limit: 20 } }).then(r => r.data),
    })

    // Ventas físicas (todas)
    const { data: physicalSales = [], isLoading: loadingPhysical } = useQuery({
        queryKey: ['physical-sales-report'],
        queryFn: () => apiClient.get('/physical-sales').then(r => r.data),
    })

    // Pedidos web
    const { data: webOrders = [], isLoading: loadingWeb } = useQuery({
        queryKey: ['web-orders-report'],
        queryFn: () => apiClient.get('/orders').then(r => r.data),
    })

    // ── Exportadores ─────────────────────────────────────────────────────────────
    const exportVentasMensuales = () => {
        const data = salesByMonth.map(m => ({
        'Mes': m.month_label || m.month,
        'Año': m.year || year,
        'Ventas (COP)': m.revenue || 0,
        'Número de órdenes': m.order_count || 0,
        'Ticket promedio (COP)': m.avg_ticket || 0,
        'Ganancia bruta (COP)': m.profit || 0,
        }))
        exportToCSV(data, 'ventas_mensuales')
    }

    const exportTopProductos = () => {
        const data = topProducts.map((p, i) => ({
        'Posición': i + 1,
        'Producto': p.product_name || p.name,
        'SKU': p.sku || '',
        'Unidades vendidas': p.qty_sold || p.total_qty || 0,
        'Ingresos (COP)': p.revenue || p.total_revenue || 0,
        'Ganancia bruta (COP)': p.profit || 0,
        }))
        exportToCSV(data, 'top_productos')
    }

    const exportVentasFisicas = () => {
        const rows = []
        physicalSales.forEach(sale => {
        sale.items?.forEach(item => {
            rows.push({
            'Número orden': sale.order_number,
            'Punto': sale.location_name,
            'Fecha': formatDate(sale.created_at),
            'Producto': item.product_name,
            'SKU': item.product_sku,
            'Cantidad': item.qty,
            'Precio unitario (COP)': item.unit_price,
            'Total línea (COP)': item.line_total,
            'Ganancia (COP)': item.gross_profit,
            'Total orden (COP)': sale.total_amount,
            })
        })
        })
        exportToCSV(rows, 'ventas_fisicas')
    }

    const exportPedidosWeb = () => {
        const rows = []
        webOrders.forEach(order => {
        order.items?.forEach(item => {
            rows.push({
            'Número orden': order.order_number,
            'Estado': order.status,
            'Fecha': formatDate(order.created_at),
            'Cliente': order.shipping_address?.full_name || '',
            'Ciudad': order.shipping_address?.city || '',
            'Departamento': order.shipping_address?.department || '',
            'Producto': item.product_name,
            'SKU': item.product_sku,
            'Cantidad': item.qty,
            'Precio unitario (COP)': item.unit_price,
            'Total línea (COP)': item.line_total,
            'Total orden (COP)': order.total_amount,
            })
        })
        })
        exportToCSV(rows, 'pedidos_web')
    }

    const TABS = [
        { id: 'ventas',    label: 'Ventas mensuales', icon: TrendingUp },
        { id: 'productos', label: 'Top productos',    icon: Package },
        { id: 'fisicas',   label: 'Ventas físicas',   icon: MapPin },
        { id: 'web',       label: 'Pedidos web',       icon: Globe },
    ]

    return (
        <div>
        <div className="flex items-center justify-between mb-6">
            <div>
            <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
            <p className="text-sm text-gray-500 mt-1">Exporta la información del negocio a CSV</p>
            </div>
        </div>

        {/* KPIs rápidos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            <SummaryCard
            icon={TrendingUp} color="bg-brand-600"
            label="Ventas del mes"
            value={formatCOP(summary?.revenue_this_month)}
            sub="Ingresos totales"
            />
            <SummaryCard
            icon={ShoppingBag} color="bg-green-500"
            label="Pedidos del mes"
            value={summary?.orders_this_month || 0}
            sub={`Ticket promedio: ${formatCOP(summary?.avg_ticket)}`}
            />
            <SummaryCard
            icon={BarChart2} color="bg-purple-500"
            label="Ganancia bruta"
            value={formatCOP(summary?.profit_this_month)}
            sub="Ingresos menos costos"
            />
            <SummaryCard
            icon={FileText} color="bg-amber-500"
            label="Total pedidos web"
            value={webOrders.length}
            sub={`${physicalSales.length} ventas físicas`}
            />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
            {TABS.map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === tab.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
            >
                <tab.icon size={15} />
                {tab.label}
            </button>
            ))}
        </div>

        {/* ── TAB: Ventas mensuales ─────────────────────────────── */}
        {activeTab === 'ventas' && (
            <div className="card">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                <h2 className="font-bold text-gray-900">Ventas mensuales</h2>
                <select
                    className="input py-1 text-sm w-28"
                    value={year}
                    onChange={e => setYear(parseInt(e.target.value))}
                >
                    {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                    <option key={y} value={y}>{y}</option>
                    ))}
                </select>
                </div>
                <button
                onClick={exportVentasMensuales}
                disabled={salesByMonth.length === 0}
                className="btn-secondary flex items-center gap-2 text-sm"
                >
                <Download size={15} /> Exportar CSV
                </button>
            </div>

            {loadingMonths ? (
                <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ))}
                </div>
            ) : salesByMonth.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay datos para {year}</p>
            ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                    <tr>
                        {['Mes', 'Órdenes', 'Ingresos', 'Ticket promedio', 'Ganancia bruta'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-gray-500 font-semibold text-xs">{h}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {salesByMonth.map((m, i) => (
                        <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{m.month_label || m.month}</td>
                        <td className="px-4 py-2.5 text-gray-600">{m.order_count || 0}</td>
                        <td className="px-4 py-2.5 font-bold text-brand-700">{formatCOP(m.revenue)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{formatCOP(m.avg_ticket)}</td>
                        <td className="px-4 py-2.5 text-green-700 font-semibold">{formatCOP(m.profit)}</td>
                        </tr>
                    ))}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200">
                    <tr className="bg-gray-50">
                        <td className="px-4 py-2.5 font-bold text-gray-900">Total {year}</td>
                        <td className="px-4 py-2.5 font-bold">{salesByMonth.reduce((a, m) => a + (m.order_count || 0), 0)}</td>
                        <td className="px-4 py-2.5 font-black text-brand-700">{formatCOP(salesByMonth.reduce((a, m) => a + (m.revenue || 0), 0))}</td>
                        <td className="px-4 py-2.5"></td>
                        <td className="px-4 py-2.5 font-bold text-green-700">{formatCOP(salesByMonth.reduce((a, m) => a + (m.profit || 0), 0))}</td>
                    </tr>
                    </tfoot>
                </table>
                </div>
            )}
            </div>
        )}

        {/* ── TAB: Top productos ───────────────────────────────── */}
        {activeTab === 'productos' && (
            <div className="card">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900">Top productos más vendidos</h2>
                <button
                onClick={exportTopProductos}
                disabled={topProducts.length === 0}
                className="btn-secondary flex items-center gap-2 text-sm"
                >
                <Download size={15} /> Exportar CSV
                </button>
            </div>

            {loadingTop ? (
                <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ))}
                </div>
            ) : topProducts.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay datos de ventas todavía</p>
            ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                    <tr>
                        {['#', 'Producto', 'SKU', 'Unidades', 'Ingresos', 'Ganancia'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-gray-500 font-semibold text-xs">{h}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {topProducts.map((p, i) => (
                        <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{p.product_name || p.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.sku || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-700">{p.qty_sold || p.total_qty || 0} uds</td>
                        <td className="px-4 py-2.5 font-bold text-brand-700">{formatCOP(p.revenue || p.total_revenue)}</td>
                        <td className="px-4 py-2.5 text-green-700 font-semibold">{formatCOP(p.profit)}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            )}
            </div>
        )}

        {/* ── TAB: Ventas físicas ──────────────────────────────── */}
        {activeTab === 'fisicas' && (
            <div className="card">
            <div className="flex items-center justify-between mb-4">
                <div>
                <h2 className="font-bold text-gray-900">Ventas físicas</h2>
                <p className="text-xs text-gray-400 mt-0.5">{physicalSales.length} ventas registradas</p>
                </div>
                <button
                onClick={exportVentasFisicas}
                disabled={physicalSales.length === 0}
                className="btn-secondary flex items-center gap-2 text-sm"
                >
                <Download size={15} /> Exportar CSV
                </button>
            </div>

            {loadingPhysical ? (
                <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ))}
                </div>
            ) : physicalSales.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay ventas físicas registradas</p>
            ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                    <tr>
                        {['Orden', 'Punto', 'Productos', 'Total', 'Ganancia', 'Fecha'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-gray-500 font-semibold text-xs">{h}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {physicalSales.map(sale => (
                        <tr key={sale.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-xs font-bold text-gray-700">{sale.order_number}</td>
                        <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5 text-gray-600">
                            <MapPin size={12} className="text-brand-500" />
                            <span className="text-xs">{sale.location_name}</span>
                            </div>
                        </td>
                        <td className="px-4 py-2.5">
                            <div className="space-y-0.5">
                            {sale.items?.slice(0, 2).map((item, i) => (
                                <p key={i} className="text-xs text-gray-600">{item.product_name} ×{item.qty}</p>
                            ))}
                            {sale.items?.length > 2 && (
                                <p className="text-xs text-gray-400">+{sale.items.length - 2} más</p>
                            )}
                            </div>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-gray-900">{formatCOP(sale.total_amount)}</td>
                        <td className="px-4 py-2.5 text-green-700 font-semibold text-xs">{formatCOP(sale.gross_profit)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(sale.created_at)}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            )}
            </div>
        )}

        {/* ── TAB: Pedidos web ─────────────────────────────────── */}
        {activeTab === 'web' && (
            <div className="card">
            <div className="flex items-center justify-between mb-4">
                <div>
                <h2 className="font-bold text-gray-900">Pedidos web</h2>
                <p className="text-xs text-gray-400 mt-0.5">{webOrders.length} pedidos registrados</p>
                </div>
                <button
                onClick={exportPedidosWeb}
                disabled={webOrders.length === 0}
                className="btn-secondary flex items-center gap-2 text-sm"
                >
                <Download size={15} /> Exportar CSV
                </button>
            </div>

            {loadingWeb ? (
                <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
                ))}
                </div>
            ) : webOrders.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay pedidos web todavía</p>
            ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                    <tr>
                        {['Orden', 'Cliente', 'Ciudad', 'Productos', 'Total', 'Estado', 'Fecha'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-gray-500 font-semibold text-xs">{h}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {webOrders.map(order => {
                        const addr = order.shipping_address || {}
                        return (
                        <tr key={order.id} className="border-t border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-mono text-xs font-bold text-gray-700">{order.order_number}</td>
                            <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-900 text-xs">{addr.full_name || '—'}</p>
                            <p className="text-xs text-gray-400">{addr.phone || ''}</p>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-600">{addr.city || '—'}</td>
                            <td className="px-4 py-2.5">
                            {order.items?.slice(0, 2).map((item, i) => (
                                <p key={i} className="text-xs text-gray-600">{item.product_name} ×{item.qty}</p>
                            ))}
                            {order.items?.length > 2 && (
                                <p className="text-xs text-gray-400">+{order.items.length - 2} más</p>
                            )}
                            </td>
                            <td className="px-4 py-2.5 font-bold text-gray-900">{formatCOP(order.total_amount)}</td>
                            <td className="px-4 py-2.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                order.status === 'paid' || order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                                order.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                'bg-blue-100 text-blue-700'
                            }`}>
                                {order.status}
                            </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{formatDate(order.created_at)}</td>
                        </tr>
                        )
                    })}
                    </tbody>
                </table>
                </div>
            )}
            </div>
        )}
        </div>
    )
}
