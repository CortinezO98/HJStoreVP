import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authApi, cashApi, locationsApi } from '../services/api'
import { useAuthStore } from '../store'
import { Wallet, Landmark, ArrowLeftRight, CheckCircle2, MapPin, ReceiptText, AlertTriangle } from 'lucide-react'
import { confirmAction } from '../components/ui/ConfirmDialog'

const money = (value) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(value || 0))
const dateTime = (value) => value ? new Date(value).toLocaleString('es-CO') : '—'
const errorText = (error) => error?.response?.data?.detail || error.message || 'Operación no disponible'
const classes = 'form-control w-100'

export default function CashPage() {
  const { user } = useAuthStore()
  const admin = user?.role === 'admin' || user?.role === 'super_admin'
  const qc = useQueryClient()
  const [locationId, setLocationId] = useState('')
  const { data: me } = useQuery({
    queryKey: ['cash-me'],
    queryFn: () => authApi.me().then((r) => r.data),
    enabled: !admin,
  })
  const sellerLocationId = me?.location_id
  const [selectedId, setSelectedId] = useState(null)
  const [opening, setOpening] = useState('')
  const [openingNote, setOpeningNote] = useState('')
  const [moveType, setMoveType] = useState('income')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [counted, setCounted] = useState('')
  const [closingNote, setClosingNote] = useState('')

  const { data: locations = [] } = useQuery({
    queryKey: ['cash-locations'],
    queryFn: () => locationsApi.list().then((r) => r.data),
    enabled: admin,
  })
  const physical = useMemo(() => locations.filter((loc) => loc.type === 'physical'), [locations])
  const { data: sessions = [], isLoading, isError: sessionsError, refetch: retrySessions } = useQuery({
    queryKey: ['cash-sessions', admin ? locationId : 'seller'],
    queryFn: () => cashApi.sessions(admin && locationId ? { location_id: Number(locationId) } : {}).then((r) => r.data),
  })
  const active = sessions.find((item) => item.status === 'open')
  const selected = sessions.find((item) => item.id === selectedId) || active || sessions[0]
  const { data: movements = [], isLoading: movementsLoading, isError: movementsError, refetch: retryMovements } = useQuery({
    queryKey: ['cash-movements', selected?.id],
    queryFn: () => cashApi.movements(selected.id).then((r) => r.data),
    enabled: Boolean(selected),
  })
  const run = useMutation({
    mutationFn: async ({ action, id, payload }) => {
      if (action === 'open') return cashApi.open(payload)
      if (action === 'movement') return cashApi.movement(id, payload)
      return cashApi.close(id, payload)
    },
    onSuccess: (_, values) => {
      toast.success(values.action === 'open' ? 'Turno abierto' : values.action === 'movement' ? 'Movimiento registrado' : 'Arqueo y cierre registrados')
      qc.invalidateQueries({ queryKey: ['cash-sessions'] })
      qc.invalidateQueries({ queryKey: ['cash-movements'] })
      setAmount('')
      setNote('')
      setCounted('')
      setClosingNote('')
      setOpening('')
      setOpeningNote('')
      setSelectedId(null)
    },
    onError: (error) => toast.error(errorText(error)),
  })
  const submit = async (event, action, id, payload) => {
    event.preventDefault()
    const closing = action === 'close'
    if (!(await confirmAction(closing ? 'Se registrará el arqueo y el turno quedará cerrado. Esta acción no se puede deshacer.' : '¿Confirmas esta operación de caja?', { title: closing ? 'Cerrar turno de caja' : 'Registrar operación', confirmLabel: closing ? 'Cerrar turno' : 'Registrar', danger: closing }))) return
    run.mutate({ action, id, payload })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Caja y arqueos</h1>
        <p className="text-sm text-gray-500">Aperturas, movimientos, ventas en efectivo y cierres por punto físico.</p>
      </div>

      {admin && <div className="card admin-cash-card space-y-2">
        <label className="form-label" htmlFor="cash-location-filter"><MapPin size={15} className="inline me-1"/> Filtrar por punto físico</label>
        <select id="cash-location-filter" className="form-select" value={locationId} onChange={(e) => { setLocationId(e.target.value); setSelectedId(null) }}>
          <option value="">Todas las sedes</option>
          {physical.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
      </div>}

      <div className="row g-3" aria-label="Resumen de caja">
        {[
          { label: 'Turnos encontrados', value: sessionsError ? 'No disponible' : isLoading ? '…' : sessions.length.toLocaleString('es-CO'), icon: Wallet },
          { label: 'Turnos abiertos', value: sessionsError ? 'No disponible' : isLoading ? '…' : sessions.filter(session => session.status === 'open').length.toLocaleString('es-CO'), icon: CheckCircle2 },
          { label: 'Saldo esperado (turno seleccionado)', value: sessionsError ? 'No disponible' : isLoading ? '…' : selected ? money(selected.expected_amount) : 'Sin turno', icon: Landmark },
        ].map(({label,value,icon:Icon}) => <div className="col-12 col-sm-6 col-xl-4" key={label}>
          <div className="admin-catalog-stat"><span className="d-flex align-items-center gap-2"><Icon size={16}/>{label}</span>
            <strong className="admin-cash-stat-value">{value}</strong>
          </div>
        </div>)}
      </div>

      {sessionsError && <div className="admin-report-fetch-error" role="alert"><p>No se pudieron consultar los turnos de caja. No se mostrarán saldos estimados.</p><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => retrySessions()}>Reintentar</button></div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card admin-cash-card space-y-4">
          <h2 className="admin-cash-section-heading"><Wallet size={19}/> Abrir turno de caja</h2>
          <form onSubmit={(e) => submit(e, 'open', null, {
            location_id: Number(admin ? locationId : sellerLocationId),
            opening_amount: opening,
            note: openingNote || null,
          })} className="space-y-3">
            {admin && !locationId && <p className="text-sm text-amber-700">Selecciona una sede antes de abrir un turno.</p>}
            <label className="block text-sm">Base inicial en efectivo (COP)</label>
            <input aria-label="Base inicial en efectivo" className={classes} type="number" min="0" step="0.01" required value={opening} onChange={(e) => setOpening(e.target.value)} />
            <label className="block text-sm">Observación</label>
            <input className={classes} maxLength={500} value={openingNote} onChange={(e) => setOpeningNote(e.target.value)} placeholder="Ej. Base de caja recibida" />
            <button className="btn btn-primary" disabled={run.isPending || (admin && !locationId) || (!admin && !sellerLocationId)}>Abrir caja</button>
          </form>
          <p className="text-xs text-gray-500">Solo se permite un turno abierto por sede. No se cambian ventas históricas.</p>
        </div>

        <div className="card admin-cash-card space-y-3">
          <h2 className="admin-cash-section-heading"><ReceiptText size={19}/> Turnos y arqueos</h2>
          {isLoading ? <p className="text-sm" role="status">Cargando turnos...</p> : sessionsError ? <p className="text-sm text-danger" role="alert">No fue posible cargar los turnos.</p> : sessions.length === 0 ? <p className="text-sm text-gray-500">Aún no existen turnos en este filtro.</p> : (
            <div className="max-h-72 overflow-y-auto space-y-2">
              {sessions.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)}
                className={`admin-cash-session w-full border rounded-xl p-3 text-left text-sm ${selected?.id === item.id ? 'admin-cash-session-selected' : 'border-gray-200'}`} aria-pressed={selected?.id === item.id}>
                <span className="font-semibold">Turno #{item.id} · Sede {item.location_id}</span>
                <span className={item.status === 'open' ? 'badge text-bg-success float-right' : 'badge text-bg-secondary float-right'}>
                  {item.status === 'open' ? 'Abierto' : 'Cerrado'}</span>
                <p className="text-gray-500 mt-1">{dateTime(item.opened_at)} · {money(item.expected_amount)}</p>
              </button>)}
            </div>
          )}
        </div>
      </div>

      {!sessionsError && selected && <div className="space-y-5">
        <div className="card">
          <h2 className="admin-cash-section-heading mb-3"><Landmark size={19}/> Resumen del turno #{selected.id}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500">Base inicial</p><strong>{money(selected.opening_amount)}</strong></div>
            <div><p className="text-gray-500">Ventas en efectivo</p><strong>{money(selected.sales_cash)}</strong></div>
            <div><p className="text-gray-500">Otros ingresos</p><strong>{money(selected.income)}</strong></div>
            <div><p className="text-gray-500">Egresos y retiros</p><strong>{money(Number(selected.expenses) + Number(selected.withdrawals))}</strong></div>
            <div><p className="text-gray-500">Saldo esperado</p><strong>{money(selected.expected_amount)}</strong></div>
            {selected.status === 'closed' && <>
              <div><p className="text-gray-500">Contado</p><strong>{money(selected.closing_counted)}</strong></div>
              <div><p className="text-gray-500">Diferencia</p><strong>{money(selected.difference)}</strong></div>
              <div><p className="text-gray-500">Cierre</p><strong>{dateTime(selected.closed_at)}</strong></div>
            </>}
          </div>
        </div>

        {selected.status === 'open' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <form className="card space-y-3" onSubmit={(e) => submit(e, 'movement', selected.id, { movement_type: moveType, amount, note })}>
            <h2 className="admin-cash-section-heading"><ArrowLeftRight size={18}/> Nuevo movimiento</h2>
            <select className="form-select" aria-label="Tipo de movimiento" value={moveType} onChange={(e) => setMoveType(e.target.value)}>
              <option value="income">Ingreso adicional</option>
              {admin && <><option value="expense">Egreso autorizado</option><option value="withdrawal">Retiro autorizado</option></>}
            </select>
            <input aria-label="Valor del movimiento en pesos" className={classes} type="number" min="0.01" step="0.01" placeholder="Valor COP" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            <textarea aria-label="Motivo y soporte del movimiento" className={classes} minLength={3} maxLength={500} required placeholder="Motivo y soporte del movimiento" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary" disabled={run.isPending}>Registrar movimiento</button>
          </form>

          <form className="card space-y-3" onSubmit={(e) => submit(e, 'close', selected.id, { counted_amount: counted, note: closingNote || null })}>
            <h2 className="admin-cash-section-heading"><CheckCircle2 size={18}/> Cerrar y arquear caja</h2>
            <p className="text-sm text-gray-500">Saldo esperado: <strong>{money(selected.expected_amount)}</strong></p>
            <input aria-label="Dinero contado físicamente" className={classes} type="number" min="0" step="0.01" required placeholder="Dinero contado físicamente" value={counted} onChange={(e) => setCounted(e.target.value)} />
            <textarea aria-label="Observación del cierre" className={classes} maxLength={500} placeholder="Observación del cierre" value={closingNote} onChange={(e) => setClosingNote(e.target.value)} />
            {counted !== '' && <p className="admin-cash-difference" role="status">
              <AlertTriangle size={16} aria-hidden="true"/> Diferencia estimada: <strong>{money(Number(counted) - Number(selected.expected_amount))}</strong>
            </p>}
            <button className="btn-primary" disabled={run.isPending}>Confirmar cierre</button>
          </form>
        </div>}

        <div className="card">
          <h2 className="admin-cash-section-heading mb-3"><ReceiptText size={18}/> Historial de movimientos</h2>
          <div className="table-responsive admin-list-table-scroll" role="region" aria-label="Historial de movimientos de caja" tabIndex={0}><table className="table table-hover align-middle admin-cash-movements-table mb-0">
            <caption className="visually-hidden">Movimientos de caja con fecha, tipo, motivo e importe</caption>
            <thead><tr className="border-b text-left"><th className="py-2">Fecha</th><th>Tipo</th><th>Motivo</th><th className="text-right">Importe</th></tr></thead>
            <tbody>{!movementsLoading && !movementsError && movements.map((item) => <tr key={item.id} className="border-b border-gray-100">
              <td className="py-2 pr-3">{dateTime(item.created_at)}</td>
              <td className="pr-3">{({ sale: 'Venta', income: 'Ingreso', expense: 'Egreso', withdrawal: 'Retiro' })[item.movement_type] || item.movement_type}</td>
              <td className="pr-3">{item.note}</td>
              <td className="text-right whitespace-nowrap">{money(item.amount)}</td>
            </tr>)}</tbody>
          </table></div>
          {movementsLoading ? <p className="text-sm text-gray-500 mt-3" role="status">Cargando movimientos…</p> : movementsError ? <div role="alert" className="admin-report-fetch-error mt-3"><p>No fue posible consultar los movimientos del turno.</p><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => retryMovements()}>Reintentar</button></div> : movements.length === 0 ? <p className="text-sm text-gray-500 mt-3">Sin movimientos registrados.</p> : null}
        </div>
      </div>}
    </div>
  )
}
