import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Truck, CheckCircle2, AlertCircle } from 'lucide-react'
import { shipmentsApi } from '../services/api'
import toast from 'react-hot-toast'

const EVENTS = [
  ['in_transit', 'En tránsito'],
  ['out_for_delivery', 'En reparto'],
  ['delivered', 'Entregado'],
  ['exception', 'Novedad o incidencia'],
]
const LABELS = Object.fromEntries([['dispatched', 'Despachado'], ...EVENTS])
const TRANSITIONS = {
  dispatched: ['in_transit', 'out_for_delivery', 'delivered', 'exception'],
  in_transit: ['out_for_delivery', 'delivered', 'exception'],
  out_for_delivery: ['delivered', 'exception'],
  exception: ['in_transit', 'out_for_delivery', 'delivered'],
  delivered: [],
}
const dateText = value => value ? new Date(value).toLocaleString('es-CO', {
  dateStyle: 'medium', timeStyle: 'short',
}) : 'Sin fecha'

export default function ShipmentManager({ order }) {
  const queryClient = useQueryClient()
  const [guide, setGuide] = useState('')
  const [carrier, setCarrier] = useState(order.shipping_address?.carrier || '')
  const [service, setService] = useState(order.shipping_address?.shipping_service || '')
  const [dispatchNote, setDispatchNote] = useState('')
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')

  const { data: shipment, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-shipment', order.id],
    queryFn: () => shipmentsApi.get(order.id).then(({ data }) => data),
    retry: false,
  })
  const noGuide = isError && error?.response?.status === 404
  const canDispatch = ['paid', 'preparing'].includes(order.status) && noGuide
  const canUpdate = Boolean(shipment) && shipment.status !== 'delivered'

  const saveDispatch = useMutation({
    mutationFn: () => shipmentsApi.dispatch(order.id, {
      tracking_number: guide.trim(), carrier: carrier.trim(), service: service.trim(),
      note: dispatchNote.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Guía y despacho registrados')
      refetch()
      queryClient.invalidateQueries({ queryKey: ['web-orders-list'] })
      setDispatchNote('')
    },
    onError: error => toast.error(error?.response?.data?.detail || 'No fue posible registrar el despacho'),
  })
  const saveEvent = useMutation({
    mutationFn: () => shipmentsApi.addEvent(order.id, { status, note: note.trim() || null }),
    onSuccess: () => {
      toast.success('Seguimiento actualizado')
      setStatus('')
      setNote('')
      refetch()
      queryClient.invalidateQueries({ queryKey: ['web-orders-list'] })
    },
    onError: error => toast.error(error?.response?.data?.detail || 'No fue posible actualizar el seguimiento'),
  })

  return (
    <section className="border-t border-slate-200 pt-6 mt-6" aria-label="Despacho y seguimiento">
      <div className="flex gap-2 items-center mb-4">
        <Truck size={20} className="text-indigo-700" aria-hidden="true"/>
        <h4 className="font-black text-lg text-slate-900">Despacho y seguimiento</h4>
      </div>
      {isLoading && <p role="status" className="text-sm text-slate-500">Consultando guía…</p>}
      {isError && !noGuide && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 p-3">
          No se pudo consultar el despacho.
          <button type="button" className="underline ml-2" onClick={() => refetch()}>Reintentar</button>
        </div>
      )}
      {noGuide && !canDispatch && (
        <p className="text-sm text-amber-800 bg-amber-50 p-3">
          Aún no tiene guía. El pedido debe estar pagado o en preparación para despacharlo.
        </p>
      )}
      {canDispatch && (
        <form className="space-y-3 bg-slate-50 border border-slate-200 p-4"
          onSubmit={event => { event.preventDefault(); saveDispatch.mutate() }}>
          <p className="text-sm text-slate-600">Registra la guía emitida por la transportadora. Esta acción marcará el pedido como enviado.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold mb-1" htmlFor="shipping-guide">Número de guía</label>
              <input id="shipping-guide" className="input" required minLength={4} maxLength={120} value={guide}
                onChange={event=>setGuide(event.target.value)} placeholder="Guía de transportadora"/></div>
            <div><label className="block text-xs font-bold mb-1" htmlFor="shipping-carrier">Transportadora</label>
              <input id="shipping-carrier" className="input" required minLength={2} maxLength={120} value={carrier}
                onChange={event=>setCarrier(event.target.value)} /></div>
            <div><label className="block text-xs font-bold mb-1" htmlFor="shipping-service">Servicio</label>
              <input id="shipping-service" className="input" required minLength={2} maxLength={120} value={service}
                onChange={event=>setService(event.target.value)} /></div>
            <div><label className="block text-xs font-bold mb-1" htmlFor="shipping-dispatch-note">Observación pública (opcional)</label>
              <input id="shipping-dispatch-note" className="input" maxLength={500} value={dispatchNote}
                onChange={event=>setDispatchNote(event.target.value)} placeholder="Visible para el cliente"/></div>
          </div>
          <button type="submit" disabled={saveDispatch.isPending} className="btn-primary inline-flex items-center gap-2">
            <Truck size={17}/>{saveDispatch.isPending ? 'Registrando…' : 'Confirmar despacho'}
          </button>
        </form>
      )}
      {shipment && (
        <div className="space-y-5">
          <div className="bg-indigo-50 border border-indigo-100 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><p className="text-[11px] uppercase font-bold text-slate-500">Transportadora / servicio</p>
              <p className="font-semibold mt-1">{shipment.carrier} · {shipment.service}</p></div>
            <div><p className="text-[11px] uppercase font-bold text-slate-500">Número de guía</p>
              <p className="font-mono text-sm font-bold mt-1 break-all">{shipment.tracking_number}</p></div>
            <div><p className="text-[11px] uppercase font-bold text-slate-500">Estado registrado</p>
              <p className="font-bold text-indigo-900 mt-1">{LABELS[shipment.status] || shipment.status}</p></div>
            <div><p className="text-[11px] uppercase font-bold text-slate-500">Fecha de despacho</p>
              <p className="text-sm mt-1">{dateText(shipment.dispatched_at)}</p></div>
          </div>
          {canUpdate && (
            <form className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 sm:items-end"
              onSubmit={event=>{event.preventDefault();saveEvent.mutate()}}>
              <div><label htmlFor="shipping-new-status" className="block text-xs font-bold mb-1">Nueva novedad</label>
                <select className="input" id="shipping-new-status" required value={status}
                  onChange={event=>setStatus(event.target.value)}>
                  <option value="">Seleccionar estado</option>
                  {EVENTS.filter(([key]) => TRANSITIONS[shipment.status]?.includes(key)).map(([key,label])=>
                    <option value={key} key={key}>{label}</option>)}
                </select></div>
              <div><label htmlFor="shipping-status-note" className="block text-xs font-bold mb-1">Nota pública (opcional)</label>
                <input className="input" id="shipping-status-note" value={note} maxLength={500}
                  onChange={event=>setNote(event.target.value)} placeholder="Detalle de seguimiento"/></div>
              <button type="submit" className="btn-primary" disabled={!status || saveEvent.isPending}>
                {saveEvent.isPending ? 'Guardando…' : 'Actualizar'}
              </button>
            </form>
          )}
          {shipment.status === 'delivered' && <p className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 p-3"><CheckCircle2 size={17}/> Entrega registrada. El historial está cerrado.</p>}
          {shipment.status === 'exception' && <p className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 p-3"><AlertCircle size={17}/> Hay una incidencia de entrega pendiente de resolución.</p>}
          <div>
            <h5 className="font-bold text-sm flex items-center gap-2 mb-3"><ClipboardList size={17}/> Historial de movimientos</h5>
            <ol className="space-y-3">
              {shipment.events.map(item => (
                <li key={item.id} className="border-l-2 border-indigo-200 pl-4">
                  <p className="text-sm font-bold">{LABELS[item.status] || item.status}</p>
                  <p className="text-xs text-slate-500">{dateText(item.created_at)}</p>
                  {item.note && <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap break-words">{item.note}</p>}
                </li>
              ))}
            </ol>
            <p className="text-xs text-slate-500 mt-4">Novedades registradas por HJStoreVP; no son eventos automáticos de la transportadora.</p>
          </div>
        </div>
      )}
    </section>
  )
}
