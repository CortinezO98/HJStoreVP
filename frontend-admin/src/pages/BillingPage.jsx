import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Download, Plus, RotateCcw, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { billingApi } from '../services/api'

const COP = amount => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(amount) || 0)
const date = value => new Date(value).toLocaleDateString('es-CO', {
  year: 'numeric', month: 'short', day: 'numeric',
})

async function downloadInternal(doc) {
  const { data } = await billingApi.print(doc.id)
  const url = URL.createObjectURL(new Blob([data], { type: 'text/html;charset=utf-8' }))
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.internal_reference}.html`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 15_000)
  }
}

export default function BillingPage() {
  const queryClient = useQueryClient()
  const [orderId, setOrderId] = useState('')
  const [caseId, setCaseId] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const { data: documents = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-commercial-documents'],
    queryFn: () => billingApi.list().then(r => r.data),
  })
  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['admin-commercial-document', selectedId],
    queryFn: () => billingApi.detail(selectedId).then(r => r.data),
    enabled: Boolean(selectedId),
  })
  const createReceipt = useMutation({
    mutationFn: id => billingApi.receipt(id),
    onSuccess: ({data}) => {
      toast.success('Comprobante interno registrado')
      setOrderId('')
      setSelectedId(data.id)
      queryClient.invalidateQueries({ queryKey: ['admin-commercial-documents'] })
    },
    onError: err => toast.error(err?.response?.data?.detail || 'No se pudo generar el comprobante'),
  })
  const createDraft = useMutation({
    mutationFn: id => billingApi.creditDraft(id),
    onSuccess: ({data}) => {
      toast.success('Borrador de ajuste registrado')
      setCaseId('')
      setSelectedId(data.id)
      queryClient.invalidateQueries({ queryKey: ['admin-commercial-documents'] })
    },
    onError: err => toast.error(err?.response?.data?.detail || 'No se pudo generar el borrador'),
  })
  const save = async doc => {
    try { await downloadInternal(doc) }
    catch { toast.error('No se pudo descargar el documento') }
  }
  return <div className="space-y-6">
    <header>
      <p className="admin-dashboard-overline">GESTIÓN DOCUMENTAL · HJSTOREVP</p>
      <h1 className="text-3xl font-black tracking-tight">Comprobantes y facturación</h1>
      <p className="text-sm text-slate-500 mt-2">
        Documentación comercial interna vinculada a ventas y devoluciones.
      </p>
    </header>
    <div role="status" className="p-4 border border-amber-200 bg-amber-50 text-amber-900 text-sm flex gap-3">
      <ShieldAlert size={20} className="shrink-0"/>
      <p><strong>Emisión DIAN no disponible.</strong> Los archivos de este módulo
        no son facturas electrónicas, notas crédito DIAN ni comprobantes fiscales
        validados. No incluyen CUFE, CUDE, firmas ni numeración oficial.</p>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <form className="card space-y-3" onSubmit={e => {e.preventDefault();createReceipt.mutate(Number(orderId))}}>
        <h2 className="font-bold flex gap-2 items-center"><FileText size={19}/> Comprobante de compra</h2>
        <p className="text-sm text-slate-500">
          Registra un comprobante interno para una venta cuyo pago está confirmado.
          No modifica el pedido ni crea una factura tributaria.
        </p>
        <label htmlFor="billing-order-id" className="text-xs font-semibold block">ID interno del pedido</label>
        <input id="billing-order-id" className="input" type="number" min="1" step="1" required
          value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="Ej. 120"/>
        <button type="submit" className="btn-primary inline-flex items-center gap-2"
          disabled={createReceipt.isPending || !orderId}><Plus size={16}/>
          {createReceipt.isPending ? 'Registrando…' : 'Generar comprobante interno'}
        </button>
      </form>
      <form className="card space-y-3" onSubmit={e => {e.preventDefault();createDraft.mutate(Number(caseId))}}>
        <h2 className="font-bold flex gap-2 items-center"><RotateCcw size={19}/> Borrador de ajuste posventa</h2>
        <p className="text-sm text-slate-500">
          Requiere devolución recibida, reembolso externo documentado y comprobante
          interno original. No emite una nota crédito oficial.
        </p>
        <label htmlFor="billing-case-id" className="text-xs font-semibold block">ID del caso posventa</label>
        <input id="billing-case-id" className="input" type="number" min="1" step="1" required
          value={caseId} onChange={e=>setCaseId(e.target.value)} placeholder="Ej. 35"/>
        <button type="submit" className="btn-primary inline-flex items-center gap-2"
          disabled={createDraft.isPending || !caseId}><Plus size={16}/>
          {createDraft.isPending ? 'Registrando…' : 'Generar borrador de ajuste'}
        </button>
      </form>
    </div>
    <div className="card space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="font-bold text-lg">Documentos registrados</h2>
        <button type="button" className="btn-secondary" onClick={()=>refetch()}>Actualizar</button>
      </div>
      {isLoading ? <p role="status" className="py-10 text-center text-slate-500">Cargando documentos…</p> :
        isError ? <p role="alert" className="py-10 text-center text-red-700">
          No se pudo consultar el historial.</p> :
        documents.length === 0 ? <p className="py-10 text-center text-slate-500">
          No hay documentos internos registrados todavía.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm">
          <thead><tr className="border-b text-left">
            {['Referencia interna','Tipo','Pedido','Importe','Fecha','Acciones'].map(label=>
              <th className="p-3" key={label}>{label}</th>)}
          </tr></thead><tbody>{documents.map(doc=><tr key={doc.id} className="border-b border-slate-100">
            <td className="p-3 font-mono text-xs">{doc.internal_reference}</td>
            <td className="p-3">{doc.document_type === 'purchase_receipt' ? 'Comprobante interno' : 'Borrador de ajuste'}</td>
            <td className="p-3">#{doc.order_id}</td>
            <td className="p-3 font-semibold">{COP(doc.amount)}</td>
            <td className="p-3">{date(doc.created_at)}</td>
            <td className="p-3">
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={()=>setSelectedId(doc.id)} className="underline text-indigo-700">Detalle</button>
                <button type="button" onClick={()=>save(doc)} className="underline text-indigo-700 inline-flex items-center gap-1">
                  <Download size={14}/> Archivo HTML
                </button>
              </div>
            </td>
          </tr>)}</tbody>
        </table></div>}
      {selectedId && <section className="border-t border-slate-200 pt-5">
        <div className="flex justify-between gap-3 mb-3">
          <h3 className="font-bold">Documento #{selectedId}</h3>
          <button type="button" className="btn-secondary" onClick={()=>setSelectedId(null)}>Cerrar</button>
        </div>
        {loadingDetail ? <p role="status">Consultando…</p> : detail && <div className="text-sm space-y-3">
          <p><strong>Referencia:</strong> {detail.internal_reference}</p>
          <p><strong>Estado interno:</strong> {detail.status}</p>
          <pre className="overflow-x-auto bg-slate-50 p-3 rounded-lg text-xs whitespace-pre-wrap break-words">
            {JSON.stringify(detail.snapshot, null, 2)}
          </pre>
          <h4 className="font-bold">Historial</h4>
          {detail.events?.map((event,index)=><p key={index} className="text-slate-600">
            {event.action} · {date(event.created_at)} {event.note || ''}
          </p>)}
        </div>}
      </section>}
    </div>
  </div>
}
