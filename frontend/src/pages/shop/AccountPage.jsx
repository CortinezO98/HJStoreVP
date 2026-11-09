import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ShoppingBag, Package, Clock, CheckCircle2, Truck, XCircle, LogOut, UserRound } from 'lucide-react'
import { apiClient } from '../../services/api'
import { useAuthStore } from '../../store'
import { PageHeading, EmptyState, ErrorState } from '../../components/shop/StoreUI'

const formatCOP = (amount) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(amount) || 0)

const formatDate = (value) => {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
}

const STATES = {
  pending: { label: 'Pendiente', icon: Clock, className: 'store-status-pending' },
  paid: { label: 'Pagado', icon: CheckCircle2, className: 'store-status-paid' },
  preparing: { label: 'En preparación', icon: Package, className: 'store-status-neutral' },
  shipped: { label: 'Enviado', icon: Truck, className: 'store-status-neutral' },
  delivered: { label: 'Entregado', icon: CheckCircle2, className: 'store-status-delivered' },
  cancelled: { label: 'Cancelado', icon: XCircle, className: 'store-status-cancelled' },
  refunded: { label: 'Reembolsado', icon: XCircle, className: 'store-status-neutral' },
}

export default function AccountPage() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => apiClient.get('/orders/my-orders').then((response) => response.data),
  })

  const signOut = () => {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="store-container store-section">
      <PageHeading eyebrow="BIENVENIDO A HJSTOREVP" title="MI CUENTA"
        description="Tus compras, tus pedidos y toda tu información en un solo lugar." />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
        <aside className="store-card lg:sticky lg:top-28" aria-label="Información de tu cuenta">
          <div className="w-14 h-14 bg-neutral-950 text-white flex items-center justify-center mb-5">
            <UserRound size={26} strokeWidth={1.4}/>
          </div>
          <h2 className="font-black text-xl break-words">{user?.fullName || 'Mi perfil'}</h2>
          <p className="text-neutral-500 text-sm mt-1 break-all">{user?.email || 'Cliente HJStoreVP'}</p>
          <div className="border-t border-neutral-200 mt-6 pt-5 flex justify-between text-sm">
            <span className="text-neutral-500">Pedidos registrados</span>
            <strong>{orders.length}</strong>
          </div>
          <button type="button" className="store-button store-button-outline w-full mt-7"
            onClick={signOut}><LogOut size={16}/> CERRAR SESIÓN</button>
        </aside>

        <section className="min-w-0" aria-label="Historial de pedidos">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="uppercase font-black text-xl">MIS PEDIDOS</h2>
            {!isLoading && !isError && <span className="text-neutral-500 text-xs">{orders.length} registros</span>}
          </div>
          {isLoading ? (
            <div role="status" aria-label="Cargando pedidos" className="space-y-4">
              {Array.from({ length: 3 }, (_, i) =>
                <div key={i} className="h-40 border border-neutral-100 bg-neutral-50 animate-pulse"/>)}
            </div>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} description="No se pudo consultar tu historial de pedidos." />
          ) : orders.length === 0 ? (
            <EmptyState title="AÚN NO TIENES PEDIDOS" description="Tu próxima compra comienza explorando el catálogo." />
          ) : (
            <div className="space-y-5">
              {orders.map((order) => {
                const state = STATES[order.status] || STATES.pending
                const StateIcon = state.icon
                return (
                  <article key={order.id} className="store-card">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-3 pb-5 border-b border-neutral-200">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase mb-1">PEDIDO</p>
                        <h3 className="font-black text-base sm:text-lg break-all">{order.order_number}</h3>
                        <p className="text-xs text-neutral-500 mt-1">{formatDate(order.created_at)}</p>
                      </div>
                      <span className={`store-status-pill ${state.className} self-start`}><StateIcon size={14}/>{state.label}</span>
                    </div>
                    <div className="divide-y divide-neutral-100 py-2">
                      {(order.items || []).map((item, index) => (
                        <div key={`${item.product_id}-${index}`} className="flex flex-col sm:flex-row sm:justify-between gap-2 py-3 text-sm">
                          <span className="text-neutral-700 break-words">{item.product_name} <span className="text-neutral-500">× {item.qty}</span></span>
                          <strong className="shrink-0">{formatCOP(item.line_total)}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-neutral-200 pt-5 flex flex-col sm:flex-row sm:justify-between gap-3 sm:items-center">
                      <div>
                        <p className="text-[11px] font-bold tracking-wider text-neutral-500 uppercase">DESTINO</p>
                        <p className="text-sm mt-1 text-neutral-700">{[order.shipping_address?.city, order.shipping_address?.department].filter(Boolean).join(', ') || 'Por confirmar'}</p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-[11px] font-bold tracking-wider text-neutral-500 uppercase">TOTAL</p>
                        <p className="font-black text-xl mt-1">{formatCOP(order.total_amount)}</p>
                      </div>
                    </div>
                    {order.status === 'pending' && (
                      <p role="status" className="text-xs text-amber-800 bg-amber-50 px-4 py-3 mt-5">El pago de este pedido aún está pendiente de confirmación.</p>
                    )}
                  </article>
                )
              })}
            </div>
          )}
          <Link to="/catalogo" className="store-inline-link inline-flex items-center mt-8 gap-2"><ShoppingBag size={16}/> SEGUIR COMPRANDO</Link>
        </section>
      </div>
    </div>
  )
}
