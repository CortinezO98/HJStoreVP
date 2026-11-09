import { useSearchParams, Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Clock3, LoaderCircle, AlertTriangle, RefreshCw, ArrowRight } from 'lucide-react'
import { apiClient } from '../../services/api'

const formatCOP = (amount) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(amount) || 0)

const STATES = {
  paid: {
    icon: CheckCircle2, title: 'PAGO CONFIRMADO', subtitle: 'Hemos recibido la confirmación de tu pago.',
    detail: 'Tu pedido continuará con la preparación y el despacho.',
    className: 'text-green-700',
  },
  pending: {
    icon: Clock3, title: 'PAGO EN VALIDACIÓN', subtitle: 'Tu transacción aún no está confirmada.',
    detail: 'El proveedor puede tardar unos minutos. Puedes volver a comprobar el estado sin crear otro pedido.',
    className: 'text-amber-700',
  },
  cancelled: {
    icon: XCircle, title: 'PAGO CANCELADO', subtitle: 'La transacción no se completó.',
    detail: 'Consulta el estado de tu pedido antes de intentar realizar una nueva compra.',
    className: 'text-red-700',
  },
  error: {
    icon: AlertTriangle, title: 'NO PUDIMOS VERIFICAR EL PAGO', subtitle: 'No fue posible consultar la información.',
    detail: 'No asumas que el pago falló. Vuelve a consultar el estado de tu pedido antes de intentar pagar de nuevo.',
    className: 'text-neutral-700',
  },
}

export default function PaymentConfirmationPage() {
  const [params] = useSearchParams()
  const orderNumber = params.get('order')
  const provider = params.get('provider')
  const transactionId = params.get('id')
  const reconciledRef = useRef(null)
  const [isReconciling, setIsReconciling] = useState(false)
  const [reconcileError, setReconcileError] = useState(false)
  const { data: payment, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['payment-status', orderNumber],
    queryFn: () => apiClient.get(`/payments/status/${encodeURIComponent(orderNumber)}`).then(({ data }) => data),
    enabled: Boolean(orderNumber),
    retry: 1,
    refetchInterval: ({ state }) => state.data?.status === 'pending' ? 20000 : false,
  })

  useEffect(() => {
    if (provider !== 'wompi' || !transactionId || !orderNumber) return
    const marker = `${orderNumber}:${transactionId}`
    if (reconciledRef.current === marker) return
    reconciledRef.current = marker
    let cancelled = false
    setIsReconciling(true)
    setReconcileError(false)
    apiClient.post('/payments/wompi/reconcile', {
      order_number: orderNumber,
      transaction_id: transactionId,
    }).then(() => {
      if (!cancelled) refetch()
    }).catch(() => {
      if (!cancelled) setReconcileError(true)
    }).finally(() => {
      if (!cancelled) setIsReconciling(false)
    })
    return () => { cancelled = true }
  }, [provider, transactionId, orderNumber, refetch])

  const status = !orderNumber || isError ? 'error' : payment?.status === 'paid'
    ? 'paid' : payment?.status === 'cancelled' ? 'cancelled' : 'pending'
  const config = STATES[status]
  const Icon = config.icon

  return (
    <div className="store-container store-section">
      <div className="max-w-2xl mx-auto py-8 sm:py-14 text-center">
        <p className="store-eyebrow">HJSTOREVP / ESTADO DEL PEDIDO</p>
        {isLoading && orderNumber ? (
          <div role="status" aria-live="polite" className="py-20">
            <LoaderCircle size={48} className="animate-spin mx-auto mb-6" strokeWidth={1.4}/>
            <h1 className="text-3xl font-black uppercase">CONSULTANDO TU PAGO</h1>
            <p className="store-muted mt-3">Estamos verificando el estado reportado por la pasarela.</p>
          </div>
        ) : (
          <div className="store-card py-10 sm:py-14">
            <div className={`store-success-icon ${config.className}`}><Icon size={42} strokeWidth={1.5}/></div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase">{config.title}</h1>
            <p className="text-neutral-600 mt-4">{config.subtitle}</p>
            {orderNumber && <p className="font-mono text-xs sm:text-sm text-neutral-500 break-all mt-3">{orderNumber}</p>}
            {payment?.total_amount != null &&
              <p className="text-3xl font-black mt-6">{formatCOP(payment.total_amount)}</p>}
            <p className="store-muted mt-7 mx-auto max-w-md">{config.detail}</p>
            {isReconciling && <p role="status" className="text-xs text-neutral-500 mt-4">Consultando la transacción directamente con Wompi…</p>}
            {reconcileError && <p role="status" className="text-xs text-amber-800 mt-4">La verificación directa no fue posible. El estado se actualizará cuando llegue la notificación del proveedor.</p>}
            {orderNumber && (status === 'pending' || status === 'error') &&
              <button type="button" disabled={isFetching} className="store-button store-button-outline w-full sm:w-auto mt-7"
                onClick={() => refetch()} aria-busy={isFetching}>
                <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''}/>
                {isFetching ? 'COMPROBANDO…' : 'VOLVER A COMPROBAR'}
              </button>}
            <div className="border-t border-neutral-200 mt-9 pt-7 flex flex-col sm:flex-row justify-center gap-3">
              <Link to="/mi-cuenta" className="store-button store-button-dark">MIS PEDIDOS <ArrowRight size={16}/></Link>
              <Link to="/catalogo" className="store-button store-button-outline">VER CATÁLOGO</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
