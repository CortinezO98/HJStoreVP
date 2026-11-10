import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlugZap, RefreshCw, AlertTriangle } from 'lucide-react'
import { integrationsApi } from '../services/api'

const LABELS = {
  modulo_disponible: 'Módulo disponible',
  pendiente_configuracion: 'Pendiente de configuración',
  credenciales_presentes: 'Credenciales presentes',
  habilitado_por_configuracion: 'Habilitado por configuración',
  deshabilitado: 'Deshabilitado',
  no_integrado: 'Sin integración activa',
}
const COLORS = {
  modulo_disponible: 'bg-emerald-50 text-emerald-800',
  pendiente_configuracion: 'bg-amber-50 text-amber-800',
  credenciales_presentes: 'bg-blue-50 text-blue-800',
  habilitado_por_configuracion: 'bg-blue-50 text-blue-800',
  deshabilitado: 'bg-slate-100 text-slate-700',
  no_integrado: 'bg-slate-100 text-slate-700',
}

export default function IntegrationsPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await integrationsApi.overview()
      setData(result.data)
    } catch {
      setError('No fue posible consultar el centro de integraciones. Revisa la sesión y el backend actualizado.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [])
  const groups = [...new Set((data?.integrations || []).map((item) => item.group))]
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-700 flex items-center gap-2"><PlugZap size={17} /> Control operacional</p>
          <h1 className="text-2xl font-bold text-slate-900">Centro de integraciones</h1>
          <p className="mt-2 text-sm text-slate-600">Consulta en un solo lugar el alcance de los módulos y las configuraciones disponibles.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading}
          className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
          <RefreshCw size={16} /> Actualizar estado
        </button>
      </header>
      {error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {loading && <p role="status" className="text-sm text-slate-500">Consultando configuración…</p>}
      {data && <>
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-700">
          <strong>Entorno: {data.environment}</strong>
          <p className="mt-2 flex gap-2"><AlertTriangle size={18} className="shrink-0 text-amber-600" />{data.disclaimer}</p>
        </div>
        {groups.map((group) => (
          <section key={group} aria-label={group} className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">{group}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.integrations.filter((item) => item.group === group).map((item) => (
                <article key={item.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${COLORS[item.status] || COLORS.deshabilitado}`}>
                    {LABELS[item.status] || item.status}
                  </span>
                  <p className="text-xs text-slate-500">{item.stage}</p>
                  <p className="text-sm text-slate-700">{item.detail}</p>
                  {item.path && <Link to={item.path} className="inline-block text-sm font-semibold text-indigo-700 hover:underline">Abrir módulo</Link>}
                </article>
              ))}
            </div>
          </section>
        ))}
      </>}
    </div>
  )
}
