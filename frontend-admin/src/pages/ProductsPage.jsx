import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, Search } from 'lucide-react'
import { productsApi } from '../services/api'
import toast from 'react-hot-toast'

function formatCOP(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

function ProductModal({ product, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!product?.id

  const [form, setForm] = useState({
    name:            product?.name            || '',
    sku:             product?.sku             || '',
    description:     product?.description     || '',
    cost_price:      product?.cost_price      || '',
    margin_pct:      product?.margin_pct      || '',
    stock_min_alert: product?.stock_min_alert || 5,
    featured:        product?.featured        || false,
  })

  const salePrice = form.cost_price && form.margin_pct
    ? (parseFloat(form.cost_price) * (1 + parseFloat(form.margin_pct) / 100)).toFixed(0)
    : null

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? productsApi.update(product.id, data)
      : productsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success(isEdit ? 'Producto actualizado' : 'Producto creado')
      onClose()
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al guardar'),
  })

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate({
      ...form,
      cost_price: parseFloat(form.cost_price),
      margin_pct: parseFloat(form.margin_pct),
      stock_min_alert: parseInt(form.stock_min_alert),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-lg">{isEdit ? 'Editar' : 'Nuevo'} producto</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre del producto" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label>
              <input className="input font-mono" required value={form.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} placeholder="GOR-001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock mínimo</label>
              <input type="number" className="input" min={0} value={form.stock_min_alert} onChange={(e) => set('stock_min_alert', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio de costo (COP) *</label>
              <input type="number" className="input" required min={0} value={form.cost_price} onChange={(e) => set('cost_price', e.target.value)} placeholder="50000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">% de ganancia *</label>
              <input type="number" className="input" required min={0} max={999} value={form.margin_pct} onChange={(e) => set('margin_pct', e.target.value)} placeholder="50" />
            </div>
          </div>

          {/* Preview precio de venta */}
          {salePrice && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-green-700 font-medium">Precio de venta calculado</span>
              <span className="text-lg font-black text-green-800">{formatCOP(salePrice)}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Descripción del producto..." />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} className="rounded" />
            <span className="text-sm font-medium text-gray-700">Producto destacado</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear producto')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProductsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // null | 'create' | product object

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', 'admin', search],
    queryFn: () => productsApi.list({ search: search || undefined, per_page: 100 }).then((r) => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) => productsApi.update(id, { active: !active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('Producto actualizado')
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-sm text-gray-500 mt-1">{products?.length || 0} productos en catálogo</p>
        </div>
        <button onClick={() => setModal('create')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

      {/* Buscar */}
      <div className="card mb-4">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Producto</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">SKU</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Costo</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Margen</th>
                <th className="text-right px-4 py-3 text-gray-500 font-semibold">Precio venta</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Estado</th>
                <th className="text-center px-4 py-3 text-gray-500 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : products?.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.name}</div>
                    {p.featured && <span className="badge-blue text-[10px] mt-0.5">Destacado</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{p.sku}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCOP(p.cost_price || 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="badge-green">{p.margin_pct}%</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-brand-700">{formatCOP(p.sale_price)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleMutation.mutate({ id: p.id, active: p.active })}
                      className={`flex items-center gap-1 mx-auto text-xs font-medium ${p.active ? 'text-green-600' : 'text-gray-400'}`}
                    >
                      {p.active
                        ? <><ToggleRight size={18} className="text-green-500" /> Activo</>
                        : <><ToggleLeft size={18} /> Inactivo</>
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setModal(p)}
                      className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <ProductModal
          product={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
