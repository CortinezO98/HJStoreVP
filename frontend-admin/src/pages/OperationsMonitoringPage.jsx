import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Clock3, ServerCog } from 'lucide-react'
import { operationsMonitoringApi } from '../services/api'

const labels = {
  'container:db': 'MariaDB',
  'container:redis': 'Redis',
  'container:backend': 'Backend',
  'container:store': 'Tienda',
  'container:admin': 'Administración',
  'http:api': 'HTTP API',
  'http:store': 'HTTP tienda',
  'http:admin': 'HTTP administración',
  'disk:workspace': 'Espacio local',
  'backup:db': 'Respaldo MariaDB',
  'backup:uploads': 'Respaldo de archivos',
}
const classByStatus = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  critical: 'bg-red-50 text-red-800 border-red-200',
}
const labelByStatus = { ok: 'Correcto', warning: 'Advertencia', critical: 'Crítico' }

function formatMetrics(metrics) {
  if (!metrics) return 'Sin métricas adicionales'
  return Object.entries(metrics).map(([key, value]) => {
    if (key === 'latency_ms') return `${value} ms`
    if (key === 'age_hours') return `${value} h de antigüedad`
    if (key === 'free_percent') return `${value}% disponible`
    if (key === 'http_status') return `HTTP ${value}`
    return ''
  }).filter(Boolean).join(' · ') || 'Sin métricas adicionales'
}

export default function OperationsMonitoringPage() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    setBusy(true)
    operationsMonitoringApi.summary()
      .then(({ data: report }) => {
        if (active) { setData(report); setError('') }
      })
      .catch((err) => {
        if (active) {
          setData(null)
          setError(err?.response?.status === 503
            ? 'No existe un informe local reciente. Ejecuta el recolector en el equipo de desarrollo.'
            : 'No se pudo consultar el monitoreo técnico.')
        }
      })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [version])

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Activity size={24} aria-hidden="true" /> Monitoreo técnico
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Observabilidad local de solo lectura. Acceso exclusivo del superadministrador.
        </p>
      </div>
      <button type="button" onClick={() => setVersion(v => v + 1)} disabled={busy}
        className="btn-primary flex items-center gap-2">
        <RefreshCw size={16} aria-hidden="true"/> Actualizar informe
      </button>
    </header>
    {busy && <p role="status" className="text-gray-600">Consultando métricas…</p>}
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-4">
      <AlertTriangle size={18} className="inline mr-2" aria-hidden="true"/>{error}
    </div>}
    {data && <>
      {data.stale && <div role="alert" className="border border-amber-200 bg-amber-50 p-4 rounded-xl text-amber-900">
        El reporte tiene más de 15 minutos. No representa el estado actual.
      </div>}
      <section className="grid gap-3 md:grid-cols-3" aria-label="Resumen operativo">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Estado de última muestra</p>
          <p className="font-bold text-xl mt-1">{labelByStatus[data.latest_status] || 'Sin datos'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Muestras almacenadas</p>
          <p className="font-bold text-xl mt-1">{data.sample_count}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Muestras correctas (no SLA)</p>
          <p className="font-bold text-xl mt-1">
            {data.observed_ok_percent == null ? 'Sin datos' : `${data.observed_ok_percent}%`}
          </p>
        </div>
      </section>
      <p className="text-sm text-gray-500 flex items-center gap-2">
        <Clock3 size={16} aria-hidden="true" />
        Última muestra (UTC): {data.latest_at_utc} · No equivale a disponibilidad histórica por tiempo.
      </p>
      <section className="rounded-xl bg-white border border-gray-200 p-5 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle size={20} aria-hidden="true"/> Alertas persistentes ({data.persistent_alerts.length})
        </h2>
        {data.persistent_alerts.length ? <ul className="space-y-2">
          {data.persistent_alerts.map(a => <li key={a.check}
            className={`border rounded-lg p-3 text-sm ${classByStatus[a.severity] || classByStatus.warning}`}>
            {labels[a.check] || a.check}: {labelByStatus[a.severity] || 'Advertencia'}
            {' '}en {a.samples} muestras consecutivas
          </li>)}
        </ul> : <p className="text-sm text-gray-600">
          Sin alertas persistentes con el historial recibido. Esto no sustituye monitoreo continuo.
        </p>}
      </section>
      <section className="rounded-xl bg-white border border-gray-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ServerCog size={20} aria-hidden="true"/> Servicios y controles
        </h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.entries(data.latest_checks).map(([key, check]) =>
            <div key={key} className="rounded-lg border border-gray-200 p-4">
              <div className="flex justify-between items-center gap-3">
                <strong className="text-sm">{labels[key] || key}</strong>
                <span className={`px-2 py-1 rounded-full border text-xs ${classByStatus[check.status] || classByStatus.warning}`}>
                  {check.status === 'ok'
                    ? <CheckCircle2 size={12} className="inline mr-1" aria-hidden="true"/>
                    : <AlertTriangle size={12} className="inline mr-1" aria-hidden="true"/>}
                  {labelByStatus[check.status] || 'Desconocido'}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-3">{formatMetrics(check.metrics)}</p>
            </div>)}
        </div>
      </section>
      <section className="rounded-xl bg-white border border-gray-200 p-5 space-y-3">
        <h2 className="text-lg font-semibold">Latencia observada por muestras</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          {Object.entries(data.latency).map(([key, values]) =>
            <div key={key} className="rounded-lg border border-gray-200 p-3">
              <strong>{labels[key] || key}</strong>
              <p>p50: {values.p50_ms ?? '—'} ms</p>
              <p>p95: {values.p95_ms ?? '—'} ms</p>
              <p className="text-gray-500">{values.samples || 0} muestras</p>
            </div>)}
        </div>
      </section>
      <section className="rounded-xl bg-white border border-gray-200 p-5 space-y-3">
        <h2 className="text-lg font-semibold">Últimas muestras</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead><tr><th className="p-2">Fecha UTC</th><th className="p-2">Estado</th></tr></thead>
            <tbody>{data.trend.map(item => <tr key={item.at} className="border-t">
              <td className="p-2">{item.at}</td>
              <td className="p-2">{labelByStatus[item.status] || 'Desconocido'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </>}
  </div>
}
