import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { apiClient } from '../services/api'
import { TicketPercent, Plus, Save } from 'lucide-react'

const EMPTY = {
  code: '', description: '', discount_type: 'percentage', discount_value: 10,
  maximum_discount: '', minimum_subtotal: 0, max_uses: '',
  max_uses_per_customer: 1, starts_at: '', expires_at: '', active: true,
}
const money = v => new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(v||0))
const toLocal = v => v ? String(v).slice(0,16) : ''
const editForm = item => ({
  ...item, starts_at: toLocal(item.starts_at), expires_at: toLocal(item.expires_at),
  maximum_discount: item.maximum_discount ?? '', max_uses: item.max_uses ?? '',
})
const payload = form => ({
  ...form, code: form.code.trim().toUpperCase(),
  description: form.description.trim() || null,
  discount_value: Number(form.discount_value),
  minimum_subtotal: Number(form.minimum_subtotal),
  maximum_discount: form.discount_type === 'percentage' && form.maximum_discount !== ''
    ? Number(form.maximum_discount) : null,
  max_uses: form.max_uses === '' ? null : Number(form.max_uses),
  max_uses_per_customer: Number(form.max_uses_per_customer),
  starts_at: form.starts_at || null, expires_at: form.expires_at || null,
})

export default function PromotionsPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [showForm, setShowForm] = useState(false)
  const {data: coupons=[], isLoading, isError, refetch} = useQuery({
    queryKey:['admin-promotions'], queryFn:()=>apiClient.get('/promotions/admin').then(r=>r.data),
  })
  const save = useMutation({
    mutationFn: data => editing
      ? apiClient.put(`/promotions/admin/${editing}`,data)
      : apiClient.post('/promotions/admin',data),
    onSuccess:()=>{toast.success('Campaña guardada');qc.invalidateQueries({queryKey:['admin-promotions']});setShowForm(false);setEditing(null);setForm(EMPTY)},
    onError:e=>{const d=e.response?.data?.detail;toast.error(typeof d==='string'?d:'No fue posible guardar el cupón')},
  })
  const toggle = useMutation({
    mutationFn: coupon => apiClient.put(`/promotions/admin/${coupon.id}`,{
      ...coupon, active:!coupon.active,
    }),
    onSuccess:()=>qc.invalidateQueries({queryKey:['admin-promotions']}),
    onError:()=>toast.error('No se pudo actualizar el estado'),
  })
  const set=(field,value)=>setForm(v=>({...v,[field]:value}))
  const start = coupon => {
    setEditing(coupon?.id || null)
    setForm(coupon?editForm(coupon):EMPTY)
    setShowForm(true)
  }
  return <div className="space-y-6">
    <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
      <div>
        <p className="admin-dashboard-overline">MARKETING Y CONVERSIÓN</p>
        <h1 className="text-3xl font-black tracking-tight">Promociones y cupones</h1>
        <p className="text-sm text-slate-500 mt-2">Control de descuentos del checkout web, vigencias y límites por comprador.</p>
      </div>
      <button type="button" className="btn-primary inline-flex items-center gap-2 self-start" onClick={()=>start(null)}><Plus size={17}/> Nueva campaña</button>
    </header>
    <div className="p-4 border border-amber-200 bg-amber-50 text-amber-900 text-sm">
      Los cupones descontarán el subtotal de productos, nunca el envío; se vuelven a validar al crear cada pedido.
      No cambian precios históricos ni se aplican a ventas físicas en esta etapa.
    </div>
    {showForm && <form className="card space-y-4" onSubmit={e=>{e.preventDefault();save.mutate(payload(form))}}>
      <div className="flex justify-between items-center gap-2">
        <h2 className="font-black text-lg flex gap-2 items-center"><TicketPercent size={19}/> {editing?'Editar cupón':'Crear cupón'}</h2>
        <button type="button" className="btn-secondary" onClick={()=>setShowForm(false)}>Cancelar</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="block text-xs font-bold mb-1" htmlFor="promo-code">Código de promoción</label>
          <input id="promo-code" className="input" required minLength={3} maxLength={32} value={form.code}
            onChange={e=>set('code',e.target.value.toUpperCase())} placeholder="BIENVENIDO10"/></div>
        <div><label className="block text-xs font-bold mb-1" htmlFor="promo-type">Tipo</label>
          <select id="promo-type" className="input" value={form.discount_type} onChange={e=>set('discount_type',e.target.value)}>
            <option value="percentage">Porcentaje (%)</option><option value="fixed">Valor fijo (COP)</option>
          </select></div>
        <div><label className="block text-xs font-bold mb-1" htmlFor="promo-value">Valor de descuento</label>
          <input id="promo-value" type="number" min="0.01" step="0.01" required className="input" value={form.discount_value}
            onChange={e=>set('discount_value',e.target.value)}/></div>
        <div><label className="block text-xs font-bold mb-1" htmlFor="promo-cap">Tope de descuento COP (opcional)</label>
          <input id="promo-cap" type="number" min="0.01" step="0.01" className="input" disabled={form.discount_type!=='percentage'}
            value={form.discount_type==='percentage'?form.maximum_discount:''}
            onChange={e=>set('maximum_discount',e.target.value)}/></div>
        <div><label className="block text-xs font-bold mb-1" htmlFor="promo-min">Subtotal mínimo COP</label>
          <input id="promo-min" type="number" min="0" step="0.01" required className="input"
            value={form.minimum_subtotal} onChange={e=>set('minimum_subtotal',e.target.value)}/></div>
        <div><label className="block text-xs font-bold mb-1" htmlFor="promo-uses">Máximo de pedidos (opcional)</label>
          <input id="promo-uses" type="number" min="1" className="input" value={form.max_uses}
            onChange={e=>set('max_uses',e.target.value)}/></div>
        <div><label className="block text-xs font-bold mb-1" htmlFor="promo-per-customer">Usos máximos por cliente</label>
          <input id="promo-per-customer" type="number" min="1" max="100" required className="input"
            value={form.max_uses_per_customer} onChange={e=>set('max_uses_per_customer',e.target.value)}/></div>
        <div><label className="block text-xs font-bold mb-1" htmlFor="promo-description">Descripción</label>
          <input id="promo-description" className="input" maxLength={240} value={form.description || ''}
            onChange={e=>set('description',e.target.value)}/></div>
        <div><label className="block text-xs font-bold mb-1" htmlFor="promo-start">Inicio (UTC, opcional)</label>
          <input id="promo-start" type="datetime-local" className="input" value={form.starts_at}
            onChange={e=>set('starts_at',e.target.value)}/></div>
        <div><label className="block text-xs font-bold mb-1" htmlFor="promo-end">Vencimiento (UTC, opcional)</label>
          <input id="promo-end" type="datetime-local" className="input" value={form.expires_at}
            onChange={e=>set('expires_at',e.target.value)}/></div>
      </div>
      <label className="text-sm flex gap-2 items-center">
        <input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)}/> Campaña activa
      </label>
      <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={save.isPending}>
        <Save size={16}/>{save.isPending?'Guardando…':'Guardar cupón'}
      </button>
    </form>}
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-lg">Campañas registradas</h2>
        <button type="button" className="btn-secondary" onClick={()=>refetch()}>Actualizar</button>
      </div>
      {isLoading?<p role="status">Cargando campañas…</p>:isError?<p role="alert" className="text-red-700">No fue posible consultar las campañas.</p>:
        !coupons.length?<p className="text-slate-500 text-sm py-8">Todavía no hay cupones creados.</p>:
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b text-left">{['Código','Descuento','Usos activos','Vigencia','Estado','Acciones'].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead>
          <tbody>{coupons.map(c=><tr key={c.id} className="border-b border-slate-100">
            <td className="p-3 font-mono font-bold">{c.code}</td>
            <td className="p-3">{c.discount_type==='percentage'?`${c.discount_value}%`:money(c.discount_value)}</td>
            <td className="p-3">{c.committed_or_reserved_uses}{c.max_uses?` / ${c.max_uses}`:''}</td>
            <td className="p-3 text-xs">{c.expires_at?new Date(c.expires_at).toLocaleDateString('es-CO'):'Sin vencimiento'}</td>
            <td className="p-3">{c.active?'Activo':'Inactivo'}</td>
            <td className="p-3 space-x-3">
              <button type="button" className="underline text-indigo-700" onClick={()=>start(c)}>Editar</button>
              <button type="button" className="underline text-indigo-700" disabled={toggle.isPending} onClick={()=>toggle.mutate(c)}>
                {c.active?'Desactivar':'Activar'}
              </button>
            </td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </div>
}
