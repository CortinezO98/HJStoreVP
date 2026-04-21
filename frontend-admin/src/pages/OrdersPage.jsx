import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ShoppingBag, MapPin, Trash2, Search, CheckCircle } from 'lucide-react'
import { apiClient } from '../services/api'
import { useAuthStore } from '../store'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''

    function formatCOP(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', maximumFractionDigits: 0
    }).format(n)
    }

    function formatDate(d) {
    return new Date(d).toLocaleString('es-CO', {
        dateStyle: 'short', timeStyle: 'short'
    })
    }

    // ── Modal Nueva Venta ────────────────────────────────────────────────────────
    function NewSaleModal({ onClose }) {
    const { user } = useAuthStore()
    const qc = useQueryClient()
    const isAdmin = ['super_admin', 'admin'].includes(user?.role)

    const [locationId, setLocationId] = useState('')
    const [notes, setNotes] = useState('')
    const [search, setSearch] = useState('')
    const [items, setItems] = useState([])  // [{ product, qty }]
    const [lastSale, setLastSale] = useState(null)

    // Cargar ubicaciones (solo admin)
    const { data: locations = [] } = useQuery({
        queryKey: ['locations'],
        queryFn: () => apiClient.get('/locations').then(r => r.data).catch(() => []),
        enabled: isAdmin,
    })

    // Cargar stock del punto
    const activeLocation = isAdmin ? locationId : user?.locationId
    const { data: stock = [] } = useQuery({
        queryKey: ['my-stock', activeLocation],
        queryFn: () => apiClient.get('/physical-sales/my-stock').then(r => r.data),
        enabled: !isAdmin,
    })

    // Para admin, cargar inventario del punto seleccionado
    const { data: adminStock = [] } = useQuery({
        queryKey: ['admin-stock', locationId],
        queryFn: () => apiClient.get(`/inventory/location/${locationId}`).then(r => r.data),
        enabled: isAdmin && !!locationId,
    })

    const availableProducts = isAdmin
        ? adminStock.map(inv => ({
            product_id: inv.product_id,
            name: inv.product?.name || `Producto ${inv.product_id}`,
            sku: inv.product?.sku || '',
            sale_price: inv.product?.sale_price || 0,
            qty_available: inv.qty_available,
            primary_image: inv.product?.images?.[0]?.url || null,
        }))
        : stock

    const filtered = availableProducts.filter(p =>
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(search.toLowerCase())
    )

    const addItem = (product) => {
        const existing = items.find(i => i.product.product_id === product.product_id)
        if (existing) {
        if (existing.qty >= product.qty_available) {
            toast.error(`Stock máximo disponible: ${product.qty_available}`)
            return
        }
        setItems(items.map(i =>
            i.product.product_id === product.product_id
            ? { ...i, qty: i.qty + 1 }
            : i
        ))
        } else {
        if (product.qty_available === 0) {
            toast.error('Producto sin stock en este punto')
            return
        }
        setItems([...items, { product, qty: 1 }])
        }
    }

    const updateQty = (productId, qty) => {
        if (qty <= 0) {
        setItems(items.filter(i => i.product.product_id !== productId))
        } else {
        setItems(items.map(i =>
            i.product.product_id === productId ? { ...i, qty } : i
        ))
        }
    }

    const total = items.reduce((acc, i) => acc + (i.product.sale_price * i.qty), 0)

    const mutation = useMutation({
        mutationFn: (data) => apiClient.post('/physical-sales', data).then(r => r.data),
        onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ['physical-sales'] })
        qc.invalidateQueries({ queryKey: ['my-stock'] })
        qc.invalidateQueries({ queryKey: ['inventory'] })
        setLastSale(data)
        setItems([])
        setNotes('')
        toast.success(`Venta ${data.order_number} registrada!`)
        },
        onError: (e) => toast.error(e.response?.data?.detail || 'Error al registrar venta'),
    })

    const handleSubmit = () => {
        if (items.length === 0) {
        toast.error('Agrega al menos un producto')
        return
        }
        if (isAdmin && !locationId) {
        toast.error('Selecciona el punto físico')
        return
        }
        mutation.mutate({
        items: items.map(i => ({ product_id: i.product.product_id, qty: i.qty })),
        location_id: isAdmin ? parseInt(locationId) : undefined,
        notes: notes || undefined,
        })
    }

    // Pantalla de éxito
    if (lastSale) {
        return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">¡Venta registrada!</h2>
            <p className="text-gray-500 text-sm mb-6">Orden: <span className="font-mono font-bold text-gray-800">{lastSale.order_number}</span></p>

            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left space-y-2">
                {lastSale.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.product_name} ×{item.qty}</span>
                    <span className="font-medium">{formatCOP(item.line_total)}</span>
                </div>
                ))}
                <div className="border-t border-gray-200 pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-green-700">{formatCOP(lastSale.total_amount)}</span>
                </div>
            </div>

            <div className="flex gap-3">
                <button onClick={() => setLastSale(null)} className="btn-secondary flex-1">
                Nueva venta
                </button>
                <button onClick={onClose} className="btn-primary flex-1">
                Cerrar
                </button>
            </div>
            </div>
        </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div>
                <h2 className="font-bold text-gray-900 text-lg">Nueva venta física</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                {isAdmin ? 'Registrar venta en un punto físico' : `Punto: ${user?.fullName}`}
                </p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Selector de punto (solo admin) */}
            {isAdmin && (
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Punto físico *</label>
                <select
                    className="input"
                    value={locationId}
                    onChange={e => { setLocationId(e.target.value); setItems([]) }}
                >
                    <option value="">Selecciona un punto...</option>
                    {locations.filter(l => l.type === 'physical').map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                </select>
                </div>
            )}

            {/* Búsqueda de productos */}
            {(!isAdmin || locationId) && (
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agregar productos
                </label>
                <div className="relative mb-2">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                    className="input pl-9"
                    placeholder="Buscar por nombre o SKU..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* Lista de productos disponibles */}
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {filtered.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-400">
                        {search ? 'No se encontraron productos' : 'No hay productos disponibles'}
                    </div>
                    ) : filtered.map(p => (
                    <div
                        key={p.product_id}
                        onClick={() => addItem(p)}
                        className={`flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${
                        p.qty_available === 0 ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                    >
                        <div className="flex items-center gap-3">
                        {p.primary_image && (
                            <img
                            src={p.primary_image.startsWith('http') ? p.primary_image : `${API_URL}${p.primary_image}`}
                            alt={p.name}
                            className="w-8 h-8 rounded-lg object-cover"
                            />
                        )}
                        <div>
                            <p className="text-sm font-medium text-gray-900">{p.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{p.sku}</p>
                        </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-bold text-brand-700">{formatCOP(p.sale_price)}</p>
                        <p className={`text-xs ${p.qty_available <= 5 ? 'text-red-500' : 'text-gray-400'}`}>
                            Stock: {p.qty_available}
                        </p>
                        </div>
                    </div>
                    ))}
                </div>
                </div>
            )}

            {/* Carrito */}
            {items.length > 0 && (
                <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Productos en la venta</p>
                <div className="space-y-2">
                    {items.map(({ product, qty }) => (
                    <div key={product.product_id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                        <p className="text-xs text-gray-400">{formatCOP(product.sale_price)} c/u</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={() => updateQty(product.product_id, qty - 1)}
                            className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100"
                        >−</button>
                        <span className="w-8 text-center text-sm font-bold">{qty}</span>
                        <button
                            onClick={() => updateQty(product.product_id, qty + 1)}
                            className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100"
                        >+</button>
                        </div>
                        <p className="text-sm font-bold text-brand-700 w-24 text-right flex-shrink-0">
                        {formatCOP(product.sale_price * qty)}
                        </p>
                        <button
                        onClick={() => setItems(items.filter(i => i.product.product_id !== product.product_id))}
                        className="text-red-400 hover:text-red-600 p-1"
                        >
                        <Trash2 size={14} />
                        </button>
                    </div>
                    ))}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center mt-3 px-1">
                    <span className="font-bold text-gray-900">Total venta</span>
                    <span className="text-xl font-black text-green-700">{formatCOP(total)}</span>
                </div>
                </div>
            )}

            {/* Notas */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <input
                className="input"
                placeholder="Método de pago, observaciones..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                />
            </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100 flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button
                onClick={handleSubmit}
                disabled={mutation.isPending || items.length === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
                {mutation.isPending
                ? 'Registrando...'
                : <><CheckCircle size={16} /> Registrar venta · {formatCOP(total)}</>
                }
            </button>
            </div>
        </div>
        </div>
    )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function OrdersPage() {
    const [showNewSale, setShowNewSale] = useState(false)
    const { user } = useAuthStore()
    const isAdmin = ['super_admin', 'admin'].includes(user?.role)

    const { data: sales = [], isLoading } = useQuery({
        queryKey: ['physical-sales'],
        queryFn: () => apiClient.get('/physical-sales').then(r => r.data),
    })

    return (
        <div>
        <div className="flex items-center justify-between mb-6">
            <div>
            <h1 className="text-2xl font-bold text-gray-900">Ventas Físicas</h1>
            <p className="text-sm text-gray-500 mt-1">
                {sales.length} ventas registradas
            </p>
            </div>
            <button
            onClick={() => setShowNewSale(true)}
            className="btn-primary flex items-center gap-2"
            >
            <Plus size={16} /> Nueva venta
            </button>
        </div>

        {/* Tabla de ventas */}
        <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Orden</th>
                    {isAdmin && <th className="text-left px-4 py-3 text-gray-500 font-semibold">Punto</th>}
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Productos</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-semibold">Total</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-semibold">Ganancia</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Fecha</th>
                </tr>
                </thead>
                <tbody>
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                        {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                        ))}
                    </tr>
                    ))
                ) : sales.length === 0 ? (
                    <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-16 text-center">
                        <ShoppingBag size={40} className="text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">No hay ventas registradas todavía</p>
                        <button
                        onClick={() => setShowNewSale(true)}
                        className="mt-4 text-brand-600 text-sm hover:underline"
                        >
                        Registrar primera venta
                        </button>
                    </td>
                    </tr>
                ) : sales.map(sale => (
                    <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-gray-700">{sale.order_number}</span>
                    </td>
                    {isAdmin && (
                        <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-gray-600">
                            <MapPin size={13} className="text-brand-500" />
                            <span className="text-xs">{sale.location_name}</span>
                        </div>
                        </td>
                    )}
                    <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                        {sale.items.slice(0, 2).map((item, i) => (
                            <span key={i} className="text-xs text-gray-600">
                            {item.product_name} ×{item.qty}
                            </span>
                        ))}
                        {sale.items.length > 2 && (
                            <span className="text-xs text-gray-400">+{sale.items.length - 2} más</span>
                        )}
                        </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {formatCOP(sale.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                        <span className="text-green-700 font-semibold text-xs">
                        {formatCOP(sale.gross_profit)}
                        </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDate(sale.created_at)}
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        </div>

        {showNewSale && <NewSaleModal onClose={() => setShowNewSale(false)} />}
        </div>
    )
}
