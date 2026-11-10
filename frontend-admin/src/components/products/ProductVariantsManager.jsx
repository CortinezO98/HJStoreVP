import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { inventoryApi, locationsApi, productsApi } from '../../services/api'
import toast from 'react-hot-toast'

const asMoney = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v || 0))
const detail = (error) => error?.response?.data?.detail || error?.message || 'No se pudo completar la operación'
const emptyForm = { label: '', sku: '', color: '', talla: '', presentacion: '', cost_price: '', sale_price: '' }

export default function ProductVariantsManager({ product, onClose }) {
  const client = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [stockTarget, setStockTarget] = useState('')
  const [stockLocation, setStockLocation] = useState('')
  const [stockQty, setStockQty] = useState('')

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ['admin-variants', product.id],
    queryFn: () => productsApi.variants(product.id).then(({ data }) => data),
  })
  const { data: locations = [] } = useQuery({
    queryKey: ['admin-variant-locations'],
    queryFn: () => locationsApi.list().then(({ data }) => data),
  })

  const invalidate = () => {
    client.invalidateQueries({ queryKey: ['admin-variants', product.id] })
    client.invalidateQueries({ queryKey: ['admin-products'] })
    client.invalidateQueries({ queryKey: ['products'] })
  }
  const save = useMutation({
    mutationFn: (payload) => editing
      ? productsApi.updateVariant(product.id, editing, payload)
      : productsApi.createVariant(product.id, payload),
    onSuccess: () => {
      toast.success(editing ? 'Variante actualizada' : 'Variante creada')
      setEditing(null)
      setForm(emptyForm)
      invalidate()
    },
    onError: (error) => toast.error(detail(error)),
  })
  const replenish = useMutation({
    mutationFn: (payload) => inventoryApi.replenish(payload),
    onSuccess: () => {
      toast.success('Stock actualizado')
      setStockTarget('')
      setStockQty('')
      invalidate()
    },
    onError: (error) => toast.error(detail(error)),
  })
  const toggle = useMutation({
    mutationFn: ({ id, active }) => productsApi.updateVariant(product.id, id, { active }),
    onSuccess: invalidate,
    onError: (error) => toast.error(detail(error)),
  })

  const options = Object.fromEntries(
    ['color', 'talla', 'presentacion']
      .filter((key) => form[key].trim())
      .map((key) => [key, form[key].trim()])
  )
  const handleEdit = (item) => {
    setEditing(item.id)
    setForm({
      label: item.label, sku: item.sku,
      cost_price: String(item.cost_price ?? ''),
      sale_price: String(item.sale_price),
      color: item.options?.color || '',
      talla: item.options?.talla || '',
      presentacion: item.options?.presentacion || '',
    })
  }
  return <div className="fixed inset-0 z-[60] bg-black/60 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Variantes del producto">
    <div className="bg-white rounded-xl w-full max-w-4xl max-h-[94vh] overflow-y-auto p-6 space-y-5">
      <div className="flex justify-between gap-4">
        <div><h2 className="font-bold text-xl">Variantes de {product.name}</h2>
          <p className="text-xs text-gray-500">Cada variante usa SKU, precio y existencias independientes.</p></div>
        <button className="btn-secondary" type="button" onClick={onClose}>Cerrar</button>
      </div>
      <form className="border rounded-xl p-4 space-y-3" onSubmit={(e) => {
        e.preventDefault()
        const payload = { label: form.label.trim(), options,
          cost_price: Number(form.cost_price), sale_price: Number(form.sale_price) }
        if (!editing) payload.sku = form.sku.trim()
        save.mutate(payload)
      }}>
        <h3 className="font-semibold">{editing ? 'Editar referencia' : 'Nueva referencia'}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs space-y-1">Nombre / etiqueta *
            <input className="input w-full" required maxLength={120} value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Azul / 100 ml" /></label>
          <label className="text-xs space-y-1">SKU propio *
            <input className="input w-full" required={!editing} disabled={!!editing} maxLength={100} value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="GOR-AZUL-001" /></label>
          <label className="text-xs space-y-1">Color
            <input className="input w-full" value={form.color} maxLength={80}
              onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Azul" /></label>
          <label className="text-xs space-y-1">Talla
            <input className="input w-full" value={form.talla} maxLength={80}
              onChange={(e) => setForm({ ...form, talla: e.target.value })} placeholder="M" /></label>
          <label className="text-xs space-y-1">Presentación
            <input className="input w-full" value={form.presentacion} maxLength={80}
              onChange={(e) => setForm({ ...form, presentacion: e.target.value })} placeholder="100 ml" /></label>
          <label className="text-xs space-y-1">Costo COP *
            <input className="input w-full" required type="number" min="0" step="0.01" value={form.cost_price}
              onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></label>
          <label className="text-xs space-y-1">Precio venta COP *
            <input className="input w-full" required type="number" min="0" step="0.01" value={form.sale_price}
              onChange={(e) => setForm({ ...form, sale_price: e.target.value })} /></label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={save.isPending}>{editing ? 'Guardar cambios' : 'Crear variante'}</button>
          {editing && <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setForm(emptyForm) }}>Cancelar edición</button>}
        </div>
      </form>
      <div className="space-y-3">
        <h3 className="font-semibold">Referencias y existencias</h3>
        {isLoading && <p className="text-sm text-gray-500">Cargando referencias...</p>}
        {variants.map((item) => <div key={item.id} className="border rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><strong>{item.label}</strong><p className="text-xs text-gray-500">SKU: {item.sku} · ID inventario: {item.id} · {item.active ? 'Activo' : 'Inactivo'}</p>
              <p className="text-sm">Precio: {asMoney(item.sale_price)} · Existencias: {item.total_stock}</p></div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" type="button" onClick={() => handleEdit(item)}>Editar</button>
              <button className="btn-secondary" type="button" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: item.id, active: !item.active })}>
                {item.active ? 'Desactivar' : 'Activar'}</button>
              {item.active && <button type="button" className="btn-primary" onClick={() => setStockTarget(String(item.id))}>Ingresar stock</button>}
            </div>
          </div>
          {stockTarget === String(item.id) && <form className="grid grid-cols-1 sm:grid-cols-3 gap-2" onSubmit={(e) => {
            e.preventDefault()
            replenish.mutate({ product_id: item.id, location_id: Number(stockLocation),
              qty: Number(stockQty), notes: `Reposición variante ${item.sku}` })
          }}>
            <select required className="input" value={stockLocation} onChange={(e) => setStockLocation(e.target.value)}>
              <option value="">Selecciona una sede</option>
              {locations.filter((loc) => loc.active).map((loc) => <option value={loc.id} key={loc.id}>{loc.name}</option>)}
            </select>
            <input required min="1" step="1" className="input" type="number" value={stockQty}
              onChange={(e) => setStockQty(e.target.value)} placeholder="Unidades a ingresar" />
            <button disabled={replenish.isPending || !stockLocation} className="btn-primary" type="submit">Registrar ingreso</button>
          </form>}
        </div>)}
        {!isLoading && variants.length === 0 && <p className="text-sm text-gray-500">Este producto todavía no tiene variantes. Su inventario actual se gestiona como referencia única.</p>}
      </div>
      <p className="text-xs text-gray-500">Importante: si el producto original aún tiene inventario, primero concilia sus unidades. No se convierten existencias existentes automáticamente.</p>
    </div>
  </div>
}
