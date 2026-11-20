import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { commercialAuditApi } from '../services/api'

const SOURCE_NAMES = {
  stock_movements: 'Movimientos de inventario',
  shipment_events: 'Eventos de despacho',
  post_sale_events: 'Eventos de posventa',
  commercial_document_events: 'Comprobantes internos',
  product_quality_review_events: 'Revisión de catálogo',
}

export default function CommercialAuditPage() {
  const [filters, setFilters] = useState({ source: '', actor_id: '', resource: '', action: '', from_date: '', to_date: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ total: 0, items: [] })
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = { page, per_page: 30 }
    Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value })
    commercialAuditApi.list(params).then(({ data }) => {
      if (alive) setData(data)
    }).catch(() => { if (alive) toast.error('No se pudo consultar el historial comercial') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [page, filters, nonce])

  const change = (key, value) => {
    setPage(1)
    setFilters(previous => ({ ...previous, [key]: value }))
  }

  const download = async () => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
      const { data: blob } = await commercialAuditApi.exportCsv(params)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'hjstore-commercial-audit.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo exportar la auditoría comercial')
    } finally {
      setLoading(false)
    }
  }

  return <main className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Auditoría comercial</h1>
        <p className="text-sm text-gray-600">
          Consulta de historiales existentes. No altera existencias, pagos ni pedidos.
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" className="rounded-lg border px-4 py-2" disabled={loading} onClick={download}>Exportar CSV (500)</button>
        <button type="button" className="btn-primary" disabled={loading} onClick={() => setNonce(value => value + 1)}>Actualizar</button>
      </div>
    </header>

    <section className="rounded-xl border border-gray-200 bg-white p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm">Origen
        <select className="input mt-1" value={filters.source} onChange={e => change('source', e.target.value)}>
          <option value="">Todos los historiales</option>
          {Object.entries(SOURCE_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="text-sm">Actor ID
        <input className="input mt-1" type="number" min={1} value={filters.actor_id} onChange={e => change('actor_id', e.target.value)} />
      </label>
      <label className="text-sm">Acción
        <input className="input mt-1" maxLength={64} value={filters.action} onChange={e => change('action', e.target.value)} placeholder="status / adjustment…" />
      </label>
      <label className="text-sm">Recurso
        <select className="input mt-1" value={filters.resource} onChange={e => change('resource', e.target.value)}>
          <option value="">Todos</option>
          {['inventory', 'shipments', 'post_sale', 'documents', 'catalog'].map(x => <option key={x}>{x}</option>)}
        </select>
      </label>
      <label className="text-sm">Desde (UTC)
        <input type="datetime-local" className="input mt-1" value={filters.from_date} onChange={e => change('from_date', e.target.value)}/>
      </label>
      <label className="text-sm">Hasta (UTC)
        <input type="datetime-local" className="input mt-1" value={filters.to_date} onChange={e => change('to_date', e.target.value)}/>
      </label>
    </section>
    <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
      <div className="p-4 text-sm font-semibold">{data.total} eventos {loading ? '· Actualizando…' : ''}</div>
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-600"><tr>
          <th className="p-3">Fecha UTC</th><th className="p-3">Origen</th>
          <th className="p-3">Actor</th><th className="p-3">Acción</th><th className="p-3">Recurso / ID</th>
          <th className="p-3">Integridad</th>
        </tr></thead>
        <tbody>{data.items.map(row => <tr key={`${row.source}-${row.source_id}`} className="border-t border-gray-100">
          <td className="p-3 whitespace-nowrap">{row.created_at?.replace('T', ' ') || '—'}</td>
          <td className="p-3">{SOURCE_NAMES[row.source] || row.source} #{row.source_id}</td>
          <td className="p-3">{row.actor_id ?? '—'}</td>
          <td className="p-3 font-mono">{row.action}</td>
          <td className="p-3">{row.resource} / {row.target_id}</td>
          <td className="p-3 text-amber-700">Historial de origen (sin firma central)</td>
        </tr>)}
        {!loading && data.items.length === 0 && <tr><td className="p-6 text-gray-500" colSpan={6}>Sin eventos para los filtros elegidos.</td></tr>}</tbody>
      </table>
      <footer className="p-4 flex justify-end items-center gap-3 border-t text-sm">
        <button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
        <span>Página {page}</span>
        <button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={loading || page * 30 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</button>
      </footer>
    </div>
  </main>
}
