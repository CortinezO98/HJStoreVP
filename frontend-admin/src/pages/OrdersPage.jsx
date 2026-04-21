import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    Plus,
    ShoppingBag,
    MapPin,
    Trash2,
    Search,
    CheckCircle,
    X,
    Store,
    BadgeDollarSign,
    Boxes,
} from 'lucide-react'
import { physicalSalesApi, inventoryApi, locationsApi } from '../services/api'
import { useAuthStore } from '../store'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''

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

function resolveImage(url) {
    if (!url) return null
    return url.startsWith('http') ? url : `${API_URL}${url}`
}

function normalizeInventoryItem(inv) {
    const product = inv.product || {}
    return {
        product_id: inv.product_id,
        name: product.name || `Producto ${inv.product_id}`,
        sku: product.sku || '',
        sale_price: Number(product.sale_price || 0),
        qty_available: Number(inv.qty_available || 0),
        primary_image: product.images?.find((img) => img.is_primary)?.url || product.images?.[0]?.url || null,
    }
}

function SaleDetailModal({ sale, onClose }) {
    if (!sale) return null

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
                <h3 className="text-lg font-bold text-gray-900">Detalle de venta</h3>
                <p className="text-sm text-gray-500 mt-1">{sale.order_number}</p>
            </div>
            <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
                <X size={18} />
            </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-gray-100">
            <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Punto físico</p>
                <p className="font-semibold text-gray-900">{sale.location_name || '—'}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Fecha</p>
                <p className="font-semibold text-gray-900">{formatDate(sale.created_at)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Total</p>
                <p className="font-bold text-green-700">{formatCOP(sale.total_amount)}</p>
            </div>
            </div>

            <div className="p-6">
            <div className="space-y-3">
                {sale.items?.map((item, idx) => (
                <div
                    key={`${sale.id}-${idx}`}
                    className="flex items-center justify-between gap-4 border border-gray-100 rounded-xl p-4"
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
                    <p className="text-xs text-green-700 mt-1">
                        Utilidad: {formatCOP(item.gross_profit)}
                    </p>
                    </div>
                </div>
                ))}
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl bg-brand-50 border border-brand-100 p-4">
                <p className="text-sm text-gray-500 mb-1">Subtotal / Total</p>
                <p className="text-xl font-black text-brand-700">{formatCOP(sale.total_amount)}</p>
                </div>

                <div className="rounded-xl bg-green-50 border border-green-100 p-4">
                <p className="text-sm text-gray-500 mb-1">Utilidad bruta</p>
                <p className="text-xl font-black text-green-700">{formatCOP(sale.gross_profit)}</p>
                </div>
            </div>

            {sale.notes && (
                <div className="mt-6 rounded-xl bg-gray-50 border border-gray-100 p-4">
                <p className="text-sm font-medium text-gray-700 mb-1">Notas</p>
                <p className="text-sm text-gray-600">{sale.notes}</p>
                </div>
            )}
            </div>
        </div>
        </div>
    )
}

function NewSaleModal({ onClose }) {
    const { user } = useAuthStore()
    const qc = useQueryClient()
    const isAdmin = ['super_admin', 'admin'].includes(user?.role)

    const [locationId, setLocationId] = useState('')
    const [notes, setNotes] = useState('')
    const [search, setSearch] = useState('')
    const [items, setItems] = useState([])
    const [lastSale, setLastSale] = useState(null)

    const { data: locations = [] } = useQuery({
        queryKey: ['locations-admin-orders'],
        queryFn: () => locationsApi.list().then((r) => r.data),
        enabled: isAdmin,
    })

    const activeLocation = isAdmin ? Number(locationId || 0) : user?.locationId

    const { data: sellerStock = [] } = useQuery({
        queryKey: ['seller-stock', activeLocation],
        queryFn: () => physicalSalesApi.myStock().then((r) => r.data),
        enabled: !isAdmin,
    })

    const { data: adminStockRaw = [] } = useQuery({
        queryKey: ['admin-location-stock', activeLocation],
        queryFn: () => inventoryApi.byLocation(activeLocation).then((r) => r.data),
        enabled: isAdmin && !!activeLocation,
    })

    const availableProducts = useMemo(() => {
        if (!isAdmin) return sellerStock || []
        return (adminStockRaw || []).map(normalizeInventoryItem)
    }, [isAdmin, sellerStock, adminStockRaw])

    const filteredProducts = availableProducts.filter((p) =>
        `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase())
    )

    const addProduct = (product) => {
        const existing = items.find((i) => i.product.product_id === product.product_id)

        if (existing) {
        if (existing.qty + 1 > Number(product.qty_available || 0)) {
            toast.error('No puedes superar el stock disponible')
            return
        }

        setItems((prev) =>
            prev.map((i) =>
            i.product.product_id === product.product_id
                ? { ...i, qty: i.qty + 1 }
                : i
            )
        )
        return
        }

        if (Number(product.qty_available || 0) <= 0) {
        toast.error('Producto sin stock disponible')
        return
        }

        setItems((prev) => [...prev, { product, qty: 1 }])
    }

    const updateQty = (productId, qty) => {
        if (qty <= 0) {
        setItems((prev) => prev.filter((i) => i.product.product_id !== productId))
        return
        }

        const found = items.find((i) => i.product.product_id === productId)
        if (!found) return

        if (qty > Number(found.product.qty_available || 0)) {
        toast.error('No puedes superar el stock disponible')
        return
        }

        setItems((prev) =>
        prev.map((i) =>
            i.product.product_id === productId ? { ...i, qty } : i
        )
        )
    }

    const removeItem = (productId) => {
        setItems((prev) => prev.filter((i) => i.product.product_id !== productId))
    }

    const total = items.reduce(
        (acc, i) => acc + Number(i.product.sale_price || 0) * i.qty,
        0
    )

    const totalUnits = items.reduce((acc, i) => acc + i.qty, 0)

    const mutation = useMutation({
        mutationFn: async () => {
        if (isAdmin && !locationId) {
            throw new Error('Selecciona un punto físico')
        }

        if (!items.length) {
            throw new Error('Agrega al menos un producto')
        }

        const payload = {
            location_id: isAdmin ? Number(locationId) : undefined,
            notes: notes || null,
            items: items.map((i) => ({
            product_id: i.product.product_id,
            qty: i.qty,
            })),
        }

        const { data } = await physicalSalesApi.create(payload)
        return data
        },
        onSuccess: (data) => {
        setLastSale(data)
        toast.success('Venta registrada correctamente')
        qc.invalidateQueries({ queryKey: ['physical-sales-list'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
        qc.invalidateQueries({ queryKey: ['seller-stock'] })
        qc.invalidateQueries({ queryKey: ['admin-location-stock'] })
        qc.invalidateQueries({ queryKey: ['low-stock'] })
        setItems([])
        setNotes('')
        setSearch('')
        },
        onError: (error) => {
        toast.error(error?.response?.data?.detail || error.message || 'Error registrando la venta')
        },
    })

    const selectedLocationName = isAdmin
        ? locations.find((l) => l.id === Number(locationId))?.name
        : user?.locationName || 'Mi punto'

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
                <h2 className="text-xl font-bold text-gray-900">Nueva venta física</h2>
                <p className="text-sm text-gray-500 mt-1">
                Registra una venta del punto y descuenta stock automáticamente
                </p>
            </div>
            <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
                <X size={18} />
            </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
            <div className="lg:col-span-3 p-5 border-r border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                {isAdmin && (
                    <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Punto físico
                    </label>
                    <select
                        className="input"
                        value={locationId}
                        onChange={(e) => setLocationId(e.target.value)}
                    >
                        <option value="">Selecciona un punto</option>
                        {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                            {loc.name}
                        </option>
                        ))}
                    </select>
                    </div>
                )}

                <div className={isAdmin ? '' : 'md:col-span-2'}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                    Buscar producto
                    </label>
                    <div className="relative">
                    <Search
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        className="input pl-9"
                        placeholder="Buscar por nombre o SKU..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        disabled={isAdmin && !locationId}
                    />
                    </div>
                </div>
                </div>

                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <p className="font-semibold text-gray-900 text-sm">Productos disponibles</p>
                    <p className="text-xs text-gray-500">
                    {selectedLocationName ? `Punto: ${selectedLocationName}` : 'Selecciona un punto'}
                    </p>
                </div>

                <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
                    {(isAdmin && !locationId) ? (
                    <div className="p-12 text-center text-gray-400">
                        <Store size={36} className="mx-auto mb-3 text-gray-200" />
                        Selecciona un punto físico para cargar el stock
                    </div>
                    ) : filteredProducts.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <ShoppingBag size={36} className="mx-auto mb-3 text-gray-200" />
                        No hay productos disponibles para este filtro
                    </div>
                    ) : (
                    filteredProducts.map((product) => {
                        const img = resolveImage(product.primary_image)
                        return (
                        <button
                            key={product.product_id}
                            onClick={() => addProduct(product)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                        >
                            <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                            {img ? (
                                <img src={img} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                <ShoppingBag size={18} className="text-gray-300" />
                                </div>
                            )}
                            </div>

                            <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 line-clamp-1">{product.name}</p>
                            <p className="text-xs text-gray-400 mt-1">SKU: {product.sku}</p>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-sm font-bold text-brand-700">
                                {formatCOP(product.sale_price)}
                                </span>
                                <span className="text-xs text-green-700">
                                Stock: {product.qty_available}
                                </span>
                            </div>
                            </div>

                            <div className="shrink-0">
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold">
                                <Plus size={13} />
                                Agregar
                            </span>
                            </div>
                        </button>
                        )
                    })
                    )}
                </div>
                </div>
            </div>

            <div className="lg:col-span-2 p-5 bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="font-bold text-gray-900">Resumen de la venta</h3>
                    <p className="text-xs text-gray-500 mt-1">{totalUnits} unidades seleccionadas</p>
                </div>
                <BadgeDollarSign size={20} className="text-green-600" />
                </div>

                {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-gray-400">
                    <Boxes size={36} className="mx-auto mb-3 text-gray-200" />
                    Aún no has agregado productos
                </div>
                ) : (
                <div className="space-y-3">
                    {items.map(({ product, qty }) => (
                    <div
                        key={product.product_id}
                        className="bg-white border border-gray-100 rounded-xl p-3"
                    >
                        <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="font-medium text-gray-900 line-clamp-1">{product.name}</p>
                            <p className="text-xs text-gray-400 mt-1">SKU: {product.sku}</p>
                            <p className="text-xs text-gray-500 mt-1">
                            Disponible: {product.qty_available}
                            </p>
                        </div>

                        <button
                            onClick={() => removeItem(product.product_id)}
                            className="text-red-400 hover:text-red-600 p-1"
                        >
                            <Trash2 size={14} />
                        </button>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <button
                            onClick={() => updateQty(product.product_id, qty - 1)}
                            className="w-8 h-8 rounded-lg border border-gray-200 text-sm font-bold hover:bg-gray-50"
                            >
                            -
                            </button>
                            <span className="w-8 text-center font-semibold">{qty}</span>
                            <button
                            onClick={() => updateQty(product.product_id, qty + 1)}
                            className="w-8 h-8 rounded-lg border border-gray-200 text-sm font-bold hover:bg-gray-50"
                            >
                            +
                            </button>
                        </div>

                        <div className="text-right">
                            <p className="text-xs text-gray-500">{formatCOP(product.sale_price)} c/u</p>
                            <p className="font-bold text-gray-900">
                            {formatCOP(Number(product.sale_price) * qty)}
                            </p>
                        </div>
                        </div>
                    </div>
                    ))}

                    <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                    <span className="font-bold text-gray-900">Total venta</span>
                    <span className="text-2xl font-black text-green-700">{formatCOP(total)}</span>
                    </div>
                </div>
                )}

                <div className="mt-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notas (opcional)
                </label>
                <input
                    className="input bg-white"
                    placeholder="Método de pago, observaciones..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
                </div>

                {lastSale && (
                <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4">
                    <p className="text-sm font-semibold text-green-800">Última venta registrada</p>
                    <p className="text-xs text-green-700 mt-1">{lastSale.order_number}</p>
                    <p className="text-lg font-black text-green-700 mt-2">
                    {formatCOP(lastSale.total_amount)}
                    </p>
                </div>
                )}

                <div className="mt-6 flex gap-3">
                <button onClick={onClose} className="btn-secondary flex-1">
                    Cancelar
                </button>
                <button
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending || items.length === 0 || (isAdmin && !locationId)}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                    {mutation.isPending ? (
                    'Registrando...'
                    ) : (
                    <>
                        <CheckCircle size={16} />
                        Registrar venta · {formatCOP(total)}
                    </>
                    )}
                </button>
                </div>
            </div>
            </div>
        </div>
        </div>
    )
}

export default function OrdersPage() {
    const [showNewSale, setShowNewSale] = useState(false)
    const [selectedSale, setSelectedSale] = useState(null)
    const { user } = useAuthStore()
    const isAdmin = ['super_admin', 'admin'].includes(user?.role)

    const { data: sales = [], isLoading } = useQuery({
        queryKey: ['physical-sales-list'],
        queryFn: () => physicalSalesApi.list().then((r) => r.data),
    })

    const totals = useMemo(() => {
        const totalSales = sales.reduce((acc, s) => acc + Number(s.total_amount || 0), 0)
        const totalProfit = sales.reduce((acc, s) => acc + Number(s.gross_profit || 0), 0)
        const totalOrders = sales.length
        return { totalSales, totalProfit, totalOrders }
    }, [sales])

    return (
        <div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
            <h1 className="text-2xl font-bold text-gray-900">Ventas físicas</h1>
            <p className="text-sm text-gray-500 mt-1">
                Registro y control de ventas de puntos físicos
            </p>
            </div>

            <button
            onClick={() => setShowNewSale(true)}
            className="btn-primary flex items-center gap-2"
            >
            <Plus size={16} /> Nueva venta
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="card">
            <p className="text-sm text-gray-500">Ventas registradas</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{totals.totalOrders}</p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Ingresos acumulados</p>
            <p className="text-2xl font-black text-brand-700 mt-2">
                {formatCOP(totals.totalSales)}
            </p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Utilidad bruta</p>
            <p className="text-2xl font-black text-green-700 mt-2">
                {formatCOP(totals.totalProfit)}
            </p>
            </div>
        </div>

        <div className="card overflow-hidden p-0">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
                <h2 className="font-bold text-gray-900">Historial de ventas físicas</h2>
                <p className="text-xs text-gray-500 mt-1">
                {sales.length} ventas registradas
                </p>
            </div>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Orden</th>
                    {isAdmin && (
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Punto</th>
                    )}
                    <th className="text-right px-4 py-3 text-gray-500 font-semibold">Total</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-semibold">Utilidad</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Estado</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Fecha</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Detalle</th>
                </tr>
                </thead>

                <tbody>
                {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                        {Array.from({ length: isAdmin ? 7 : 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                        ))}
                    </tr>
                    ))
                ) : sales.length === 0 ? (
                    <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="px-4 py-16 text-center">
                        <ShoppingBag size={40} className="text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">Aún no hay ventas físicas registradas</p>
                    </td>
                    </tr>
                ) : (
                    sales.map((sale) => (
                    <tr
                        key={sale.id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                        <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-gray-700">
                            {sale.order_number}
                        </span>
                        </td>

                        {isAdmin && (
                        <td className="px-4 py-3">
                            <div className="flex items-center gap-2 text-gray-700">
                            <MapPin size={14} className="text-brand-600" />
                            <span>{sale.location_name || '—'}</span>
                            </div>
                        </td>
                        )}

                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {formatCOP(sale.total_amount)}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-green-700">
                        {formatCOP(sale.gross_profit)}
                        </td>

                        <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            Pagada
                        </span>
                        </td>

                        <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDate(sale.created_at)}
                        </td>

                        <td className="px-4 py-3 text-center">
                        <button
                            onClick={() => setSelectedSale(sale)}
                            className="text-brand-600 hover:text-brand-700 text-xs font-semibold"
                        >
                            Ver detalle
                        </button>
                        </td>
                    </tr>
                    ))
                )}
                </tbody>
            </table>
            </div>
        </div>

        {showNewSale && <NewSaleModal onClose={() => setShowNewSale(false)} />}
        {selectedSale && (
            <SaleDetailModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
        )}
        </div>
    )
}