import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ClipboardList, ShieldAlert, RefreshCw } from 'lucide-react'
import { inventoryApi } from '../services/api'

const number = (value) => new Intl.NumberFormat('es-CO').format(Number(value || 0))
const typeLabels = {
  in: 'Ingreso',
  out_sale: 'Venta',
  transfer: 'Transferencia',
  adjustment: 'Ajuste / liberación',
}

const kinds = [
  { id: 'alerts', label: 'Alertas por sede', icon: AlertTriangle },
  { id: 'movements', label: 'Movimientos', icon: ClipboardList },
  { id: 'anomalies', label: 'Inconsistencias', icon: ShieldAlert },
  { id: 'reservations', label: 'Reservas web', icon: ClipboardList },
  { id: 'physical', label: 'Ventas físicas', icon: ShieldAlert },
]

export default function InventoryAuditPanel({ locations }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('alerts')
  const [locationId, setLocationId] = useState('')
  const [search, setSearch] = useState('')
  const [movementType, setMovementType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const common = { location_id: locationId || undefined, page, per_page: 15 }
  const query = useQuery({
    queryKey: ['inventory-audit-panel', tab, locationId, search, movementType, dateFrom, dateTo, page],
    queryFn: async () => {
      if (tab === 'alerts') return (await inventoryApi.lowStockByLocation({
        ...common, search: search || undefined,
      })).data
      if (tab === 'movements') return (await inventoryApi.movementHistory({
        ...common, movement_type: movementType || undefined,
        date_from: dateFrom || undefined, date_to: dateTo || undefined,
      })).data
      if (tab === 'reservations') return (await inventoryApi.reservationIntegrity(common)).data
      if (tab === 'physical') return (await inventoryApi.physicalSaleIntegrity(common)).data
      return (await inventoryApi.anomalies(common)).data
    },
    staleTime: 15000,
  })

  const changeTab = (value) => {
    setTab(value)
    setPage(1)
  }
  const total = query.data?.total || 0
  const items = query.data?.items || []
  const lastPage = Math.max(1, Math.ceil(total / 15))

  return (
    <section className="card" aria-label="Control y auditoría de inventario">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-gray-900">Control y auditoría de inventario</h2>
          <p className="text-sm text-gray-500 mt-1">
            Consultas históricas y alertas por sede; ninguna acción modifica existencias.
          </p>
        </div>
        <button type="button" className="btn btn-outline-secondary inline-flex items-center gap-2"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['inventory-audit-panel'] })}>
          <RefreshCw size={15} /> Actualizar auditoría
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Consultas de inventario">
        {kinds.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            onClick={() => changeTab(id)}
            className={tab === id
              ? 'btn btn-primary inline-flex items-center gap-2'
              : 'btn btn-outline-secondary inline-flex items-center gap-2'}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div>
          <label htmlFor="audit-location" className="form-label">Sede</label>
          <select id="audit-location" className="form-select" value={locationId}
            onChange={(event) => { setLocationId(event.target.value); setPage(1) }}>
            <option value="">Todas las sedes</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}{!loc.active ? ' (inactiva)' : ''}
              </option>
            ))}
          </select>
        </div>
        {tab === 'alerts' && (
          <div className="sm:col-span-2">
            <label htmlFor="audit-search" className="form-label">Producto o SKU</label>
            <input id="audit-search" className="form-control" type="search"
              value={search} placeholder="Filtrar alertas..."
              onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
          </div>
        )}
        {tab === 'movements' && (
          <>
            <div>
              <label htmlFor="audit-type" className="form-label">Tipo de movimiento</label>
              <select id="audit-type" className="form-select" value={movementType}
                onChange={(event) => { setMovementType(event.target.value); setPage(1) }}>
                <option value="">Todos</option>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="audit-start" className="form-label">Desde</label>
              <input id="audit-start" type="date" className="form-control" value={dateFrom}
                onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} />
            </div>
            <div>
              <label htmlFor="audit-end" className="form-label">Hasta</label>
              <input id="audit-end" type="date" className="form-control" value={dateTo}
                onChange={(event) => { setDateTo(event.target.value); setPage(1) }} />
            </div>
          </>
        )}
      </div>

      {query.isLoading ? (
        <p className="text-sm text-gray-500">Cargando registros...</p>
      ) : query.isError ? (
        <div role="alert" className="text-sm text-red-700">
          No fue posible consultar la auditoría. Revisa los filtros o los registros del backend.
          <button type="button" className="btn btn-outline-secondary btn-sm ms-2"
            onClick={() => query.refetch()}>Reintentar</button>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-3">
            {number(total)} {tab === 'reservations' || tab === 'physical' ? 'posibles diferencias detectadas' : 'registros'} · Página {page} de {lastPage}
          </p>
          {(tab === 'reservations' || tab === 'physical') && (
            <p className="text-xs text-amber-800 mb-3">
              {tab === 'reservations'
                ? 'Diagnóstico de reservas trazables: los pedidos históricos sin reservas no se incluyen.'
                : 'Comparación histórica de unidades vendidas y movimientos de salida por pedido y sede.'}
              {' '}No modificar stock ni cancelar pagos por un hallazgo aislado.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {tab === 'alerts' ? (
                  <tr className="border-b text-left text-gray-600">
                    <th className="p-2">Producto / SKU</th><th className="p-2">Sede</th>
                    <th className="p-2 text-right">Disponible</th><th className="p-2 text-right">Mínimo</th>
                  </tr>
                ) : tab === 'movements' ? (
                  <tr className="border-b text-left text-gray-600">
                    <th className="p-2">Fecha UTC</th><th className="p-2">Producto / SKU</th>
                    <th className="p-2">Sede</th><th className="p-2">Tipo</th>
                    <th className="p-2 text-right">Cambio</th><th className="p-2 text-right">Antes → Después</th>
                    <th className="p-2">Responsable / referencia</th>
                  </tr>
                ) : tab === 'physical' ? (
                  <tr className="border-b text-left text-gray-600">
                    <th className="p-2">Venta / sede</th><th className="p-2">Referencia</th>
                    <th className="p-2 text-right">Vendido / descontado</th><th className="p-2">Hallazgo</th>
                  </tr>
                ) : tab === 'reservations' ? (
                  <tr className="border-b text-left text-gray-600">
                    <th className="p-2">Pedido / estado</th><th className="p-2">Producto / sede</th>
                    <th className="p-2 text-right">Reservado / pedido</th><th className="p-2">Diferencias</th>
                  </tr>
                ) : (
                  <tr className="border-b text-left text-gray-600">
                    <th className="p-2">Producto / SKU</th><th className="p-2">Sede</th>
                    <th className="p-2">Hallazgo</th><th className="p-2">Detalle</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={tab === 'movements' ? item.id
                    : tab === 'reservations' ? item.reservation_id
                      : tab === 'physical' ? item.order_item_id
                        : `${item.product_id}-${item.location_id}-${item.kind || 'alert'}`}
                    className="border-b border-gray-100 align-top">
                    {tab === 'alerts' ? (
                      <>
                        <td className="p-2"><strong>{item.product_name}</strong>
                          <span className="block text-gray-500 text-xs">{item.sku}</span></td>
                        <td className="p-2">{item.location_name}</td>
                        <td className="p-2 text-right font-semibold">{number(item.available)}
                          {item.missing_stock_row && <span className="block text-xs text-amber-700">Sin registro</span>}</td>
                        <td className="p-2 text-right">{number(item.minimum)}</td>
                      </>
                    ) : tab === 'movements' ? (
                      <>
                        <td className="p-2 whitespace-nowrap">{item.created_at
                          ? new Date(item.created_at.endsWith('Z') ? item.created_at : item.created_at + 'Z').toLocaleString('es-CO', { timeZone: 'America/Bogota' })
                          : '—'}</td>
                        <td className="p-2"><strong>{item.product_name}</strong>
                          <span className="block text-xs text-gray-500">{item.sku}</span></td>
                        <td className="p-2">{item.location_name}</td>
                        <td className="p-2">{typeLabels[item.movement_type] || item.movement_type}</td>
                        <td className="p-2 text-right">{item.qty > 0 ? '+' : ''}{number(item.qty)}</td>
                        <td className="p-2 text-right">{number(item.qty_before)} → {number(item.qty_after)}</td>
                        <td className="p-2">{item.actor_name}
                          <span className="block text-xs text-gray-500">
                            {item.reference_id ? `Ref. ${item.reference_id}` : 'Sin referencia'}
                            {item.notes ? ` · ${item.notes}` : ''}
                          </span></td>
                      </>
                    ) : tab === 'physical' ? (
                      <>
                        <td className="p-2">
                          <strong>{item.order_number}</strong>
                          <span className="block text-xs text-gray-500">{item.location_name}</span>
                        </td>
                        <td className="p-2">
                          <strong>{item.product_name}</strong>
                          <span className="block text-xs text-gray-500">{item.sku}</span>
                        </td>
                        <td className="p-2 text-right">
                          {number(item.sold_qty)} / {number(-item.movement_qty)}
                        </td>
                        <td className="p-2 text-amber-800">{item.detail}</td>
                      </>
                    ) : tab === 'reservations' ? (
                      <>
                        <td className="p-2">
                          <strong>{item.order_number}</strong>
                          <span className="block text-xs text-gray-500">
                            Pedido: {item.order_status} · Reserva: {item.reservation_status}
                          </span>
                        </td>
                        <td className="p-2">
                          <strong>{item.product_name}</strong>
                          <span className="block text-xs text-gray-500">
                            {item.sku} · {item.location_name}
                          </span>
                        </td>
                        <td className="p-2 text-right">
                          {number(item.reserved_qty)} / {item.order_item_qty == null ? '—' : number(item.order_item_qty)}
                        </td>
                        <td className="p-2 text-amber-800">
                          {(item.issues || []).join('; ')}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-2"><strong>{item.product_name}</strong>
                          <span className="block text-xs text-gray-500">{item.sku}</span></td>
                        <td className="p-2">{item.location_name}</td>
                        <td className="p-2 text-red-700 font-semibold">
                          {item.kind === 'negative_quantity' ? 'Cantidad negativa'
                            : item.kind === 'movement_arithmetic' ? 'Movimiento inconsistente'
                              : 'Reserva sin inventario'}</td>
                        <td className="p-2">{item.detail}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length === 0 && (
            <p className="text-sm text-gray-500 py-4" role="status">
              {tab === 'reservations'
                ? 'No se detectaron diferencias en las reservas trazables para esta selección.'
                : tab === 'physical'
                  ? 'No se detectaron diferencias entre ventas físicas y movimientos de salida trazables.'
                  : 'No se encontraron registros para este filtro.'}
            </p>
          )}
          <div className="flex items-center justify-between mt-4">
            <button type="button" className="btn btn-outline-secondary" disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
            <span className="text-xs text-gray-500">{page} / {lastPage}</span>
            <button type="button" className="btn btn-outline-secondary" disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}>Siguiente</button>
          </div>
          {query.data?.note && <p className="text-xs text-gray-500 mt-3">{query.data.note}</p>}
        </>
      )}
    </section>
  )
}
