import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Truck, Plus, Pencil, X, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { shippingApi } from '../services/api'

const formatCOP = (value) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(value) || 0)

const EMPTY = {
  department: '', city: '', carrier: '', service: 'Estándar',
  price: '', days_min: 2, days_max: 5, active: true,
}

function RateForm({ initial, onCancel, onSave, saving }) {
  const [form, setForm] = useState(initial || EMPTY)
  const change = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))
  const save = (event) => {
    event.preventDefault()
    const price = Number(form.price)
    if (!Number.isFinite(price) || price < 0 || Number(form.days_min) < 1 ||
        Number(form.days_max) < Number(form.days_min)) {
      toast.error('Comprueba el precio y los días estimados')
      return
    }
    onSave({
      ...form,
      department: form.department.trim(),
      city: form.city.trim() || null,
      carrier: form.carrier.trim(),
      service: form.service.trim(),
      price,
      days_min: Number(form.days_min),
      days_max: Number(form.days_max),
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50"
      role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="shipping-dialog-title"
        className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto bg-white rounded-2xl p-5 sm:p-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div><h2 id="shipping-dialog-title" className="font-black text-xl">
            {initial ? 'Editar tarifa' : 'Nueva tarifa'}
          </h2><p className="text-sm text-neutral-500 mt-1">
            La ciudad vacía aplica a todo el departamento.
          </p></div>
          <button type="button" aria-label="Cerrar formulario" onClick={onCancel} className="p-2"><X size={20}/></button>
        </div>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            ['department','Departamento *','Ej. Atlántico'],
            ['city','Ciudad (opcional)','Ej. Barranquilla'],
            ['carrier','Transportadora *','Nombre del operador'],
            ['service','Servicio *','Ej. Estándar'],
          ].map(([key,label,placeholder]) => (
            <div key={key}>
              <label htmlFor={`shipping-${key}`} className="block font-semibold text-xs mb-2">{label}</label>
              <input id={`shipping-${key}`} className="input" value={form[key] || ''}
                placeholder={placeholder} maxLength={120} required={key !== 'city'}
                onChange={(event) => change(key, event.target.value)} />
            </div>
          ))}
          <div>
            <label htmlFor="shipping-price" className="block font-semibold text-xs mb-2">Costo al cliente (COP) *</label>
            <input id="shipping-price" className="input" type="number" min="0" step="0.01"
              value={form.price} required onChange={(event) => change('price', event.target.value)}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {['days_min', 'days_max'].map((key) => (
              <div key={key}>
                <label htmlFor={key} className="block font-semibold text-xs mb-2">{key === 'days_min' ? 'Días mín.' : 'Días máx.'}</label>
                <input id={key} className="input" type="number" min="1" max="90" step="1" required
                  value={form[key]} onChange={(event) => change(key, event.target.value)}/>
              </div>
            ))}
          </div>
          <label className="sm:col-span-2 flex items-center gap-3 text-sm">
            <input type="checkbox" checked={form.active} onChange={(event) => change('active', event.target.checked)}/>
            Tarifa activa y disponible para los compradores
          </label>
          <div className="sm:col-span-2 flex flex-col sm:flex-row justify-end gap-3 border-t border-neutral-200 pt-5 mt-2">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear tarifa'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function ShippingRatesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const { data: rates = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['shipping-rates'],
    queryFn: () => shippingApi.list().then(({ data }) => data),
  })
  const mutation = useMutation({
    mutationFn: (payload) => editing ? shippingApi.update(editing.id, payload) : shippingApi.create(payload),
    onSuccess: () => {
      toast.success('Tarifa guardada correctamente')
      queryClient.invalidateQueries({ queryKey: ['shipping-rates'] })
      setModalOpen(false)
      setEditing(null)
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'No fue posible guardar la tarifa'),
  })
  const visible = rates.filter((rate) =>
    [rate.department, rate.city, rate.carrier, rate.service].some(
      (value) => String(value || '').toLocaleLowerCase('es-CO').includes(search.toLocaleLowerCase('es-CO'))
    )
  )
  const openForm = (rate = null) => { setEditing(rate); setModalOpen(true) }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="uppercase font-bold tracking-widest text-xs text-slate-500">CONFIGURACIÓN COMERCIAL</p>
          <h1 className="font-black tracking-tight text-3xl mt-2">Tarifas de envío</h1>
          <p className="text-sm text-slate-500 mt-2">Configura costos y tiempos de entrega por destino, transportadora y servicio.</p>
        </div>
        <button type="button" className="btn-primary inline-flex gap-2 items-center justify-center"
          onClick={() => openForm()}><Plus size={18}/> Nueva tarifa</button>
      </div>
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-5">
          <div className="flex items-center gap-2"><Truck size={20}/>
            <h2 className="font-bold">Tarifario comercial</h2><span className="text-slate-500 text-xs">({rates.length})</span>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-3 text-slate-400" size={16}/>
            <input className="input pl-9" aria-label="Buscar tarifas" value={search}
              onChange={(event) => setSearch(event.target.value)} placeholder="Buscar destino o transportadora"/>
          </div>
        </div>
        {isLoading ? <p role="status" className="py-12 text-center text-slate-500">Cargando tarifas…</p>
          : isError ? <div role="alert" className="py-12 text-center text-red-700">No fue posible cargar las tarifas.
              <button className="btn-secondary ml-3" onClick={() => refetch()}>Reintentar</button></div>
            : !visible.length ? <p className="py-12 text-center text-slate-500">No se encontraron tarifas. Crea la primera para habilitar envíos.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead><tr className="text-left border-b">
                      {['Departamento','Ciudad','Transportadora','Servicio','Costo','Entrega estimada','Estado','Acción'].map(x=>
                        <th key={x} className="px-3 py-3">{x}</th>)}
                    </tr></thead>
                    <tbody>{visible.map((rate) => (
                      <tr key={rate.id} className="border-b border-slate-100">
                        <td className="px-3 py-4 font-semibold">{rate.department}</td>
                        <td className="px-3 py-4">{rate.city || 'Todo el departamento'}</td>
                        <td className="px-3 py-4">{rate.carrier}</td>
                        <td className="px-3 py-4">{rate.service}</td>
                        <td className="px-3 py-4 font-bold">{formatCOP(rate.price)}</td>
                        <td className="px-3 py-4">{rate.days_min}–{rate.days_max} días</td>
                        <td className="px-3 py-4"><span className={rate.active ? 'badge-green' : 'badge-gray'}>
                          {rate.active ? 'Activa' : 'Inactiva'}</span></td>
                        <td className="px-3 py-4">
                          <button type="button" onClick={() => openForm(rate)}
                            className="inline-flex gap-2 items-center text-indigo-700 font-semibold min-h-10">
                            <Pencil size={15}/> Editar
                          </button>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
      </div>
      <p className="text-xs text-slate-500 leading-6">Estas tarifas son valores configurados por HJStoreVP, no cotizaciones automáticas de una transportadora. Los pedidos creados conservan su valor y servicio originales.</p>
      {modalOpen && <RateForm key={editing?.id ?? 'new'} initial={editing} saving={mutation.isPending}
        onSave={(payload) => mutation.mutate(payload)}
        onCancel={() => { setModalOpen(false); setEditing(null) }}/>}
    </div>
  )
}
