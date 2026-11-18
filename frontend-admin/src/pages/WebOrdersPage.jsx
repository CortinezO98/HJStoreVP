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
    RotateCcw,
    ChevronLeft,
    ChevronRight,
    SlidersHorizontal,
} from 'lucide-react'
import { ordersApi } from '../services/api'
import ShipmentManager from '../components/ShipmentManager'
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
        <div className="admin-web-orders-overlay">
        <div role="dialog" aria-modal="true" aria-label="Detalle del pedido y despacho" className="admin-web-orders-modal">
            <div className="admin-web-orders-modal-header">
            <div>
                <h3 className="text-lg font-bold text-gray-900">Detalle del pedido web</h3>
                <p className="text-sm text-gray-500 mt-1">{order.order_number}</p>
            </div>
            <button
                type="button"
                aria-label="Cerrar detalle del pedido"
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

            {Number(order.discount_amount || 0) > 0 && <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-700 mb-1">Cupón aplicado {order.coupon_code || ''}</p>
                <p className="font-bold text-emerald-800">− {formatCOP(order.discount_amount)}</p>
            </div>}
            <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Envío</p>
                <p className="font-bold text-gray-900">{formatCOP(order.shipping_amount || 0)}</p>
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

                {shipping.carrier && (
                  <div className="rounded-xl border border-gray-100 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Transportadora y servicio</p>
                    <p className="font-semibold text-gray-900">{shipping.carrier} · {shipping.shipping_service}</p>
                    <p className="text-sm text-gray-500 mt-1">Entrega estimada: {shipping.shipping_days_min}–{shipping.shipping_days_max} días</p>
                  </div>
                )}
                <div className="rounded-xl bg-brand-50 border border-brand-100 p-4">
                    <p className="text-sm text-gray-500 mb-1">Total del pedido</p>
                    <p className="text-2xl font-black text-brand-700">{formatCOP(order.total_amount)}</p>
                </div>
                </div>
            </div>
            <div className="px-6 pb-6">
              <ShipmentManager order={order} />
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
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(15)
  const [selectedOrder, setSelectedOrder] = useState(null)

  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['web-orders-list', statusFilter],
    queryFn: () => ordersApi.list(statusFilter ? { status_filter: statusFilter } : {}).then(r => r.data),
  })
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es')
    return orders.filter(order => {
      const shipping = order.shipping_address || {}
      const text = [order.order_number, shipping.full_name, shipping.phone,
        shipping.city, shipping.department].filter(Boolean).join(' ').toLocaleLowerCase('es')
      return !term || text.includes(term)
    }).sort((a,b) => {
      if (sortBy === 'amount_desc') return Number(b.total_amount || 0) - Number(a.total_amount || 0)
      if (sortBy === 'amount_asc') return Number(a.total_amount || 0) - Number(b.total_amount || 0)
      const diff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      return sortBy === 'oldest' ? -diff : diff
    })
  }, [orders, search, sortBy])
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / perPage))
  const currentPage = Math.min(page, pageCount)
  const pageOrders = filteredOrders.slice((currentPage - 1) * perPage, currentPage * perPage)
  const totals = useMemo(() => ({
    totalOrders: filteredOrders.length,
    totalRevenue: filteredOrders.reduce((acc, order) => acc + Number(order.total_amount || 0), 0),
    pendingOrders: filteredOrders.filter(order => order.status === 'pending').length,
    paidOrders: filteredOrders.filter(order => order.status === 'paid').length,
  }), [filteredOrders])
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const { data } = await ordersApi.updateStatus(id, status)
      return data
    },
    onSuccess: (_, vars) => {
      toast.success(`Pedido actualizado a ${STATUS_META[vars.status]?.label || vars.status}`)
      queryClient.invalidateQueries({ queryKey: ['web-orders-list'] })
    },
    onError: error => {
      toast.error(error?.response?.data?.detail || 'No fue posible actualizar el estado del pedido')
    },
  })
  const handleStatusChange = (orderId, newStatus) => {
    statusMutation.mutate({ id: orderId, status: newStatus })
  }
  const clearFilters = () => { setSearch(''); setStatusFilter(''); setSortBy('newest'); setPage(1) }
  const filterActive = Boolean(search || statusFilter || sortBy !== 'newest')

  return (
    <div className="admin-web-orders-page">
      <header className="admin-page-intro flex-wrap">
        <div>
          <p className="admin-page-kicker">Ventas en línea · Seguimiento</p>
          <h1 className="admin-page-heading">Pedidos web</h1>
          <p className="admin-page-description">Consulta las compras, revisa sus datos y gestiona los despachos desde un solo lugar.</p>
        </div>
        <button type="button" className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
          onClick={() => refetch()}><RotateCcw size={16}/> Actualizar</button>
      </header>

      <div className="row g-3 mb-4" aria-label="Resumen de pedidos filtrados">
        {[
          { label: 'Pedidos encontrados', value: totals.totalOrders.toLocaleString('es-CO') },
          { label: 'Valor de los pedidos', value: formatCOP(totals.totalRevenue) },
          { label: 'Pendientes', value: totals.pendingOrders.toLocaleString('es-CO') },
          { label: 'Pagados', value: totals.paidOrders.toLocaleString('es-CO') },
        ].map(item => <div className="col-12 col-sm-6 col-xl-3" key={item.label}>
          <div className="admin-catalog-stat"><span>{item.label}</span>
            <strong className="admin-web-orders-kpi-value">{item.value}</strong>
          </div>
        </div>)}
      </div>

      <section className="card admin-catalog-filter mb-4" aria-label="Buscar y filtrar pedidos">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
          <h2 className="h6 fw-bold mb-0 d-inline-flex align-items-center gap-2">
            <SlidersHorizontal size={17}/> Filtros del listado
          </h2>
          <button type="button" onClick={clearFilters} disabled={!filterActive}
            className="btn btn-sm btn-outline-secondary">Limpiar filtros</button>
        </div>
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <label className="form-label" htmlFor="web-order-search">Buscar pedido</label>
            <div className="admin-catalog-search">
              <Search size={17} aria-hidden="true"/>
              <input type="search" id="web-order-search" className="form-control"
                placeholder="Orden, cliente, teléfono o destino" value={search}
                onChange={event => { setSearch(event.target.value); setPage(1) }}/>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="web-order-status">Estado</label>
            <select id="web-order-status" className="form-select" value={statusFilter}
              onChange={event => { setStatusFilter(event.target.value); setPage(1) }}>
              {STATUS_OPTIONS.map(option => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="web-order-sort">Ordenar</label>
            <select id="web-order-sort" className="form-select" value={sortBy}
              onChange={event => { setSortBy(event.target.value); setPage(1) }}>
              <option value="newest">Más recientes</option>
              <option value="oldest">Más antiguos</option>
              <option value="amount_desc">Mayor valor</option>
              <option value="amount_asc">Menor valor</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card p-0 overflow-hidden" aria-label="Listado de pedidos web">
        <div className="px-5 py-4 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div><h2 className="h6 fw-bold mb-1">Listado de pedidos</h2>
            <p className="text-secondary small mb-0">Abre un pedido para consultar sus productos, dirección y seguimiento.</p>
          </div>
          <span className="badge text-bg-light border text-secondary">{filteredOrders.length} resultados</span>
        </div>
        {isError && <div className="alert alert-danger m-3" role="alert">
          No fue posible cargar los pedidos.
          <button type="button" className="btn btn-outline-danger btn-sm ms-2" onClick={() => refetch()}>Reintentar</button>
        </div>}
        <div className="table-responsive">
          <table className="table table-hover align-middle admin-web-orders-table mb-0">
            <thead><tr>
              <th scope="col">Orden</th><th scope="col">Cliente</th><th scope="col">Destino</th>
              <th scope="col" className="text-end">Total</th><th scope="col">Estado</th>
              <th scope="col">Fecha</th><th scope="col">Actualizar</th><th scope="col">Detalle</th>
            </tr></thead>
            <tbody>
              {isLoading ? Array.from({ length: 6 }).map((_,i) =>
                <tr key={i}>{Array.from({ length: 8 }).map((__,j) =>
                  <td key={j}><div className="placeholder-glow"><span className="placeholder col-8"/></div></td>)}</tr>)
                : isError ? null
                : filteredOrders.length === 0 ? <tr><td colSpan={8} className="text-center py-5 text-secondary">
                  <Package size={30} className="mx-auto mb-2"/>
                  <p>No hay pedidos que coincidan con los filtros.</p>
                  {filterActive && <button type="button" className="btn btn-outline-secondary btn-sm"
                    onClick={clearFilters}>Limpiar filtros</button>}
                </td></tr> : pageOrders.map(order => {
                const shipping = order.shipping_address || {}
                const statusInfo = STATUS_META[order.status] || STATUS_META.pending
                const StatusIcon = statusInfo.icon
                return <tr key={order.id}>
                  <td><span className="admin-web-orders-number">{order.order_number}</span></td>
                  <td><div className="fw-semibold">{shipping.full_name || 'No disponible'}</div>
                    <small className="text-secondary">{shipping.phone || 'Sin teléfono'}</small></td>
                  <td><div>{shipping.address_line1 || 'Dirección no disponible'}</div>
                    <small className="text-secondary">{[shipping.city, shipping.department].filter(Boolean).join(', ') || 'Sin ciudad'}</small></td>
                  <td className="text-end fw-bold">{formatCOP(order.total_amount)}</td>
                  <td><span className={`admin-web-order-status ${order.status}`}>
                    <StatusIcon size={14} aria-hidden="true"/>{statusInfo.label}</span></td>
                  <td className="text-secondary">{formatDate(order.created_at)}</td>
                  <td>
                    <label className="visually-hidden" htmlFor={`order-status-${order.id}`}>Estado de {order.order_number}</label>
                    <select id={`order-status-${order.id}`} className="form-select form-select-sm admin-web-order-select"
                      value={order.status} onChange={event => handleStatusChange(order.id,event.target.value)}
                      disabled={statusMutation.isPending}>
                      {NEXT_STATUS_OPTIONS.map(status => <option key={status} value={status}
                        disabled={status === 'shipped' || status === 'delivered'}>
                        {STATUS_META[status]?.label || status}
                      </option>)}
                    </select>
                  </td>
                  <td><button type="button" className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2"
                    aria-label={`Ver detalle del pedido ${order.order_number}`}
                    onClick={() => setSelectedOrder(order)}><Eye size={15}/> Ver detalle</button></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="admin-catalog-pagination mt-3">
        <span className="text-secondary small">{filteredOrders.length === 0 ? 'Sin resultados' :
          `Mostrando ${(currentPage - 1) * perPage + 1}–${Math.min(currentPage * perPage,filteredOrders.length)} de ${filteredOrders.length}`}
        </span>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <label htmlFor="web-orders-per-page" className="text-secondary small">Por página</label>
          <select id="web-orders-per-page" className="form-select form-select-sm admin-catalog-per-page"
            value={perPage} onChange={event => { setPerPage(Number(event.target.value)); setPage(1) }}>
            {[10,15,25,50].map(number => <option key={number} value={number}>{number}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Página anterior"
            disabled={currentPage === 1} onClick={() => setPage(old => Math.max(1,old - 1))}><ChevronLeft size={16}/></button>
          <span className="small fw-semibold">{currentPage} / {pageCount}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Página siguiente"
            disabled={currentPage >= pageCount} onClick={() => setPage(old => Math.min(pageCount,old + 1))}><ChevronRight size={16}/></button>
        </div>
      </div>
      {selectedOrder && <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)}/>}
    </div>
  )
}
