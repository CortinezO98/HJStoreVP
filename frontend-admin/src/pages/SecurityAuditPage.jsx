import { useEffect, useState } from 'react'
import { ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { securityAuditApi } from '../services/api'

export default function SecurityAuditPage() {
  const [filters, setFilters] = useState({ action: '', resource: '', outcome: '', actor_id: '', from_date: '', to_date: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ total: 0, items: [] })
  const [busy, setBusy] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let active = true
    setBusy(true)
    const params = { page, per_page: 30 }
    for (const [name, value] of Object.entries(filters)) {
      if (value) params[name] = value
    }
    securityAuditApi.list(params).then(({ data: result }) => {
      if (active) setData(result)
    }).catch(error => {
      if (active) toast.error(error?.response?.data?.detail || 'No se pudo consultar la auditoría')
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [page, filters, nonce])

  const change = (key, value) => { setPage(1); setFilters(f => ({ ...f, [key]: value })) }
  const hasNext = page * 30 < data.total

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ShieldCheck size={24} /> Centro de auditoría</h1>
        <p className="text-sm text-gray-600">Historial de seguridad y administración. Acceso exclusivo Superadministrador.</p>
      </div>
      <button type="button" className="btn-primary flex items-center gap-2" onClick={() => setNonce(n => n + 1)} disabled={busy}>
        <RefreshCw size={16} /> Actualizar
      </button>
    </div>

    <section className="bg-white border border-gray-200 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <label className="text-sm">Acción
        <input className="input mt-1" value={filters.action} maxLength={64} onChange={e => change('action', e.target.value)} placeholder="users.updated" />
      </label>
      <label className="text-sm">Módulo
        <select className="input mt-1" value={filters.resource} onChange={e => change('resource', e.target.value)}>
          <option value="">Todos</option><option value="auth">Seguridad</option><option value="users">Usuarios</option>
        </select>
      </label>
      <label className="text-sm">Resultado
        <select className="input mt-1" value={filters.outcome} onChange={e => change('outcome', e.target.value)}>
          <option value="">Todos</option><option value="success">Correcto</option><option value="failure">Fallido</option>
        </select>
      </label>
      <label className="text-sm">ID del actor
        <input className="input mt-1" type="number" min={1} value={filters.actor_id} onChange={e => change('actor_id', e.target.value)} placeholder="ID usuario" />
      </label>
      <label className="text-sm">Desde (UTC)
        <input className="input mt-1" type="datetime-local" value={filters.from_date} onChange={e => change('from_date', e.target.value)} />
      </label>
      <label className="text-sm">Hasta (UTC)
        <input className="input mt-1" type="datetime-local" value={filters.to_date} onChange={e => change('to_date', e.target.value)} />
      </label>
    </section>

    <section className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <div className="p-4 flex items-center justify-between">
        <p className="text-sm font-medium">{data.total} eventos registrados</p>
        {busy && <p className="text-sm text-gray-500">Consultando…</p>}
      </div>
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-600"><tr>
          <th className="p-3">Fecha UTC</th><th className="p-3">Actor</th><th className="p-3">Acción</th>
          <th className="p-3">Recurso / ID</th><th className="p-3">Resultado</th><th className="p-3">Integridad</th><th className="p-3">Detalles seguros</th>
        </tr></thead>
        <tbody>
          {data.items.map(row => <tr key={row.id} className="border-t border-gray-100">
            <td className="p-3 whitespace-nowrap">{row.created_at?.replace('T', ' ')}</td>
            <td className="p-3">{row.actor_id ?? 'No identificado'}</td>
            <td className="p-3 font-mono">{row.action}</td>
            <td className="p-3">{row.resource}{row.target_id ? ` · ${row.target_id}` : ''}</td>
            <td className="p-3">{row.outcome === 'success' ? 'Correcto' : 'Fallido'}</td>
            <td className="p-3">{row.integrity_ok ? 'Válida' : <span className="text-red-700 flex items-center gap-1"><AlertTriangle size={14} /> Alterada</span>}</td>
            <td className="p-3"><pre className="max-w-xs whitespace-pre-wrap break-all text-xs">{JSON.stringify(row.details)}</pre></td>
          </tr>)}
          {!data.items.length && !busy && <tr><td className="p-6 text-gray-500" colSpan={7}>No hay eventos para esos filtros.</td></tr>}
        </tbody>
      </table>
      <div className="p-4 flex items-center justify-end gap-3 border-t">
        <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={busy || page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
        <span className="text-sm">Página {page}</span>
        <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={busy || !hasNext} onClick={() => setPage(p => p + 1)}>Siguiente</button>
      </div>
    </section>
  </div>
}
