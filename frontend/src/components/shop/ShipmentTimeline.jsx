import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, MapPin, Truck, CheckCircle2, AlertTriangle } from 'lucide-react'
import { apiClient } from '../../services/api'

const LABELS = {
  dispatched: 'Despachado',
  in_transit: 'En tránsito',
  out_for_delivery: 'En reparto',
  delivered: 'Entregado',
  exception: 'Novedad en la entrega',
}
const formatDate = value => value ? new Date(value).toLocaleString('es-CO', {
  dateStyle: 'medium', timeStyle: 'short',
}) : 'Sin fecha'

export default function ShipmentTimeline({ orderId, orderStatus }) {
  const [open, setOpen] = useState(false)
  const { data: shipment, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['order-tracking', orderId],
    queryFn: () => apiClient.get(`/shipments/orders/${orderId}`).then(({ data }) => data),
    enabled: open,
    retry: false,
    staleTime: 30_000,
  })

  if (['pending', 'cancelled', 'refunded'].includes(orderStatus)) return null

  return (
    <section className="border-t border-neutral-200 mt-5 pt-4" aria-label="Seguimiento del envío">
      <button type="button" aria-expanded={open} onClick={() => setOpen(value=>!value)}
        className="flex items-center justify-between gap-3 w-full min-h-11 text-sm font-bold">
        <span className="inline-flex gap-2 items-center"><Truck size={17}/> SEGUIMIENTO DEL ENVÍO</span>
        {open ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
      </button>
      {open && (
        <div className="mt-3">
          {isLoading && <p role="status" className="store-muted">Consultando estado de entrega…</p>}
          {isError && error?.response?.status === 404 &&
            <p role="status" className="text-sm bg-neutral-50 p-4 text-neutral-600">
              Tu pedido todavía no tiene una guía de transportadora registrada.
            </p>}
          {isError && error?.response?.status !== 404 &&
            <div role="alert" className="text-sm bg-red-50 text-red-800 p-4">
              No pudimos cargar el seguimiento.
              <button type="button" onClick={() => refetch()} className="underline ml-2">Reintentar</button>
            </div>}
          {shipment && (
            <div className="bg-neutral-50 p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pb-5 border-b border-neutral-200">
                <div>
                  <p className="store-eyebrow !mb-1">TRANSPORTADORA</p>
                  <p className="font-semibold">{shipment.carrier} · {shipment.service}</p>
                </div>
                <div>
                  <p className="store-eyebrow !mb-1">NÚMERO DE GUÍA</p>
                  <p className="font-mono font-bold break-all">{shipment.tracking_number}</p>
                </div>
              </div>
              <p className="flex items-center gap-2 mt-5 mb-4 font-bold text-sm">
                {shipment.status === 'delivered' ? <CheckCircle2 size={18}/> :
                  shipment.status === 'exception' ? <AlertTriangle size={18}/> : <MapPin size={18}/>}
                {LABELS[shipment.status] || shipment.status}
              </p>
              <ol className="space-y-4">
                {[...shipment.events].reverse().map(item=>(
                  <li key={item.id} className="border-l-2 border-neutral-300 pl-4">
                    <p className="text-sm font-bold">{LABELS[item.status] || item.status}</p>
                    <p className="text-xs text-neutral-500 mt-1">{formatDate(item.created_at)}</p>
                    {item.note && <p className="text-sm text-neutral-700 mt-2 whitespace-pre-wrap break-words">{item.note}</p>}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-neutral-500 mt-6">
                Los estados son actualizados manualmente por HJStoreVP; no se consultan automáticamente con la transportadora.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
