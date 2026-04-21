import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    Download,
    ShoppingBag,
    Globe,
    TrendingUp,
    Calendar,
    Package,
    MapPin,
    FileText,
    Filter,
    DollarSign,
    Boxes,
} from 'lucide-react'
import {
    analyticsApi,
    ordersApi,
    physicalSalesApi,
    locationsApi,
    categoriesApi,
    productsApi,
} from '../services/api'

function formatCOP(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
    }).format(Number(n || 0))
}

function formatDate(d) {
    return new Date(d).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

function toDate(value) {
    if (!value) return null
    return new Date(`${value}T00:00:00`)
}

function isWithinRange(dateValue, dateFrom, dateTo) {
    if (!dateValue) return false
    const date = new Date(dateValue)
    if (dateFrom && date < new Date(`${dateFrom}T00:00:00`)) return false
    if (dateTo) {
        const end = new Date(`${dateTo}T23:59:59`)
        if (date > end) return false
    }
    return true
}

function exportToCSV(data, filename) {
    if (!data || data.length === 0) return

    const headers = Object.keys(data[0])
    const rows = data.map((row) =>
        headers
        .map((h) => {
            const val = row[h]
            if (val === null || val === undefined) return ''
            const str = String(val)
            return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str
        })
        .join(',')
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

function KpiCard({ icon: Icon, title, value, subtitle, tone = 'brand' }) {
    const tones = {
        brand: 'bg-brand-50 text-brand-700 border-brand-100',
        green: 'bg-green-50 text-green-700 border-green-100',
        blue: 'bg-blue-50 text-blue-700 border-blue-100',
        amber: 'bg-amber-50 text-amber-700 border-amber-100',
        gray: 'bg-gray-50 text-gray-700 border-gray-100',
    }

    return (
        <div className="card">
        <div className="flex items-start justify-between gap-4">
            <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{value}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-2">{subtitle}</p>}
            </div>
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${tones[tone]}`}>
            <Icon size={22} />
            </div>
        </div>
        </div>
    )
}

export default function ReportsPage() {
    const currentYear = new Date().getFullYear()

    const [filters, setFilters] = useState({
        date_from: '',
        date_to: '',
        location_id: '',
        category_id: '',
        year: currentYear,
    })

    const setFilter = (key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
    }

    const { data: locations = [] } = useQuery({
        queryKey: ['report-locations'],
        queryFn: () => locationsApi.list().then((r) => r.data),
    })

    const { data: categories = [] } = useQuery({
        queryKey: ['report-categories'],
        queryFn: () => categoriesApi.list().then((r) => r.data),
    })

    const { data: products = [] } = useQuery({
        queryKey: ['report-products'],
        queryFn: () =>
        productsApi
            .list({ include_inactive: true, per_page: 200 })
            .then((r) => r.data),
    })

    const { data: salesByMonth = [], isLoading: loadingMonth } = useQuery({
        queryKey: ['report-sales-by-month', filters.year],
        queryFn: () => analyticsApi.salesByMonth(filters.year).then((r) => r.data),
    })

    const { data: topProducts = [], isLoading: loadingTop } = useQuery({
        queryKey: ['report-top-products', filters.date_from, filters.date_to],
        queryFn: () =>
        analyticsApi
            .topProducts({
            limit: 20,
            date_from: filters.date_from || undefined,
            date_to: filters.date_to || undefined,
            })
            .then((r) => r.data),
    })

    const { data: salesByLocation = [], isLoading: loadingLocation } = useQuery({
        queryKey: ['report-sales-by-location', filters.date_from, filters.date_to],
        queryFn: () =>
        analyticsApi
            .salesByLocation({
            date_from: filters.date_from || undefined,
            date_to: filters.date_to || undefined,
            })
            .then((r) => r.data),
    })

    const { data: webOrders = [], isLoading: loadingWeb } = useQuery({
        queryKey: ['report-web-orders'],
        queryFn: () => ordersApi.list({}).then((r) => r.data),
    })

    const { data: physicalSales = [], isLoading: loadingPhysical } = useQuery({
        queryKey: ['report-physical-sales'],
        queryFn: () => physicalSalesApi.list({}).then((r) => r.data),
    })

    const productMap = useMemo(() => {
        const map = new Map()
        products.forEach((p) => {
        map.set(p.id, p)
        })
        return map
    }, [products])

    const categoryMap = useMemo(() => {
        const map = new Map()
        categories.forEach((c) => {
        map.set(c.id, c)
        })
        return map
    }, [categories])

    const filteredWebOrders = useMemo(() => {
        return webOrders.filter((order) => {
        const inDate = isWithinRange(order.created_at, filters.date_from, filters.date_to)
        if (!inDate) return false

        if (filters.category_id) {
            const categoryId = Number(filters.category_id)
            const hasCategory = (order.items || []).some((item) => {
            const p = productMap.get(item.product_id)
            return Number(p?.category_id || 0) === categoryId
            })
            if (!hasCategory) return false
        }

        return true
        })
    }, [webOrders, filters.date_from, filters.date_to, filters.category_id, productMap])

    const filteredPhysicalSales = useMemo(() => {
        return physicalSales.filter((sale) => {
        const inDate = isWithinRange(sale.created_at, filters.date_from, filters.date_to)
        if (!inDate) return false

        if (filters.location_id && Number(sale.location_id) !== Number(filters.location_id)) {
            return false
        }

        if (filters.category_id) {
            const categoryId = Number(filters.category_id)
            const hasCategory = (sale.items || []).some((item) => {
            const p = productMap.get(item.product_id)
            return Number(p?.category_id || 0) === categoryId
            })
            if (!hasCategory) return false
        }

        return true
        })
    }, [physicalSales, filters.date_from, filters.date_to, filters.location_id, filters.category_id, productMap])

    const accountingSummary = useMemo(() => {
        const webRevenue = filteredWebOrders.reduce(
        (acc, order) => acc + Number(order.total_amount || 0),
        0
        )

        const webCost = filteredWebOrders.reduce((acc, order) => {
        const cost = (order.items || []).reduce((sum, item) => {
            const itemCost =
            item.cost_price !== undefined
                ? Number(item.cost_price || 0) * Number(item.qty || 0)
                : 0
            return sum + itemCost
        }, 0)
        return acc + cost
        }, 0)

        const physicalRevenue = filteredPhysicalSales.reduce(
        (acc, sale) => acc + Number(sale.total_amount || 0),
        0
        )

        const physicalCost = filteredPhysicalSales.reduce((acc, sale) => {
        const cost = (sale.items || []).reduce(
            (sum, item) => sum + Number(item.cost_price || 0) * Number(item.qty || 0),
            0
        )
        return acc + cost
        }, 0)

        const totalRevenue = webRevenue + physicalRevenue
        const totalCost = webCost + physicalCost
        const grossProfit = totalRevenue - totalCost

        return {
        webRevenue,
        physicalRevenue,
        totalRevenue,
        webCost,
        physicalCost,
        totalCost,
        grossProfit,
        }
    }, [filteredWebOrders, filteredPhysicalSales])

    const categorySummary = useMemo(() => {
        const grouped = new Map()

        const accumulate = (items = []) => {
        items.forEach((item) => {
            const product = productMap.get(item.product_id)
            const categoryId = Number(product?.category_id || 0)
            const categoryName = categoryMap.get(categoryId)?.name || 'Sin categoría'

            const revenue = Number(item.line_total || Number(item.unit_price || 0) * Number(item.qty || 0))
            const cost = Number(item.cost_price || 0) * Number(item.qty || 0)
            const profit = revenue - cost

            if (!grouped.has(categoryName)) {
            grouped.set(categoryName, {
                category: categoryName,
                revenue: 0,
                cost: 0,
                profit: 0,
                units: 0,
            })
            }

            const current = grouped.get(categoryName)
            current.revenue += revenue
            current.cost += cost
            current.profit += profit
            current.units += Number(item.qty || 0)
        })
        }

        filteredWebOrders.forEach((order) => accumulate(order.items))
        filteredPhysicalSales.forEach((sale) => accumulate(sale.items))

        return [...grouped.values()].sort((a, b) => b.revenue - a.revenue)
    }, [filteredWebOrders, filteredPhysicalSales, productMap, categoryMap])

    const topProductsFiltered = useMemo(() => {
        if (!filters.category_id) return topProducts

        const categoryId = Number(filters.category_id)
        return topProducts.filter((item) => {
        const p = productMap.get(item.product_id)
        return Number(p?.category_id || 0) === categoryId
        })
    }, [topProducts, filters.category_id, productMap])

    const salesByLocationFiltered = useMemo(() => {
        if (!filters.location_id) return salesByLocation
        return salesByLocation.filter(
        (item) =>
            String(item.location_name || '').toLowerCase() ===
            String(
            locations.find((l) => Number(l.id) === Number(filters.location_id))?.name || ''
            ).toLowerCase()
        )
    }, [salesByLocation, filters.location_id, locations])

    const exportAccounting = () => {
        exportToCSV(
        [
            {
            ingresos_web: accountingSummary.webRevenue,
            ingresos_fisicos: accountingSummary.physicalRevenue,
            ingresos_totales: accountingSummary.totalRevenue,
            costo_web: accountingSummary.webCost,
            costo_fisico: accountingSummary.physicalCost,
            costo_total: accountingSummary.totalCost,
            ganancia_bruta: accountingSummary.grossProfit,
            fecha_desde: filters.date_from || '',
            fecha_hasta: filters.date_to || '',
            punto_fisico: locations.find((l) => Number(l.id) === Number(filters.location_id))?.name || 'Todos',
            categoria: categories.find((c) => Number(c.id) === Number(filters.category_id))?.name || 'Todas',
            },
        ],
        'reporte_contable'
        )
    }

    const exportCategories = () => exportToCSV(categorySummary, 'ganancia_por_categoria')
    const exportTopProducts = () => exportToCSV(topProductsFiltered, 'top_productos')
    const exportLocations = () => exportToCSV(salesByLocationFiltered, 'ventas_por_punto')
    const exportOrders = () =>
        exportToCSV(
        filteredWebOrders.map((order) => ({
            order_number: order.order_number,
            status: order.status,
            total_amount: order.total_amount,
            city: order.shipping_address?.city || '',
            department: order.shipping_address?.department || '',
            full_name: order.shipping_address?.full_name || '',
            created_at: order.created_at,
        })),
        'pedidos_web'
        )

    const exportPhysicalSales = () =>
        exportToCSV(
        filteredPhysicalSales.map((sale) => ({
            order_number: sale.order_number,
            location_name: sale.location_name,
            total_amount: sale.total_amount,
            gross_profit: sale.gross_profit,
            created_at: sale.created_at,
        })),
        'ventas_fisicas'
        )

    const isLoading =
        loadingMonth || loadingTop || loadingLocation || loadingWeb || loadingPhysical

    return (
        <div className="space-y-6">
        <div>
            <h1 className="text-2xl font-bold text-gray-900">Reportes contables</h1>
            <p className="text-sm text-gray-500 mt-1">
            Consolidado de tienda web y puntos físicos con filtros y exportación
            </p>
        </div>

        {/* Filtros */}
        <div className="card">
            <div className="flex items-center gap-2 mb-4">
            <Filter size={18} className="text-brand-600" />
            <h2 className="font-bold text-gray-900">Filtros</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
                <label className="block text-sm text-gray-600 mb-1">Fecha desde</label>
                <input
                type="date"
                className="input"
                value={filters.date_from}
                onChange={(e) => setFilter('date_from', e.target.value)}
                />
            </div>

            <div>
                <label className="block text-sm text-gray-600 mb-1">Fecha hasta</label>
                <input
                type="date"
                className="input"
                value={filters.date_to}
                onChange={(e) => setFilter('date_to', e.target.value)}
                />
            </div>

            <div>
                <label className="block text-sm text-gray-600 mb-1">Punto físico</label>
                <select
                className="input"
                value={filters.location_id}
                onChange={(e) => setFilter('location_id', e.target.value)}
                >
                <option value="">Todos</option>
                {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                    {loc.name}
                    </option>
                ))}
                </select>
            </div>

            <div>
                <label className="block text-sm text-gray-600 mb-1">Categoría</label>
                <select
                className="input"
                value={filters.category_id}
                onChange={(e) => setFilter('category_id', e.target.value)}
                >
                <option value="">Todas</option>
                {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                    {cat.name}
                    </option>
                ))}
                </select>
            </div>

            <div>
                <label className="block text-sm text-gray-600 mb-1">Año gráfico</label>
                <input
                type="number"
                className="input"
                value={filters.year}
                onChange={(e) => setFilter('year', Number(e.target.value))}
                />
            </div>
            </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
            icon={Globe}
            title="Ingresos web"
            value={formatCOP(accountingSummary.webRevenue)}
            subtitle={`${filteredWebOrders.length} pedidos`}
            tone="brand"
            />
            <KpiCard
            icon={MapPin}
            title="Ingresos físicos"
            value={formatCOP(accountingSummary.physicalRevenue)}
            subtitle={`${filteredPhysicalSales.length} ventas`}
            tone="blue"
            />
            <KpiCard
            icon={DollarSign}
            title="Costo vendido"
            value={formatCOP(accountingSummary.totalCost)}
            subtitle="Web + físicos"
            tone="amber"
            />
            <KpiCard
            icon={TrendingUp}
            title="Ganancia bruta"
            value={formatCOP(accountingSummary.grossProfit)}
            subtitle="Ingresos - costo"
            tone="green"
            />
        </div>

        {/* Reporte contable principal */}
        <div className="card">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
            <div>
                <h2 className="font-bold text-gray-900">Resumen contable</h2>
                <p className="text-xs text-gray-500 mt-1">
                Consolidado filtrado por fechas, punto y categoría
                </p>
            </div>

            <button
                onClick={exportAccounting}
                className="btn-primary flex items-center gap-2"
            >
                <Download size={16} />
                Exportar resumen
            </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-gray-100 p-4 bg-gray-50">
                <p className="text-sm text-gray-500">Ingresos totales</p>
                <p className="text-2xl font-black text-gray-900 mt-2">
                {formatCOP(accountingSummary.totalRevenue)}
                </p>
            </div>
            <div className="rounded-2xl border border-gray-100 p-4 bg-gray-50">
                <p className="text-sm text-gray-500">Costo total</p>
                <p className="text-2xl font-black text-gray-900 mt-2">
                {formatCOP(accountingSummary.totalCost)}
                </p>
            </div>
            <div className="rounded-2xl border border-gray-100 p-4 bg-gray-50">
                <p className="text-sm text-gray-500">Ganancia bruta</p>
                <p className="text-2xl font-black text-green-700 mt-2">
                {formatCOP(accountingSummary.grossProfit)}
                </p>
            </div>
            <div className="rounded-2xl border border-gray-100 p-4 bg-gray-50">
                <p className="text-sm text-gray-500">Participación web / física</p>
                <p className="text-sm font-semibold text-gray-900 mt-3">
                Web: {formatCOP(accountingSummary.webRevenue)}
                </p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                Física: {formatCOP(accountingSummary.physicalRevenue)}
                </p>
            </div>
            </div>
        </div>

        {/* Ventas por mes y punto */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="card">
            <div className="flex items-center justify-between gap-3 mb-5">
                <div>
                <h2 className="font-bold text-gray-900">Ventas por mes</h2>
                <p className="text-xs text-gray-500 mt-1">
                    Resumen anual del año seleccionado
                </p>
                </div>
                <Calendar size={18} className="text-brand-600" />
            </div>

            {loadingMonth ? (
                <div className="h-56 bg-gray-50 rounded-2xl animate-pulse" />
            ) : (
                <div className="space-y-3">
                {salesByMonth.map((item) => (
                    <div
                    key={item.month}
                    className="flex items-center justify-between gap-4 border-b border-gray-50 pb-2"
                    >
                    <span className="text-sm text-gray-700 font-medium">
                        {item.month_name}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                        {formatCOP(item.total_sales)}
                    </span>
                    </div>
                ))}
                </div>
            )}
            </div>

            <div className="card">
            <div className="flex items-center justify-between gap-3 mb-5">
                <div>
                <h2 className="font-bold text-gray-900">Ventas por punto físico</h2>
                <p className="text-xs text-gray-500 mt-1">
                    Desempeño por local o canal
                </p>
                </div>
                <MapPin size={18} className="text-brand-600" />
            </div>

            <button
                onClick={exportLocations}
                className="btn-secondary mb-4 inline-flex items-center gap-2"
            >
                <Download size={15} />
                Exportar puntos
            </button>

            {loadingLocation ? (
                <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />
                ))}
                </div>
            ) : salesByLocationFiltered.length === 0 ? (
                <p className="text-sm text-gray-400">No hay datos para este filtro</p>
            ) : (
                <div className="space-y-3">
                {salesByLocationFiltered.map((item, idx) => (
                    <div
                    key={idx}
                    className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
                    >
                    <div>
                        <p className="font-semibold text-gray-900">{item.location_name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                        Canal: {item.channel}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="font-bold text-gray-900">
                        {formatCOP(item.total_sales)}
                        </p>
                        <p className="text-xs text-green-700 mt-1">
                        Utilidad: {formatCOP(item.gross_profit)}
                        </p>
                    </div>
                    </div>
                ))}
                </div>
            )}
            </div>
        </div>

        {/* Top productos y categoría */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="card">
            <div className="flex items-center justify-between gap-3 mb-5">
                <div>
                <h2 className="font-bold text-gray-900">Productos más vendidos</h2>
                <p className="text-xs text-gray-500 mt-1">
                    Ingresos y unidades por producto
                </p>
                </div>
                <ShoppingBag size={18} className="text-brand-600" />
            </div>

            <button
                onClick={exportTopProducts}
                className="btn-secondary mb-4 inline-flex items-center gap-2"
            >
                <Download size={15} />
                Exportar top productos
            </button>

            {loadingTop ? (
                <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
                ))}
                </div>
            ) : topProductsFiltered.length === 0 ? (
                <p className="text-sm text-gray-400">No hay productos para este filtro</p>
            ) : (
                <div className="space-y-3">
                {topProductsFiltered.slice(0, 10).map((item) => (
                    <div
                    key={item.product_id}
                    className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
                    >
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-900 line-clamp-1">
                        {item.product_name}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                        SKU: {item.sku} · {item.units_sold} unidades
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900">
                        {formatCOP(item.total_revenue)}
                        </p>
                        <p className="text-xs text-green-700 mt-1">
                        Utilidad: {formatCOP(item.gross_profit)}
                        </p>
                    </div>
                    </div>
                ))}
                </div>
            )}
            </div>

            <div className="card">
            <div className="flex items-center justify-between gap-3 mb-5">
                <div>
                <h2 className="font-bold text-gray-900">Ganancia por categoría</h2>
                <p className="text-xs text-gray-500 mt-1">
                    Consolidado web + físico
                </p>
                </div>
                <Package size={18} className="text-brand-600" />
            </div>

            <button
                onClick={exportCategories}
                className="btn-secondary mb-4 inline-flex items-center gap-2"
            >
                <Download size={15} />
                Exportar categorías
            </button>

            {categorySummary.length === 0 ? (
                <p className="text-sm text-gray-400">No hay información suficiente para este filtro</p>
            ) : (
                <div className="space-y-3">
                {categorySummary.map((item) => (
                    <div
                    key={item.category}
                    className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
                    >
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{item.category}</p>
                        <p className="text-xs text-gray-500 mt-1">
                        {item.units} unidades
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900">
                        {formatCOP(item.revenue)}
                        </p>
                        <p className="text-xs text-green-700 mt-1">
                        Ganancia: {formatCOP(item.profit)}
                        </p>
                    </div>
                    </div>
                ))}
                </div>
            )}
            </div>
        </div>

        {/* Pedidos web y ventas físicas */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="card">
            <div className="flex items-center justify-between gap-3 mb-5">
                <div>
                <h2 className="font-bold text-gray-900">Pedidos web filtrados</h2>
                <p className="text-xs text-gray-500 mt-1">
                    Registro exportable de pedidos web
                </p>
                </div>
                <Globe size={18} className="text-brand-600" />
            </div>

            <button
                onClick={exportOrders}
                className="btn-secondary mb-4 inline-flex items-center gap-2"
            >
                <Download size={15} />
                Exportar pedidos web
            </button>

            {loadingWeb ? (
                <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
                ))}
                </div>
            ) : filteredWebOrders.length === 0 ? (
                <p className="text-sm text-gray-400">No hay pedidos web para este filtro</p>
            ) : (
                <div className="space-y-3">
                {filteredWebOrders.slice(0, 8).map((order) => (
                    <div
                    key={order.id}
                    className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
                    >
                    <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-gray-700">
                        {order.order_number}
                        </p>
                        <p className="text-sm text-gray-900 mt-1">
                        {order.shipping_address?.full_name || 'Cliente web'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                        {formatDate(order.created_at)}
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900">
                        {formatCOP(order.total_amount)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 capitalize">
                        {order.status}
                        </p>
                    </div>
                    </div>
                ))}
                </div>
            )}
            </div>

            <div className="card">
            <div className="flex items-center justify-between gap-3 mb-5">
                <div>
                <h2 className="font-bold text-gray-900">Ventas físicas filtradas</h2>
                <p className="text-xs text-gray-500 mt-1">
                    Registro exportable por punto físico
                </p>
                </div>
                <FileText size={18} className="text-brand-600" />
            </div>

            <button
                onClick={exportPhysicalSales}
                className="btn-secondary mb-4 inline-flex items-center gap-2"
            >
                <Download size={15} />
                Exportar ventas físicas
            </button>

            {loadingPhysical ? (
                <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
                ))}
                </div>
            ) : filteredPhysicalSales.length === 0 ? (
                <p className="text-sm text-gray-400">No hay ventas físicas para este filtro</p>
            ) : (
                <div className="space-y-3">
                {filteredPhysicalSales.slice(0, 8).map((sale) => (
                    <div
                    key={sale.id}
                    className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
                    >
                    <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-gray-700">
                        {sale.order_number}
                        </p>
                        <p className="text-sm text-gray-900 mt-1">
                        {sale.location_name || 'Punto físico'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                        {formatDate(sale.created_at)}
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900">
                        {formatCOP(sale.total_amount)}
                        </p>
                        <p className="text-xs text-green-700 mt-1">
                        Utilidad: {formatCOP(sale.gross_profit)}
                        </p>
                    </div>
                    </div>
                ))}
                </div>
            )}
            </div>
        </div>

        {isLoading && (
            <div className="text-sm text-gray-400">
            Cargando reportes...
            </div>
        )}
        </div>
    )
}