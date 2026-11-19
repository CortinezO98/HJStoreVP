import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, RotateCcw, ShieldCheck } from 'lucide-react'
import { commerceOperationsApi } from '../services/api'

const priorities = {
  critical: { text: 'Crítica', className: 'text-red-700' },
  high: { text: 'Alta', className: 'text-amber-700' },
  medium: { text: 'Seguimiento', className: 'text-slate-600' },
}
const currency = (value) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(value || 0))
const time = (value) => value
  ? new Date(value.endsWith('Z') ? value : value + 'Z').toLocaleString('es-CO', {
      timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short',
    }) : '—'

export default function PaymentRecoveryQueue() {
  const [provider, setProvider] = useState('')
  const [pendingMinutes, setPendingMinutes] = useState(30)
  const [page, setPage] = useState(1)
  const perPage = 15
  const query = useQuery({
    queryKey: ['payment-recovery-queue', provider, pendingMinutes, page],
    queryFn: () => commerceOperationsApi.paymentRecoveryQueue({
      provider: provider || undefined, pending_minutes: pendingMinutes,
      page, per_page: perPage,
    }).then((response) => response.data),
    staleTime: 30000,
  })
  const total = query.data?.total || 0
  const maxPage = Math.max(1, Math.ceil(total / perPage))
  const pageNumber = Math.min(page, maxPage)

  return (
    <section className="card" aria-label="Recuperación controlada de pagos">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck size={19}/> Cola de conciliación de pagos
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Solicitudes incompletas o inciertas. Consulta y diagnóstico sin repetir cobros.
          </p>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm inline-flex items-center gap-2"
          onClick={() => query.refetch()} disabled={query.isFetching}>
          <RotateCcw size={14}/> Actualizar
        </button>
      </div>
      <div className="flex flex-wrap gap-4 mb-5">
        <label className="text-sm flex flex-col gap-1">
          Proveedor
          <select className="form-select form-select-sm" value={provider}
            onChange={(event) => { setProvider(event.target.value); setPage(1) }}>
            <option value="">Todos</option>
            <option value="wompi">Wompi</option>
            <option value="addi">Addi</option>
            <option value="sistecreditos">Sistecréditos</option>
          </select>
        </label>
        <label className="text-sm flex flex-col gap-1">
          Antigüedad mínima de un pendiente
          <select className="form-select form-select-sm" value={pendingMinutes}
            onChange={(event) => { setPendingMinutes(Number(event.target.value)); setPage(1) }}>
            <option value={30}>30 minutos</option>
            <option value={120}>2 horas</option>
            <option value={1440}>24 horas</option>
            <option value={10080}>7 días</option>
          </select>
        </label>
      </div>
      {query.isLoading ? (
        <p role="status" className="text-sm text-gray-500">Consultando casos pendientes…</p>
      ) : query.isError ? (
        <div className="admin-payment-audit-notice" role="alert">
          No fue posible cargar la cola de conciliación.
          <button type="button" className="btn btn-sm btn-outline-secondary ms-2"
            onClick={() => query.refetch()}>Reintentar</button>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-3">
            {total} casos por revisar · Página {pageNumber} de {maxPage}
          </p>
          {query.data?.items?.length ? (
            <div className="table-responsive">
              <table className="table align-middle table-hover admin-payment-audit-table">
                <thead>
                  <tr>
                    <th>Pedido</th><th>Proveedor</th><th>Prioridad</th>
                    <th>Estado / referencia</th><th className="text-end">Total</th><th>Siguiente revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((item) => (
                    <tr key={item.order_id}>
                      <td>
                        <strong>{item.order_number}</strong>
                        <small className="d-block text-secondary">{time(item.created_at_utc)}</small>
                      </td>
                      <td>{item.provider || '—'}</td>
                      <td className={priorities[item.priority]?.className}>
                        <strong>{priorities[item.priority]?.text || item.priority}</strong>
                      </td>
                      <td>{item.order_status}
                        <small className="d-block text-secondary">
                          {item.external_reference_available
                            ? 'Referencia externa registrada'
                            : 'Sin identificador externo verificable'}
                        </small>
                      </td>
                      <td className="text-end">{currency(item.amount)}</td>
                      <td className="text-sm">{item.next_action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-3" role="status">
              No hay casos que cumplan estos criterios. No significa que todos los pagos estén conciliados.
            </p>
          )}
          <nav aria-label="Páginas de conciliación" className="admin-report-pager">
            <button type="button" className="btn btn-sm btn-outline-secondary"
              disabled={pageNumber <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              Anterior
            </button>
            <span>{pageNumber} de {maxPage}</span>
            <button type="button" className="btn btn-sm btn-outline-secondary"
              disabled={pageNumber >= maxPage}
              onClick={() => setPage((value) => Math.min(maxPage, value + 1))}>
              Siguiente
            </button>
          </nav>
          <p className="text-xs text-amber-900 mt-4 flex gap-2 items-start">
            <AlertTriangle size={17} className="shrink-0" aria-hidden="true"/>
            {query.data?.note}
          </p>
        </>
      )}
    </section>
  )
}
