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
  Filter,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
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
    <div className="admin-inventory-overlay">
      <div className="admin-inventory-modal admin-inventory-modal-wide" role="dialog" aria-modal="true" aria-label="Detalle de inventario">
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
      qc.invalidateQueries({ queryKey: ['inventory-omnichannel-overview'] })
      onClose()
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || error.message || 'Error en la reposición')
    },
  })

  return (
    <div className="admin-inventory-overlay">
      <div className="admin-inventory-modal" role="dialog" aria-modal="true" aria-label="Movimiento de inventario">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Ingreso de mercancía</h3>
          <p className="text-sm text-gray-500 mt-1">
            Registra nueva mercancía y asígnala al punto físico o tienda web
          </p>
        </div>

        <div className="admin-inventory-form">
          <div>
            <label className="form-label">Producto</label>
            <select
              className="form-control"
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
            <label className="form-label">Ubicación</label>
            <select
              className="form-control"
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
            <label className="form-label">Cantidad</label>
            <input
              type="number"
              min="1"
              className="form-control"
              value={form.qty}
              onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))}
              placeholder="Ej: 30"
            />
          </div>

          <div>
            <label className="form-label">Notas</label>
            <input
              className="form-control"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Proveedor, lote, observación..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="btn btn-outline-secondary flex-1">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="btn btn-primary flex-1 d-inline-flex align-items-center justify-content-center gap-2"
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
      qc.invalidateQueries({ queryKey: ['inventory-omnichannel-overview'] })
      onClose()
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || error.message || 'Error en la transferencia')
    },
  })

  return (
    <div className="admin-inventory-overlay">
      <div className="admin-inventory-modal" role="dialog" aria-modal="true" aria-label="Movimiento de inventario">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">Transferencia entre puntos</h3>
          <p className="text-sm text-gray-500 mt-1">
            Mueve existencias entre puntos físicos o tienda web
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 gap-4">
          <div>
            <label className="form-label">Producto</label>
            <select
              className="form-control"
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
              <label className="form-label">Desde</label>
              <select
                className="form-control"
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
              <label className="form-label">Hacia</label>
              <select
                className="form-control"
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
            <label className="form-label">Cantidad</label>
            <input
              type="number"
              min="1"
              className="form-control"
              value={form.qty}
              onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))}
              placeholder="Ej: 10"
            />
          </div>

          <div>
            <label className="form-label">Notas</label>
            <input
              className="form-control"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Motivo de la transferencia..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="btn btn-outline-secondary flex-1">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="btn btn-primary flex-1 d-inline-flex align-items-center justify-content-center gap-2"
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
  const [stockFilter, setStockFilter] = useState('all')
  const [activeFilter, setActiveFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(15)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showReplenish, setShowReplenish] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [matrixSearch, setMatrixSearch] = useState('')
  const [matrixPage, setMatrixPage] = useState(1)
  const { data: matrix, isLoading: matrixLoading, isError: matrixError } = useQuery({
    queryKey: ['inventory-omnichannel-overview', matrixSearch, matrixPage],
    queryFn: () => inventoryApi.overview({
      search: matrixSearch || undefined,
      page: matrixPage,
      per_page: 25,
    }).then((response) => response.data),
  })

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: async () => {
      // El backend limita las páginas a 100 elementos; recorrerlas evita listados incompletos.
      const all = []
      let page = 1
      while (true) {
        const { data } = await productsApi.list({ include_inactive: true, page, per_page: 100 })
        all.push(...data)
        if (data.length < 100) break
        page += 1
      }
      return all
    },
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

  const lowStockSet = useMemo(() => new Set(lowStock.map(row => Number(row.product_id))), [lowStock])

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es')
    return products.filter(product => {
      const text = `${product.name} ${product.sku} ${product.category_name || ''}`.toLocaleLowerCase('es')
      const matchesTerm = !term || text.includes(term)
      const flagged = lowStockSet.has(Number(product.id))
      const stock = Number(product.total_stock || 0)
      const matchesStock = stockFilter === 'all' ||
        (stockFilter === 'low' && flagged) ||
        (stockFilter === 'ok' && !flagged) ||
        (stockFilter === 'zero' && stock === 0)
      const matchesActive = activeFilter === 'all' ||
        (activeFilter === 'active' && Boolean(product.active)) ||
        (activeFilter === 'inactive' && !Boolean(product.active))
      return matchesTerm && matchesStock && matchesActive
    }).sort((a, b) => {
      if (sortBy === 'stock_asc') return Number(a.total_stock || 0) - Number(b.total_stock || 0)
      if (sortBy === 'stock_desc') return Number(b.total_stock || 0) - Number(a.total_stock || 0)
      if (sortBy === 'sku') return String(a.sku || '').localeCompare(String(b.sku || ''), 'es')
      return String(a.name || '').localeCompare(String(b.name || ''), 'es')
    })
  }, [products, search, stockFilter, activeFilter, lowStockSet, sortBy])

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / perPage))
  const currentPage = Math.min(page, pageCount)
  const pageProducts = filteredProducts.slice((currentPage - 1) * perPage, currentPage * perPage)
  const filtersActive = Boolean(search || stockFilter !== 'all' || activeFilter !== 'all' || sortBy !== 'name')
  const clearFilters = () => {
    setSearch(''); setStockFilter('all'); setActiveFilter('all'); setSortBy('name'); setPage(1)
  }

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-locations'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-low-stock'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-omnichannel-overview'] }),
    ])
    toast.success('Inventario actualizado')
  }

  return (
    <div className="admin-inventory-page space-y-6">
      <header className="admin-page-intro flex-wrap">
        <div>
          <p className="admin-page-kicker">Operación omnicanal</p>
          <h1 className="admin-page-heading">Inventario</h1>
          <p className="admin-page-description">Consulta existencias, detecta alertas y administra entradas y transferencias sin salir del módulo.</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button type="button" onClick={refreshAll} className="btn btn-outline-secondary d-inline-flex align-items-center gap-2">
            <RefreshCw size={16}/> Actualizar
          </button>
          <button type="button" onClick={() => setShowReplenish(true)} className="btn btn-outline-primary d-inline-flex align-items-center gap-2">
            <PackagePlus size={16}/> Ingreso de mercancía
          </button>
          <button type="button" onClick={() => setShowTransfer(true)} className="btn btn-primary d-inline-flex align-items-center gap-2">
            <ArrowRightLeft size={16}/> Transferir stock
          </button>
        </div>
      </header>
      <div className="row g-3" aria-label="Indicadores de inventario">
        {[
          { label: 'Productos monitoreados', value: formatNumber(products.length) },
          { label: 'Puntos físicos', value: formatNumber(physicalLocations.length) },
          { label: 'Canal web', value: webLocation?.name || 'No configurado' },
          { label: 'Alertas de stock', value: formatNumber(lowStock.length) },
        ].map(item => <div key={item.label} className="col-12 col-sm-6 col-xl-3">
          <div className="admin-catalog-stat"><span>{item.label}</span><strong className="admin-inventory-stat-value">{item.value}</strong></div>
        </div>)}
      </div>

      {/* Matriz omnicanal — datos agregados directamente desde la BD. */}
      <section className="card" aria-label="Matriz omnicanal de existencias">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-bold text-gray-900">Existencias por sede y disponibilidad web</h2>
            <p className="text-sm text-gray-600 mt-1">
              Stock global: suma de sedes. Venta web: máximo disponible en una ubicación activa.
              Las variantes se muestran como referencias SKU independientes.
            </p>
          </div>
          <div className="min-w-0">
            <label htmlFor="matrix-stock-search" className="text-xs text-gray-500">Buscar SKU o producto</label>
            <input
              id="matrix-stock-search" type="search" className="form-control"
              placeholder="Buscar referencia..."
              value={matrixSearch}
              onChange={(event) => { setMatrixSearch(event.target.value); setMatrixPage(1) }}
            />
          </div>
        </div>
        {matrixError ? (
          <p role="alert" className="text-red-700">No se pudo cargar la matriz de existencias.</p>
        ) : matrixLoading ? (
          <p className="text-sm text-gray-500">Consultando existencias por sede...</p>
        ) : matrix && (
          <>
            <p className="text-xs text-gray-500 mb-3">
              {formatNumber(matrix.total_products)} referencias ·
              {' '}{matrix.locations.filter((loc) => loc.active).length} ubicaciones activas
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-600">
                    <th scope="col" className="py-2 px-2">Producto / SKU</th>
                    <th scope="col" className="py-2 px-2 text-right">Global</th>
                    <th scope="col" className="py-2 px-2 text-right">Web</th>
                    {matrix.locations.map((loc) => (
                      <th scope="col" key={loc.id} className="py-2 px-2 text-right whitespace-nowrap">
                        {loc.name}{loc.active ? '' : ' (inactiva)'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.items.map((item) => {
                    const stockByLocation = new Map(item.locations.map((loc) => [loc.location_id, loc]))
                    return (
                      <tr key={item.product_id} className="border-b border-gray-100">
                        <td className="py-3 px-2">
                          <span className="font-semibold text-gray-900">{item.name}</span>
                          <span className="block text-xs text-gray-500">{item.sku}
                            {item.parent_product_id ? ' · Variante' : ''}
                            {!item.active ? ' · Inactivo' : ''}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right font-semibold">{formatNumber(item.global_available)}</td>
                        <td className="py-3 px-2 text-right font-semibold">{formatNumber(item.web_fulfillable)}</td>
                        {matrix.locations.map((loc) => (
                          <td key={loc.id} className="py-3 px-2 text-right">
                            {formatNumber(stockByLocation.get(loc.id)?.qty_available || 0)}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {matrix.items.length === 0 && (
              <p className="text-sm text-gray-500 mt-3">No se encontraron referencias.</p>
            )}
            <div className="flex items-center justify-between gap-3 mt-4">
              <button type="button" className="btn btn-outline-secondary"
                disabled={matrixPage <= 1}
                onClick={() => setMatrixPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft size={16} /> Anterior
              </button>
              <span className="text-xs text-gray-500">
                Página {matrixPage} de {Math.max(1, Math.ceil(matrix.total_products / 25))}
              </span>
              <button type="button" className="btn btn-outline-secondary"
                disabled={matrixPage * 25 >= matrix.total_products}
                onClick={() => setMatrixPage((p) => p + 1)}>
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Las existencias cambian con ventas, reservas, ingresos y transferencias. Actualiza para consultar
              los valores recientes. No se combinan automáticamente unidades de distintas sedes para un pedido web.
            </p>
          </>
        )}
      </section>

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

      {/* Visión general y filtros — no alteran operaciones ni existencias. */}
      <section className="admin-catalog-filter card" aria-label="Filtros de inventario">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <h2 className="h6 fw-bold m-0 d-inline-flex align-items-center gap-2"><Filter size={18}/> Buscar inventario</h2>
          <button className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
            type="button" disabled={!filtersActive} onClick={clearFilters}>
            <RotateCcw size={14}/> Limpiar filtros
          </button>
        </div>
        <div className="row g-3">
          <div className="col-12 col-lg-5">
            <label htmlFor="inventory-search" className="form-label">Producto o referencia</label>
            <div className="admin-catalog-search"><Search size={17} aria-hidden="true"/>
              <input id="inventory-search" className="form-control" type="search"
                placeholder="Nombre, SKU o categoría…" value={search}
                onChange={event => { setSearch(event.target.value); setPage(1) }}/>
            </div>
          </div>
          <div className="col-6 col-lg-2">
            <label className="form-label" htmlFor="inventory-stock-filter">Existencias</label>
            <select id="inventory-stock-filter" className="form-select" value={stockFilter}
              onChange={event => { setStockFilter(event.target.value); setPage(1) }}>
              <option value="all">Todas</option>
              <option value="low">Bajo stock</option>
              <option value="zero">Sin stock</option>
              <option value="ok">Sin alerta</option>
            </select>
          </div>
          <div className="col-6 col-lg-2">
            <label className="form-label" htmlFor="inventory-active-filter">Visibilidad</label>
            <select id="inventory-active-filter" className="form-select" value={activeFilter}
              onChange={event => { setActiveFilter(event.target.value); setPage(1) }}>
              <option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option>
            </select>
          </div>
          <div className="col-12 col-lg-3">
            <label className="form-label" htmlFor="inventory-sort">Ordenar</label>
            <select id="inventory-sort" className="form-select" value={sortBy}
              onChange={event => { setSortBy(event.target.value); setPage(1) }}>
              <option value="name">Nombre (A–Z)</option>
              <option value="sku">SKU</option>
              <option value="stock_asc">Menos existencias</option>
              <option value="stock_desc">Más existencias</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card p-0 overflow-hidden" aria-label="Inventario de productos">
        <div className="px-5 py-4 border-b border-gray-100 d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>
            <h2 className="h6 fw-bold mb-1">Visión general del inventario</h2>
            <p className="text-secondary small mb-0">Consulta el stock desglosado por ubicación desde el detalle de cada producto.</p>
          </div>
          <span className="badge text-bg-light border text-secondary">{filteredProducts.length} resultados</span>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle admin-inventory-table mb-0">
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
                pageProducts.map((product) => {
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
                          className="btn btn-sm btn-outline-primary"
                          aria-label={`Ver existencias por ubicación de ${product.name}`}
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
      </section>

      <div className="admin-catalog-pagination">
        <span className="text-secondary small">
          {filteredProducts.length === 0 ? 'Sin resultados' : `Mostrando ${(currentPage - 1) * perPage + 1}–${Math.min(currentPage * perPage, filteredProducts.length)} de ${filteredProducts.length}`}
        </span>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <label htmlFor="inventory-per-page" className="text-secondary small">Por página</label>
          <select id="inventory-per-page" className="form-select form-select-sm admin-catalog-per-page"
            value={perPage} onChange={event => { setPerPage(Number(event.target.value)); setPage(1) }}>
            {[10, 15, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn btn-sm btn-outline-secondary" type="button" aria-label="Página anterior"
            disabled={currentPage === 1} onClick={() => setPage(old => Math.max(1, old - 1))}><ChevronLeft size={16}/></button>
          <span className="small fw-semibold">{currentPage} / {pageCount}</span>
          <button className="btn btn-sm btn-outline-secondary" type="button" aria-label="Página siguiente"
            disabled={currentPage === pageCount} onClick={() => setPage(old => Math.min(pageCount, old + 1))}><ChevronRight size={16}/></button>
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