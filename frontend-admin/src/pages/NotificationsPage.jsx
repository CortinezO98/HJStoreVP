import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, RefreshCw, Clock, CheckCircle2, AlertCircle, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { notificationsApi } from '../services/api'

const LABELS = {
  order_created: 'Pedido registrado',
  payment_confirmed: 'Pago confirmado',
  order_cancelled: 'Pedido cancelado',
  order_preparing: 'En preparación',
  shipment_dispatched: 'Despachado',
  shipment_in_transit: 'En tránsito',
  shipment_out_for_delivery: 'En reparto',
  shipment_delivered: 'Entregado',
  shipment_exception: 'Incidencia de entrega',
  shipment_guide_updated: 'Guía corregida',
}
const STATUS = {
  pending: { text: 'Pendiente', badge: 'badge-yellow', icon: Clock },
  sending: { text: 'En envío', badge: 'badge-blue', icon: RefreshCw },
  sent: { text: 'Enviado', badge: 'badge-green', icon: CheckCircle2 },
  failed: { text: 'Fallido', badge: 'badge-red', icon: AlertCircle },
}
function dateText(value) {
  return value ? new Date(value).toLocaleString('es-CO', {
    dateStyle: 'short', timeStyle: 'short',
  }) : '—'
}

export default function NotificationsPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const { data: notifications = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-notifications', status],
    queryFn: () => notificationsApi.list(status ? { status_filter: status } : {}).then(r => r.data),
  })
  const retry = useMutation({
    mutationFn: id => notificationsApi.retry(id),
    onSuccess: () => {
      toast.success('Aviso devuelto a la cola de envío')
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['admin-notification-stats'] })
    },
    onError: err => toast.error(err?.response?.data?.detail || 'No fue posible reintentar'),
  })
  const { data: totals = { pending: 0, sending: 0, sent: 0, failed: 0 } } = useQuery({
    queryKey: ['admin-notification-stats'],
    queryFn: () => notificationsApi.stats().then(r => r.data),
  })
  const visible = notifications.filter(n =>
    [n.event_key, n.recipient, n.kind, n.subject].some(
      value => String(value || '').toLocaleLowerCase('es-CO').includes(search.toLocaleLowerCase('es-CO'))
    )
  )
  const counts = ['pending', 'sending', 'sent', 'failed'].map(key =>
    ({ key, count: totals[key] ?? 0 })
  )
  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <p className="admin-dashboard-overline">COMUNICACIÓN CON CLIENTES</p>
          <h1 className="text-3xl font-black tracking-tight">Notificaciones de pedidos</h1>
          <p className="text-sm text-slate-500 mt-2">Historial de avisos transaccionales generados por los pedidos y despachos.</p>
        </div>
        <button type="button" onClick={() => {
          refetch()
          queryClient.invalidateQueries({ queryKey: ['admin-notification-stats'] })
        }} className="btn-secondary inline-flex gap-2 items-center self-start">
          <RefreshCw size={16}/> Actualizar
        </button>
      </header>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {counts.map(item => {
          const Icon = STATUS[item.key].icon
          return (
            <div className="card" key={item.key}>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Icon size={17}/>{STATUS[item.key].text}
              </div>
              <p className="text-2xl font-black mt-2">{item.count}</p>
            </div>
          )
        })}
      </div>
      <div className="card space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <h2 className="font-black text-lg flex gap-2 items-center"><Mail size={19}/> Cola e historial</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <select aria-label="Filtrar por estado" className="input sm:w-40" value={status}
              onChange={event => setStatus(event.target.value)}>
              <option value="">Todos los estados</option>
              {Object.entries(STATUS).map(([key, val])=><option value={key} key={key}>{val.text}</option>)}
            </select>
            <div className="relative">
              <Search size={16} className="absolute top-3 left-3 text-slate-400"/>
              <input className="input pl-9 sm:w-64" aria-label="Buscar avisos"
                placeholder="Correo, evento o referencia" value={search}
                onChange={event=>setSearch(event.target.value)}/>
            </div>
          </div>
        </div>
        {isLoading ? <p className="text-sm text-slate-500 py-10 text-center" role="status">Consultando notificaciones…</p>
          : isError ? <div role="alert" className="py-10 text-center text-red-700">
            No pudimos cargar las notificaciones.
            <button type="button" className="btn-secondary ml-2" onClick={()=>refetch()}>Reintentar</button>
          </div>
            : visible.length === 0 ? <p className="py-12 text-center text-slate-500">No hay avisos para estos filtros.</p>
              : <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead><tr className="border-b text-left">
                    {['Evento', 'Destinatario', 'Pedido / ID', 'Estado', 'Intentos', 'Fecha', 'Acción'].map(label=>
                      <th className="px-3 py-3" key={label}>{label}</th>)}
                  </tr></thead>
                  <tbody>{visible.map(item=>{
                    const st = STATUS[item.status] || STATUS.pending
                    const Icon = st.icon
                    return <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-3 py-4 font-semibold">{LABELS[item.kind] || item.kind}</td>
                      <td className="px-3 py-4 break-all">{item.recipient}</td>
                      <td className="px-3 py-4 text-xs font-mono">#{item.order_id} · {item.id}</td>
                      <td className="px-3 py-4"><span className={st.badge}><Icon size={13}/>{st.text}</span></td>
                      <td className="px-3 py-4">{item.attempts}</td>
                      <td className="px-3 py-4">{dateText(item.sent_at || item.created_at)}</td>
                      <td className="px-3 py-4">{item.status === 'failed' ?
                        <button type="button" className="btn-secondary"
                          disabled={retry.isPending} onClick={()=>retry.mutate(item.id)}>Reintentar</button> : '—'}</td>
                    </tr>
                  })}</tbody>
                </table>
              </div>}
      </div>
      <p className="text-xs text-slate-500 leading-6">
        La generación de avisos no garantiza que se hayan enviado. El envío real se habilita por configuración SMTP,
        mediante un trabajador independiente; los fallos no detienen pedidos ni pagos. Se muestran hasta 100 registros por consulta.
      </p>
    </div>
  )
}
