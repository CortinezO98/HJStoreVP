import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, ChevronDown, ChevronUp, MessageSquareWarning } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '../../services/api'

const STATES = {
  submitted: 'Recibida', under_review: 'En revisión', approved: 'Aprobada',
  rejected: 'Rechazada', received: 'Mercancía recibida', closed: 'Cerrada',
}
const REFUNDS = {
  not_requested: 'Sin reembolso en trámite',
  pending_external: 'Reembolso pendiente de gestión externa',
  externally_recorded: 'Reembolso externo registrado por administración',
}
const COP = n => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(n) || 0)

function SubmitCase({ order, onSuccess }) {
  const [kind, setKind] = useState('return')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState('Producto recibido en mal estado')
  const [description, setDescription] = useState('')
  const mutation = useMutation({
    mutationFn: payload => apiClient.post('/post-sale', payload),
    onSuccess: () => { toast.success('Solicitud enviada correctamente'); onSuccess() },
    onError: err => toast.error(err?.response?.data?.detail || 'No se pudo registrar la solicitud'),
  })
  const submit = event => {
    event.preventDefault()
    mutation.mutate({
      order_id: order.id, kind,
      order_item_id: kind === 'return' ? Number(itemId) : null,
      qty: kind === 'return' ? Number(qty) : 0,
      reason: reason.trim(), description: description.trim(),
    })
  }
  return (
    <form onSubmit={submit} className="space-y-4 bg-neutral-50 border border-neutral-200 p-4 sm:p-6">
      <p className="text-xs text-neutral-600">Tu solicitud será evaluada. Enviarla no significa que se haya aprobado una devolución o un reembolso.</p>
      <div>
        <label htmlFor={`post-kind-${order.id}`} className="store-label">Tipo de solicitud</label>
        <select id={`post-kind-${order.id}`} className="store-input" value={kind} onChange={e=>setKind(e.target.value)}>
          <option value="return">Solicitar devolución de un producto</option>
          <option value="incident">Informar un problema con el pedido</option>
        </select>
      </div>
      {kind === 'return' && (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_100px] gap-3">
          <div>
            <label htmlFor={`post-item-${order.id}`} className="store-label">Producto</label>
            <select id={`post-item-${order.id}`} required className="store-input" value={itemId}
              onChange={e=>{setItemId(e.target.value);setQty(1)}}>
              <option value="">Selecciona un artículo</option>
              {(order.items || []).map(item=><option key={item.id} value={item.id}>
                {item.product_name} (máximo {item.qty})
              </option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`post-qty-${order.id}`} className="store-label">Cantidad</label>
            <input id={`post-qty-${order.id}`} type="number" className="store-input" min="1"
              max={(order.items || []).find(x=>x.id===Number(itemId))?.qty || 1}
              value={qty} required onChange={e=>setQty(e.target.value)}/>
          </div>
        </div>
      )}
      <div>
        <label htmlFor={`post-reason-${order.id}`} className="store-label">Motivo</label>
        <input id={`post-reason-${order.id}`} className="store-input" minLength={3} maxLength={80}
          value={reason} required onChange={e=>setReason(e.target.value)}/>
      </div>
      <div>
        <label htmlFor={`post-description-${order.id}`} className="store-label">Cuéntanos qué ocurrió</label>
        <textarea id={`post-description-${order.id}`} rows={3} minLength={10} maxLength={2000}
          className="store-input" value={description} required onChange={e=>setDescription(e.target.value)}
          placeholder="Describe qué sucedió con tu compra y qué solución esperas."/>
      </div>
      <button type="submit" className="store-button store-button-dark" disabled={mutation.isPending}>
        {mutation.isPending ? 'ENVIANDO…' : 'ENVIAR SOLICITUD'}
      </button>
    </form>
  )
}

export default function PostSaleCustomer({ order }) {
  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const queryClient = useQueryClient()
  const { data: cases = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['post-sale-mine'],
    queryFn: () => apiClient.get('/post-sale/mine').then(r=>r.data),
    enabled: open,
  })
  if (!['paid', 'preparing', 'shipped', 'delivered'].includes(order.status)) return null
  const related = cases.filter(item=>item.order_id===order.id)
  const success = () => {
    setShowForm(false)
    queryClient.invalidateQueries({ queryKey: ['post-sale-mine'] })
  }
  return (
    <section className="border-t border-neutral-200 mt-5 pt-4" aria-label="Solicitudes posventa">
      <button type="button" aria-expanded={open} className="flex items-center justify-between gap-3 w-full min-h-11 text-sm font-bold"
        onClick={()=>setOpen(value=>!value)}>
        <span className="inline-flex items-center gap-2"><ArrowLeftRight size={17}/> DEVOLUCIONES Y ATENCIÓN POSVENTA</span>
        {open ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
      </button>
      {open && <div className="space-y-4 pt-4">
        {isLoading && <p role="status" className="text-sm text-neutral-500">Cargando solicitudes…</p>}
        {isError && <div role="alert" className="text-sm text-red-800 p-4 bg-red-50">
          No pudimos consultar tus solicitudes.
          <button type="button" onClick={()=>refetch()} className="underline ml-2">Reintentar</button>
        </div>}
        {related.map(item=>(
          <article key={item.id} className="border border-neutral-200 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-bold text-sm">Caso #{item.id} · {item.kind==='return'?'Devolución':'Incidencia'}</p>
              <span className="text-xs font-semibold bg-neutral-100 px-3 py-1">{STATES[item.status] || item.status}</span>
            </div>
            <p className="text-sm text-neutral-700 mt-2">{item.reason}</p>
            {item.product_name && <p className="text-xs text-neutral-500 mt-1">{item.product_name} · {item.qty} unidad(es)</p>}
            <p className="text-xs text-neutral-500 mt-2">{REFUNDS[item.refund_status] || item.refund_status}
              {item.refund_amount!=null && ` · Importe de artículos: ${COP(item.refund_amount)}`}
            </p>
            <ol className="border-l-2 border-neutral-200 pl-4 mt-4 space-y-2">
              {item.events.map(event=>(
                <li key={event.id} className="text-xs">
                  <strong>{event.action.replaceAll('_',' ')}</strong>
                  <span className="text-neutral-500 ml-2">{new Date(event.created_at).toLocaleDateString('es-CO')}</span>
                  {event.note && <p className="text-neutral-600 mt-1 whitespace-pre-wrap">{event.note}</p>}
                </li>
              ))}
            </ol>
          </article>
        ))}
        {!isLoading && !isError && related.length===0 &&
          <p className="text-sm text-neutral-500">Todavía no hay solicitudes relacionadas con este pedido.</p>}
        {!showForm ? <button type="button" className="store-button store-button-outline"
          onClick={()=>setShowForm(true)}><MessageSquareWarning size={16}/> NUEVA SOLICITUD</button> :
          <div>
            <button type="button" className="text-sm underline mb-3" onClick={()=>setShowForm(false)}>Cancelar formulario</button>
            <SubmitCase order={order} onSuccess={success}/>
          </div>}
      </div>}
    </section>
  )
}
