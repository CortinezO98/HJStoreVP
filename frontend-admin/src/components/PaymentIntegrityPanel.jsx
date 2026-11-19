import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react'
import { commerceOperationsApi } from '../services/api'

const integer = (value) => new Intl.NumberFormat('es-CO').format(Number(value || 0))
const money = (value) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(value || 0))
const when = (value) => value
  ? new Date(value.endsWith('Z') ? value : value + 'Z').toLocaleString('es-CO', {
      timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short',
    }) : '—'

export default function PaymentIntegrityPanel() {
  const [page, setPage] = useState(1)
  const [verifyingId, setVerifyingId] = useState(null)
  const [verification, setVerification] = useState(null)
  const [verificationError, setVerificationError] = useState('')
  const perPage = 15
  const query = useQuery({
    queryKey: ['payment-integrity', page, perPage],
    queryFn: () => commerceOperationsApi.paymentIntegrity({ page, per_page: perPage })
      .then((response) => response.data),
    staleTime: 30000,
  })
  const verifyWompi = async (item) => {
    if (verifyingId !== null) return
    setVerifyingId(item.order_id)
    setVerification(null)
    setVerificationError('')
    try {
      const { data } = await commerceOperationsApi.verifyWompi(item.order_id)
      setVerification(data)
    } catch (error) {
      setVerificationError(
        typeof error?.response?.data?.detail === 'string'
          ? error.response.data.detail
          : 'No se pudo consultar la transacción con Wompi',
      )
    } finally {
      setVerifyingId(null)
    }
  }
  const total = query.data?.total || 0
  const pages = Math.max(1, Math.ceil(total / perPage))
  const currentPage = Math.min(page, pages)
  return (
    <section className="card admin-reports-section" aria-label="Conciliación interna de pagos">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck size={19}/> Integridad de pagos web
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Detecta estados y referencias inconsistentes, sin confirmar cobros ni cambiar inventario.
          </p>
        </div>
        <button type="button" className="btn btn-outline-secondary inline-flex items-center gap-2"
          disabled={query.isFetching} onClick={() => query.refetch()}>
          <RefreshCw size={15}/> Actualizar
        </button>
      </div>
      {query.isLoading ? (
        <p className="text-sm text-gray-500" role="status">Comprobando integridad interna de pagos…</p>
      ) : query.isError ? (
        <div role="alert" className="admin-payment-audit-notice">
          No fue posible consultar la conciliación de pagos.
          <button type="button" className="btn btn-outline-secondary btn-sm ms-2"
            onClick={() => query.refetch()}>Reintentar</button>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-3">
            <strong>{integer(total)}</strong> posibles inconsistencias · Página {currentPage} de {pages}
          </p>
          {query.data?.items?.length ? (
            <div className="table-responsive">
              <table className="table table-hover align-middle admin-payment-audit-table">
                <thead>
                  <tr>
                    <th>Pedido</th><th>Estado y proveedor</th><th>Referencia</th>
                    <th className="text-end">Total</th><th>Observaciones</th><th>Verificación</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((item) => (
                    <tr key={item.order_id}>
                      <td><strong>{item.order_number}</strong>
                        <small className="d-block text-secondary">{when(item.created_at)}</small></td>
                      <td>{item.status}<small className="d-block text-secondary">{item.payment_method || 'Sin proveedor'}</small></td>
                      <td className="text-break">{item.payment_ref || '—'}</td>
                      <td className="text-end">{money(item.amount)}</td>
                      <td className="text-amber-800">
                        {(item.issues || []).map((reason) => (
                          <span key={reason} className="d-block">{reason}</span>
                        ))}
                      </td>
                      <td>
                        {item.payment_method === 'wompi' && item.payment_ref ? (
                          <button type="button" className="btn btn-outline-secondary btn-sm"
                            disabled={verifyingId !== null}
                            onClick={() => verifyWompi(item)}>
                            {verifyingId === item.order_id ? 'Consultando…' : 'Consultar Wompi'}
                          </button>
                        ) : <span className="text-secondary text-xs">Revisión manual</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-gray-500" role="status">
            No se detectaron inconsistencias entre los datos de pago registrados en esta revisión.
          </p>}
          {verification && (
            <div className="admin-payment-audit-notice mt-4" role="status" aria-live="polite">
              <strong>Resultado de Wompi · {verification.order_number}</strong>
              <p className="mb-1">Estado local: {verification.local_status} · Estado proveedor: {verification.provider_status}</p>
              <p className="mb-1">Diagnóstico: {verification.finding}</p>
              <p className="mb-1">Referencia: {verification.identity_checks?.reference_matches ? 'Coincide' : 'No coincide'} · Importe: {verification.identity_checks?.amount_matches ? 'Coincide' : 'No coincide'} · Moneda: {verification.identity_checks?.currency_matches ? 'Coincide' : 'No coincide'} · Transacción: {verification.identity_checks?.transaction_matches ? 'Coincide' : 'No coincide'}</p>
              <p>{verification.note}</p>
            </div>
          )}
          {verificationError && <div className="admin-payment-audit-notice mt-4" role="alert">{verificationError}</div>}
          <nav className="admin-report-pager" aria-label="Paginación de conciliación de pagos">
            <button type="button" className="btn btn-sm btn-outline-secondary"
              disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
            <span>{currentPage} / {pages}</span>
            <button type="button" className="btn btn-sm btn-outline-secondary"
              disabled={currentPage >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Siguiente</button>
          </nav>
          <p className="text-xs text-amber-900 mt-4 flex items-start gap-2">
            <AlertTriangle size={17} className="shrink-0"/>
            {query.data?.note}
          </p>
        </>
      )}
    </section>
  )
}
