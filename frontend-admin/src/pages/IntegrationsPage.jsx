import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw, Search } from 'lucide-react'
import { integrationsApi } from '../services/api'

const STATUS = {
  modulo_disponible: { text: 'Disponible', color: 'bg-emerald-50 text-emerald-700', type: 'available' },
  habilitado_por_configuracion: { text: 'Configurado', color: 'bg-blue-50 text-blue-700', type: 'configured' },
  credenciales_presentes: { text: 'Credenciales', color: 'bg-blue-50 text-blue-700', type: 'configured' },
  pendiente_configuracion: { text: 'Pendiente', color: 'bg-amber-50 text-amber-800', type: 'pending' },
  deshabilitado: { text: 'Deshabilitado', color: 'bg-slate-100 text-slate-600', type: 'pending' },
  no_integrado: { text: 'Pendiente', color: 'bg-slate-100 text-slate-600', type: 'pending' },
}

export default function IntegrationsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await integrationsApi.overview()
      setData(result.data)
    } catch {
      setError('No fue posible consultar el estado de las integraciones.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const integrations = useMemo(() => data?.integrations || [], [data])
  const groups = useMemo(() => [...new Set(integrations.map(item => item.group))], [integrations])
  const visible = useMemo(() => integrations.filter(item =>
    (group === 'all' || item.group === group) &&
    (item.title.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')) ||
      item.group.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')))
  ), [integrations, group, search])

  const counts = integrations.reduce((result, item) => {
    const type = STATUS[item.status]?.type || 'pending'
    result[type] += 1
    return result
  }, { available: 0, configured: 0, pending: 0 })

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Centro de integraciones</h1>
          <p className="mt-1 text-sm text-slate-500">Consulta rápida de módulos y configuraciones.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={16} aria-hidden="true" /> Actualizar
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p role="status" className="text-sm text-slate-500">Consultando integraciones…</p>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Resumen de integraciones">
            {[
              { label: 'Disponibles', value: counts.available, color: 'text-emerald-700' },
              { label: 'Configuradas', value: counts.configured, color: 'text-blue-700' },
              { label: 'Pendientes', value: counts.pending, color: 'text-amber-700' },
            ].map(item => (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                <p className="text-xs sm:text-sm text-slate-500">{item.label}</p>
                <p className={`mt-1 text-2xl font-bold ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Listado de integraciones">
            <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
              <label className="relative min-w-[180px] flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <span className="sr-only">Buscar integraciones</span>
                <input type="search" value={search} onChange={event => setSearch(event.target.value)}
                  placeholder="Buscar integración" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <label>
                <span className="sr-only">Filtrar por categoría</span>
                <select value={group} onChange={event => setGroup(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:w-auto">
                  <option value="all">Todas las categorías</option>
                  {groups.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <div className="divide-y divide-slate-100">
              {visible.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No hay integraciones que coincidan con el filtro.</p>}
              {visible.map(item => {
                const status = STATUS[item.status] || STATUS.no_integrado
                const open = expanded === item.key
                return (
                  <div key={item.key}>
                    <button type="button" onClick={() => setExpanded(open ? null : item.key)}
                      aria-expanded={open} aria-controls={`integration-detail-${item.key}`}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                        <span className="text-xs text-slate-400">{item.group}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${status.color}`}>
                        {status.text}
                      </span>
                      {open ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
                    </button>
                    {open && (
                      <div id={`integration-detail-${item.key}`} className="space-y-2 bg-slate-50 px-4 pb-4 pt-1 text-sm text-slate-600">
                        <p>{item.detail}</p>
                        <p className="text-xs text-slate-500">Alcance: {item.stage}</p>
                        {item.path && <Link to={item.path} className="inline-block font-semibold text-indigo-700 hover:underline">Ir al módulo</Link>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <details className="rounded-lg px-1 text-xs text-slate-500">
            <summary className="inline-flex cursor-pointer items-center gap-2 font-medium text-slate-600">
              <AlertCircle size={15} /> Información sobre los estados
            </summary>
            <p className="mt-2 max-w-3xl">{data.disclaimer} Entorno: {data.environment}.
              Disponible significa que existe el módulo; configurado indica parámetros presentes, no operación verificada.
              Pendiente incluye servicios apagados o sin integración.</p>
          </details>
        </>
      )}
    </div>
  )
}
