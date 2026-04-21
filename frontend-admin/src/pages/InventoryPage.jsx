import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Boxes,
  AlertTriangle,
  ArrowRightLeft,
  PackagePlus,
  Search,
  MapPin,
  Warehouse,
  RefreshCw,
  CheckCircle,
} from 'lucide-react'
import { inventoryApi, locationsApi, productsApi } from '../services/api'
import toast from 'react-hot-toast'

function formatNumber(n) {
  return new Intl.NumberFormat('es-CO').format(Number(n || 0))
}

function ProductStockModal({ product, locations, onClose }) {
  const { data: stock = [], isLoading } = useQuery({
    queryKey: ['product-inventory-detail', product.id],
    queryFn: () => inventoryApi.byProduct(product.id).then((r) => r.data),
    enabled: !!product?.id,
  })

  const inventoryMap = useMemo(() => {
    const map = new Map()
    stock.forEach((row) => {
      map.set(Number(row.location_id), row)
    })
    return map
  }, [stock])

  const totalAvailable = stock.reduce((acc, row) => acc + Number(row.qty_available || 0), 0)
  const totalReserved = stock.reduce((acc, row) => acc + Number(row.qty_reserved || 0), 0)
  const totalReal = stock.reduce((acc, row) => acc + Number(row.qty_real || 0), 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Detalle de inventario</h3>
            <p className="text-sm text-gray-500 mt-1">
              {product.name} · SKU: {product.sku}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cerrar
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-gray-100">
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Disponible</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{formatNumber(totalAvailable)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Reservado</p>
            <p className="text-2xl font-black text-amber-600 mt-2">{formatNumber(totalReserved)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Stock real</p>
            <p className="text-2xl font-black text-brand-700 mt-2">{formatNumber(totalReal)}</p>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {locations.map((loc) => {
                const row = inventoryMap.get(Number(loc.id))
                return (
                  <div
                    key={loc.id}
                    className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{loc.name}</p>
                      <p className="text-xs text-gray-500 mt-1 capitalize">
                        Tipo: {loc.type}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-6 text-right shrink-0">
                      <div>
                        <p className="text-xs text-gray-500">Disponible</p>
                        <p className="font-bold text-gray-900 mt-1">
                          {formatNumber(row?.qty_available || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Reservado</p>
                        <p className="font-bold text-amber-600 mt-1">
                          {formatNumber(row?.qty_reserved || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Real</p>
                        <p className="font-bold text-brand-700 mt-1">
                          {formatNumber(row?.qty_real || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReplenishModal({ products, locations, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    product_id: '',
    location_id: '',
    qty: '',
    notes: '',
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.product_id || !form.location_id || !form.qty) {
        throw new Error('Completa producto, ubicación y cantidad')
      }

      const payload = {
        product_id: Number(form.product_id),
        location_id: Number(form.location_id),
        qty: Number(form.qty),
        notes: form.notes || null,
      }

      const { data } = await inventoryApi.replenish(payload)
      return data
    },
    onSuccess: () => {
      toast.success('Reposición registrada correctamente')
      qc.invalidateQueries({ queryKey: ['inventory-low-stock'] })
      qc.invalidateQueries({ queryKey: ['inventory-products'] })
      onClose()
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || error.message || 'Error en la reposición')
    },
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Ingreso de mercancía</h3>
          <p className="text-sm text-gray-500 mt-1">
            Registra nueva mercancía y asígnala al punto físico o tienda web
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Producto</label>
            <select
              className="input"
              value={form.product_id}
              onChange={(e) => setForm((p) => ({ ...p, product_id: e.target.value }))}
            >
              <option value="">Selecciona un producto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.sku}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Ubicación</label>
            <select
              className="input"
              value={form.location_id}
              onChange={(e) => setForm((p) => ({ ...p, location_id: e.target.value }))}
            >
              <option value="">Selecciona una ubicación</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Cantidad</label>
            <input
              type="number"
              min="1"
              className="input"
              value={form.qty}
              onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))}
              placeholder="Ej: 30"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Notas</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Proveedor, lote, observación..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? 'Guardando...' : <><PackagePlus size={16} /> Registrar ingreso</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function TransferModal({ products, locations, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    product_id: '',
    from_location_id: '',
    to_location_id: '',
    qty: '',
    notes: '',
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.product_id || !form.from_location_id || !form.to_location_id || !form.qty) {
        throw new Error('Completa todos los campos obligatorios')
      }

      if (form.from_location_id === form.to_location_id) {
        throw new Error('El punto origen y destino no pueden ser iguales')
      }

      const payload = {
        product_id: Number(form.product_id),
        from_location_id: Number(form.from_location_id),
        to_location_id: Number(form.to_location_id),
        qty: Number(form.qty),
        notes: form.notes || null,
      }

      const { data } = await inventoryApi.transfer(payload)
      return data
    },
    onSuccess: () => {
      toast.success('Transferencia realizada correctamente')
      qc.invalidateQueries({ queryKey: ['inventory-low-stock'] })
      qc.invalidateQueries({ queryKey: ['inventory-products'] })
      onClose()
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || error.message || 'Error en la transferencia')
    },
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Transferencia entre puntos</h3>
          <p className="text-sm text-gray-500 mt-1">
            Mueve existencias entre puntos físicos o tienda web
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Producto</label>
            <select
              className="input"
              value={form.product_id}
              onChange={(e) => setForm((p) => ({ ...p, product_id: e.target.value }))}
            >
              <option value="">Selecciona un producto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.sku}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Desde</label>
              <select
                className="input"
                value={form.from_location_id}
                onChange={(e) => setForm((p) => ({ ...p, from_location_id: e.target.value }))}
              >
                <option value="">Origen</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Hacia</label>
              <select
                className="input"
                value={form.to_location_id}
                onChange={(e) => setForm((p) => ({ ...p, to_location_id: e.target.value }))}
              >
                <option value="">Destino</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Cantidad</label>
            <input
              type="number"
              min="1"
              className="input"
              value={form.qty}
              onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))}
              placeholder="Ej: 10"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Notas</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Motivo de la transferencia..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? 'Procesando...' : <><ArrowRightLeft size={16} /> Transferir</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InventoryPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showReplenish, setShowReplenish] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: () =>
      productsApi
        .list({ include_inactive: true, per_page: 200 })
        .then((r) => r.data),
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['inventory-locations'],
    queryFn: () => locationsApi.list().then((r) => r.data),
  })

  const { data: lowStock = [], isLoading: loadingLowStock } = useQuery({
    queryKey: ['inventory-low-stock'],
    queryFn: () => inventoryApi.lowStock().then((r) => r.data),
  })

  const webLocation = useMemo(
    () => locations.find((l) => String(l.type).toLowerCase() === 'web'),
    [locations]
  )

  const physicalLocations = useMemo(
    () => locations.filter((l) => String(l.type).toLowerCase() === 'physical'),
    [locations]
  )

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return products

    return products.filter((p) =>
      `${p.name} ${p.sku} ${p.category_name || ''}`.toLowerCase().includes(term)
    )
  }, [products, search])

  const lowStockSet = useMemo(() => {
    const set = new Set()
    lowStock.forEach((row) => set.add(Number(row.product_id)))
    return set
  }, [lowStock])

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-locations'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-low-stock'] }),
    ])
    toast.success('Inventario actualizado')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500 mt-1">
            Control centralizado de stock para tienda web y puntos físicos
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={refreshAll}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>

          <button
            onClick={() => setShowReplenish(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <PackagePlus size={16} />
            Ingreso de mercancía
          </button>

          <button
            onClick={() => setShowTransfer(true)}
            className="btn-primary flex items-center gap-2"
          >
            <ArrowRightLeft size={16} />
            Transferir stock
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">Productos</p>
          <p className="text-2xl font-black text-gray-900 mt-2">
            {formatNumber(products.length)}
          </p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-500">Puntos físicos</p>
          <p className="text-2xl font-black text-gray-900 mt-2">
            {formatNumber(physicalLocations.length)}
          </p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-500">Tienda web</p>
          <p className="text-lg font-black text-brand-700 mt-3">
            {webLocation ? webLocation.name : 'No configurada'}
          </p>
        </div>

        <div className="card">
          <p className="text-sm text-gray-500">Alertas de stock</p>
          <p className="text-2xl font-black text-amber-600 mt-2">
            {formatNumber(lowStock.length)}
          </p>
        </div>
      </div>

      {/* Alertas */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <AlertTriangle size={18} className="text-amber-600" />
          <div>
            <h2 className="font-bold text-gray-900">Alertas de bajo stock</h2>
            <p className="text-xs text-gray-500 mt-1">
              Productos que requieren reposición pronta
            </p>
          </div>
        </div>

        {loadingLowStock ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : lowStock.length === 0 ? (
          <p className="text-sm text-gray-400">No hay productos con alerta de stock</p>
        ) : (
          <div className="space-y-3">
            {lowStock.slice(0, 8).map((item) => (
              <div
                key={item.product_id}
                className="border border-amber-100 bg-amber-50 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 line-clamp-1">
                    {item.product_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">SKU: {item.sku}</p>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-bold text-amber-700">
                    Stock: {formatNumber(item.total_stock)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Mínimo: {formatNumber(item.stock_min_alert)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Buscador y tabla principal */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Visión general del inventario</h2>
            <p className="text-xs text-gray-500 mt-1">
              Haz clic en un producto para ver el detalle por ubicación
            </p>
          </div>

          <div className="relative min-w-[280px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              className="input pl-9"
              placeholder="Buscar por nombre, SKU o categoría..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Producto</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Categoría</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Stock total</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Web</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Puntos físicos</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Estado</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Acción</th>
              </tr>
            </thead>

            <tbody>
              {loadingProducts ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Boxes size={40} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">No hay productos para este filtro</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const totalStock = Number(product.total_stock || 0)
                  const hasLowStock = lowStockSet.has(Number(product.id))
                  const webText = webLocation ? 'Disponible en detalle' : '—'

                  return (
                    <tr
                      key={product.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 line-clamp-1">
                            {product.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">SKU: {product.sku}</p>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {product.category_name || 'Sin categoría'}
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {formatNumber(totalStock)}
                      </td>

                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {webText}
                      </td>

                      <td className="px-4 py-3 text-center text-xs text-gray-500">
                        {formatNumber(physicalLocations.length)} puntos
                      </td>

                      <td className="px-4 py-3 text-center">
                        {hasLowStock ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                            <AlertTriangle size={12} />
                            Bajo stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            <CheckCircle size={12} />
                            Normal
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedProduct(product)}
                          className="text-brand-600 hover:text-brand-700 text-xs font-semibold"
                        >
                          Ver detalle
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

      {/* Resumen por ubicación */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <Warehouse size={18} className="text-brand-600" />
            <div>
              <h2 className="font-bold text-gray-900">Ubicaciones configuradas</h2>
              <p className="text-xs text-gray-500 mt-1">
                Tienda web y puntos físicos activos
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="font-semibold text-gray-900">{loc.name}</p>
                  <p className="text-xs text-gray-500 mt-1 capitalize">
                    Tipo: {loc.type}
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 text-xs text-gray-500">
                  <MapPin size={13} className="text-brand-600" />
                  {loc.phone || 'Sin teléfono'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <Boxes size={18} className="text-brand-600" />
            <div>
              <h2 className="font-bold text-gray-900">Resumen operativo</h2>
              <p className="text-xs text-gray-500 mt-1">
                Indicadores rápidos del inventario
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-sm text-gray-500">Productos monitoreados</p>
              <p className="text-2xl font-black text-gray-900 mt-2">
                {formatNumber(products.length)}
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-sm text-gray-500">Ubicaciones activas</p>
              <p className="text-2xl font-black text-gray-900 mt-2">
                {formatNumber(locations.length)}
              </p>
            </div>

            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
              <p className="text-sm text-gray-500">Productos en alerta</p>
              <p className="text-2xl font-black text-amber-700 mt-2">
                {formatNumber(lowStock.length)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {selectedProduct && (
        <ProductStockModal
          product={selectedProduct}
          locations={locations}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {showReplenish && (
        <ReplenishModal
          products={products}
          locations={locations}
          onClose={() => setShowReplenish(false)}
        />
      )}

      {showTransfer && (
        <TransferModal
          products={products}
          locations={locations}
          onClose={() => setShowTransfer(false)}
        />
      )}
    </div>
  )
}