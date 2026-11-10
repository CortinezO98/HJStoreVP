import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, RefreshCw, PackageCheck, CircleAlert, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { postSaleApi } from '../services/api'

const STATUSES = {
  submitted: 'Recibida', under_review: 'En revisión', approved: 'Aprobada',
  rejected: 'Rechazada', received: 'Mercancía recibida', closed: 'Cerrada',
}
const REFUND = {
  not_requested: 'Sin solicitud de reembolso',
  pending_external: 'Pendiente de gestión externa',
  externally_recorded: 'Registrado externamente',
}
const COP = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
  .format(Number(value) || 0)
const dateText = date => date ? new Date(date).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

function CaseDetail({ item, onUpdated }) {
  const [target, setTarget] = useState('')
  const [note, setNote] = useState('')
  const [condition, setCondition] = useState('resellable')
  const [externalReference, setExternalReference] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const actions = useMutation({
    mutationFn: ({ action, payload }) => {
      if (action === 'review') return postSaleApi.review(item.id, payload)
      if (action === 'receive') return postSaleApi.receive(item.id, payload)
      if (action === 'requestRefund') return postSaleApi.requestRefund(item.id, payload)
      return postSaleApi.recordRefund(item.id, payload)
    },
    onSuccess: () => {
      toast.success('Gestión registrada en el historial')
      setTarget('')
      setNote('')
      setConfirmed(false)
      setExternalReference('')
      onUpdated()
    },
    onError: error => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo completar la gestión')
    },
  })
  const submit = event => {
    event.preventDefault()
    if (!target) return
    if (target === 'received') {
      actions.mutate({ action: 'receive', payload: { condition, note } })
    } else if (target === 'refund_pending') {
      actions.mutate({ action: 'requestRefund', payload: { note } })
    } else if (target === 'refund_record') {
      actions.mutate({ action: 'recordRefund', payload: {
        external_reference: externalReference,
        confirmation_note: note,
        explicitly_verified_externally: confirmed,
      } })
    } else {
      actions.mutate({ action: 'review', payload: { status: target, note } })
    }
  }
  const choices = []
  if (item.status === 'submitted') choices.push(
    ['under_review','Iniciar revisión'], ['approved','Aprobar solicitud'], ['rejected','Rechazar solicitud']
  )
  if (item.status === 'under_review') choices.push(
    ['approved','Aprobar solicitud'], ['rejected','Rechazar solicitud']
  )
  if (item.status === 'approved' && item.kind === 'return') choices.push(
    ['received','Registrar recepción física']
  )
  if (item.status === 'approved' && item.kind === 'incident') choices.push(['closed','Cerrar incidencia'])
  if (item.status === 'received') {
    if (item.refund_status === 'not_requested') choices.push(['refund_pending','Solicitar reembolso externo'])
    if (item.refund_status === 'pending_external') choices.push(['refund_record','Registrar comprobante externo'])
    if (item.refund_status !== 'pending_external') choices.push(['closed','Cerrar caso'])
  }
  return <div className="space-y-5">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-slate-50 p-4 border border-slate-200">
      <p><span className="block text-xs text-slate-500">Pedido</span><strong>{item.order_number}</strong></p>
      <p><span className="block text-xs text-slate-500">Artículo / cantidad</span><strong>{item.product_name || 'Incidencia general'} · {item.qty || '—'}</strong></p>
      <p><span className="block text-xs text-slate-500">Importe de artículos</span><strong>{item.refund_amount == null ? 'No aplica' : COP(item.refund_amount)}</strong></p>
      <p><span className="block text-xs text-slate-500">Reembolso</span><strong>{REFUND[item.refund_status] || item.refund_status}</strong></p>
    </div>
    <div className="text-sm">
      <p className="font-bold">{item.reason}</p>
      <p className="text-slate-600 whitespace-pre-wrap mt-2">{item.description}</p>
      {item.restocked_qty > 0 &&
        <p className="text-emerald-700 font-semibold mt-3">Reintegradas a inventario: {item.restocked_qty} unidad(es)</p>}
      {item.refund_reference &&
        <p className="text-slate-600 mt-2">Referencia de comprobante externo: <strong>{item.refund_reference}</strong></p>}
    </div>
    {!!choices.length &&
      <form className="border border-slate-200 p-4 space-y-3" onSubmit={submit}>
        <div>
          <label htmlFor={`post-action-${item.id}`} className="text-xs font-bold block mb-1">Acción administrativa</label>
          <select id={`post-action-${item.id}`} className="input" value={target} required
            onChange={e => { setTarget(e.target.value); setConfirmed(false) }}>
            <option value="">Selecciona una acción</option>
            {choices.map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        {target === 'received' && <div>
          <label htmlFor={`post-condition-${item.id}`} className="text-xs font-bold block mb-1">Condición de mercancía inspeccionada</label>
          <select id={`post-condition-${item.id}`} className="input" value={condition}
            onChange={e=>setCondition(e.target.value)}>
            <option value="resellable">Revende: reintegrar al inventario de origen</option>
            <option value="damaged">Dañada: NO reintegrar al stock</option>
          </select>
          <p className="text-xs text-amber-800 mt-2">Confirma que recibiste físicamente los productos antes de registrar esta operación.</p>
        </div>}
        {target === 'refund_pending' && <p className="bg-amber-50 text-amber-800 text-xs p-3">
          Esta acción solo registra una solicitud de reembolso. No envía dinero a ninguna cuenta.
        </p>}
        {target === 'refund_record' && <>
          <div><label htmlFor={`post-extref-${item.id}`} className="text-xs font-bold block mb-1">Referencia externa comprobada</label>
            <input id={`post-extref-${item.id}`} className="input" minLength={5} maxLength={180}
              required value={externalReference} onChange={e=>setExternalReference(e.target.value)} /></div>
          <label className="flex items-start gap-2 text-xs font-medium text-amber-900">
            <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required/>
            He verificado fuera de HJStoreVP que la operación económica existe y que esta referencia es auténtica.
          </label>
        </>}
        {target && <>
          <div><label htmlFor={`post-note-${item.id}`} className="text-xs font-bold block mb-1">Justificación / evidencia de gestión</label>
            <textarea id={`post-note-${item.id}`} rows={3} minLength={target === 'refund_record' ? 10 : 5}
              maxLength={500} value={note} required className="input"
              onChange={e=>setNote(e.target.value)} placeholder="Detalle de la decisión tomada"/></div>
          <button type="submit" disabled={actions.isPending || (target === 'refund_record' && !confirmed)}
            className="btn-primary">{actions.isPending ? 'Guardando…' : 'Registrar acción'}</button>
        </>}
      </form>}
    <div className="border-t border-slate-200 pt-5">
      <h3 className="text-sm font-bold mb-3">Trazabilidad del caso</h3>
      <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
        {item.events.map(event => <li key={event.id} className="text-sm">
          <strong className="capitalize">{event.action.replaceAll('_',' ')}</strong>
          <span className="text-xs text-slate-500 ml-2">{dateText(event.created_at)}</span>
          {event.note && <p className="text-slate-600 mt-1 whitespace-pre-wrap break-words">{event.note}</p>}
        </li>)}
      </ol>
    </div>
  </div>
}

export default function PostSalePage() {
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const queryClient = useQueryClient()
  const { data: cases = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-post-sale', filter],
    queryFn: () => postSaleApi.list(filter ? { status_filter: filter } : {}).then(r => r.data),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-post-sale'] })
  const current = cases.find(c => c.id === selected)
  return <main className="space-y-6">
    <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
      <div>
        <p className="admin-dashboard-overline">SERVICIO AL CLIENTE · TRAZABILIDAD</p>
        <h1 className="font-black tracking-tight text-3xl">Devoluciones y posventa</h1>
        <p className="text-sm text-slate-500 mt-2">Revisa solicitudes, recepciones de mercancía y reembolsos gestionados externamente.</p>
      </div>
      <button type="button" className="btn-secondary inline-flex items-center gap-2 self-start" onClick={() => refetch()}>
        <RefreshCw size={16}/> Actualizar
      </button>
    </header>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="card flex items-center gap-3"><ArrowLeftRight size={24} className="text-indigo-600"/>
        <div><p className="text-xs text-slate-500">Solicitudes visibles</p><p className="font-black text-2xl">{cases.length}</p></div>
      </div>
      <div className="card flex items-center gap-3"><PackageCheck size={24} className="text-emerald-600"/>
        <div><p className="text-xs text-slate-500">Recepciones</p><p className="font-black text-2xl">{cases.filter(c=>c.status==='received').length}</p></div>
      </div>
      <div className="card flex items-center gap-3"><CircleAlert size={24} className="text-amber-600"/>
        <div><p className="text-xs text-slate-500">Reembolsos por gestionar</p><p className="font-black text-2xl">{cases.filter(c=>c.refund_status==='pending_external').length}</p></div>
      </div>
    </div>
    <div className="card space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
        <h2 className="font-bold text-lg">Gestión de solicitudes</h2>
        <select className="input sm:max-w-56" aria-label="Filtrar casos" value={filter}
          onChange={e=>{setFilter(e.target.value);setSelected(null)}}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUSES).map(([key,val])=><option key={key} value={key}>{val}</option>)}
        </select>
      </div>
      {isLoading ? <p role="status" className="py-10 text-center text-slate-500">Cargando casos…</p>
      : isError ? <div className="py-10 text-center text-red-700" role="alert">
          No pudimos consultar los casos. <button type="button" className="underline" onClick={()=>refetch()}>Reintentar</button>
        </div>
      : cases.length === 0 ? <p className="py-10 text-center text-slate-500">No existen solicitudes para este filtro.</p>
      : <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] text-sm">
            <thead><tr className="text-left border-b">
              {['Caso','Pedido','Tipo','Estado','Reembolso','Acción'].map(h=><th className="p-3" key={h}>{h}</th>)}
            </tr></thead>
            <tbody>{cases.map(item=><tr key={item.id} className="border-b border-slate-100">
              <td className="p-3 font-bold">#{item.id}</td>
              <td className="p-3 font-mono text-xs">{item.order_number}</td>
              <td className="p-3">{item.kind==='return'?'Devolución':'Incidencia'}</td>
              <td className="p-3"><span className="badge-blue">{STATUSES[item.status] || item.status}</span></td>
              <td className="p-3">{REFUND[item.refund_status] || item.refund_status}</td>
              <td className="p-3"><button type="button" className="btn-secondary" onClick={()=>setSelected(item.id)}>
                <ShieldCheck size={15} className="inline mr-1"/> Gestionar</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
      {current && <section className="border-t border-slate-200 pt-5" aria-label="Gestionar solicitud seleccionada">
        <div className="flex justify-between items-center gap-3 mb-5">
          <h2 className="font-black text-lg">Caso #{current.id}</h2>
          <button type="button" className="btn-secondary" onClick={()=>setSelected(null)}>Cerrar detalle</button>
        </div>
        <CaseDetail key={current.id} item={current} onUpdated={refresh}/>
      </section>}
    </div>
    <p className="text-xs text-slate-500 leading-6">
      Ningún botón realiza reembolsos bancarios. Los registros externos requieren comprobación humana.
      El reintegro de stock solo ocurre después de registrar mercancía físicamente recibida y revendible.
      Los indicadores reflejan los casos de la consulta actual (máximo 100).
    </p>
  </main>
}
