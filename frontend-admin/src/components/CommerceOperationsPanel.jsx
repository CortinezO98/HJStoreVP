import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CreditCard, Truck, Mail, RefreshCw, Clock } from 'lucide-react'
import { commerceOperationsApi } from '../services/api'

const number = (value) => new Intl.NumberFormat('es-CO').format(Number(value || 0))
const currency = (value) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(value || 0))
const when = (value) => value
  ? new Date(value.endsWith('Z') ? value : value + 'Z').toLocaleString(
    'es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' },
  ) : '—'

export default function CommerceOperationsPanel() {
  const client = useQueryClient()
  const [pendingHours, setPendingHours] = useState(2)
  const [shipmentHours, setShipmentHours] = useState(24)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['commerce-operations', pendingHours, shipmentHours],
    queryFn: () => commerceOperationsApi.overview({
      pending_hours: pendingHours, shipment_hours: shipmentHours, limit: 15,
    }).then((response) => response.data),
    staleTime: 30000,
  })
  const cards = data ? [
    { title: 'Pagos sin confirmar', value: data.alerts.pending_payment.total, icon: CreditCard },
    { title: 'Despachos por revisar', value: data.alerts.without_shipment.total, icon: Truck },
    { title: 'Reservas vencidas (HELD)', value: data.alerts.expired_held_reservations.total, icon: Clock },
    { title: 'Notificaciones fallidas', value: data.notifications.failed, icon: Mail },
  ] : []
  return (
    <section className="card admin-reports-section" aria-label="Seguimiento de pagos y pedidos">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div>
          <h2 className="font-bold text-gray-900">Seguimiento de pagos, pedidos y comunicaciones</h2>
          <p className="text-sm text-gray-500 mt-1">
            Estado operativo de ventas web y notificaciones, sin realizar cobros ni cambios en pedidos.
          </p>
        </div>
        <button type="button" className="btn btn-outline-secondary inline-flex items-center gap-2"
          onClick={() => client.invalidateQueries({ queryKey: ['commerce-operations'] })}>
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label htmlFor="operation-pending-hours" className="form-label">Avisar sobre pagos pendientes después de</label>
          <select id="operation-pending-hours" className="form-select"
            value={pendingHours} onChange={(event) => setPendingHours(Number(event.target.value))}>
            <option value={1}>1 hora</option><option value={2}>2 horas</option>
            <option value={6}>6 horas</option><option value={24}>24 horas</option>
            <option value={48}>48 horas</option>
          </select>
        </div>
        <div>
          <label htmlFor="operation-shipment-hours" className="form-label">Avisar sobre despachos después de</label>
          <select id="operation-shipment-hours" className="form-select"
            value={shipmentHours} onChange={(event) => setShipmentHours(Number(event.target.value))}>
            <option value={12}>12 horas</option><option value={24}>24 horas</option>
            <option value={48}>48 horas</option><option value={72}>72 horas</option>
          </select>
        </div>
      </div>
      {isError ? <p role="alert" className="text-red-700">
        No se pudo consultar el seguimiento operativo. Revisa los registros del backend.
      </p> : isLoading ? <p className="text-gray-500">Consultando operaciones...</p> : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {cards.map(({ title, value, icon: Icon }) => (
              <div className="border border-gray-100 rounded-xl p-3" key={title}>
                <Icon size={18} className="text-amber-600 mb-2"/>
                <p className="text-sm text-gray-500">{title}</p>
                <strong className="text-2xl font-bold">{number(value)}</strong>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Correos: {number(data.notifications.pending)} pendientes ·
            {' '}{number(data.notifications.sending)} enviándose ·
            {' '}{number(data.notifications.sent)} enviados ·
            {' '}{number(data.notifications.failed)} fallidos.
          </p>
          {[
            ['Pagos pendientes', data.alerts.pending_payment.orders],
            ['Despachos pendientes de registro', data.alerts.without_shipment.orders],
          ].map(([title, orders]) => (
            <div key={title} className="mb-4">
              <h3 className="font-semibold mb-2">{title}</h3>
              {orders.length === 0 ? <p className="text-sm text-gray-500">Sin registros en este criterio.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left border-b">
                      <th className="p-2">Pedido</th><th className="p-2">Creado (Bogotá)</th>
                      <th className="p-2">Estado</th><th className="p-2">Medio</th>
                      <th className="p-2 text-right">Valor</th>
                    </tr></thead>
                    <tbody>{orders.map((order) => (
                      <tr key={order.id} className="border-b border-gray-100">
                        <td className="p-2">{order.order_number}</td>
                        <td className="p-2">{when(order.created_at)}</td>
                        <td className="p-2">{order.status}</td>
                        <td className="p-2">{order.payment_method || 'Sin iniciar'}</td>
                        <td className="p-2 text-right">{currency(order.total_amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          <h3 className="font-semibold mb-2">Reservas vencidas aún pendientes de pago</h3>
          {data.alerts.expired_held_reservations.reservations.length === 0 ? (
            <p className="text-sm text-gray-500">No hay reservas vencidas en este criterio.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b">
                  <th className="p-2">Pedido</th><th className="p-2">Producto / Sede</th>
                  <th className="p-2 text-right">Unidades</th><th className="p-2">Vencimiento (Bogotá)</th>
                </tr></thead>
                <tbody>{data.alerts.expired_held_reservations.reservations.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="p-2">{item.order_number || item.order_id}</td>
                    <td className="p-2">Producto {item.product_id} · Sede {item.location_id}</td>
                    <td className="p-2 text-right">{number(item.qty)}</td>
                    <td className="p-2">{when(item.expires_at)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="flex gap-2 items-start text-xs text-amber-800 mt-4">
            <AlertCircle size={16} className="shrink-0"/>
            Las alertas requieren verificación con el proveedor. No cancelar pedidos ni
            liberar reservas únicamente por antigüedad; un pago puede confirmarse tarde.
          </p>
        </>
      )}
    </section>
  )
}
