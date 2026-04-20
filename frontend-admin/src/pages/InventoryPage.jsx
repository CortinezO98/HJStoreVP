import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { AlertTriangle, ArrowRightLeft, Plus } from 'lucide-react'
import { inventoryApi } from '../services/api'
import toast from 'react-hot-toast'

function ReplenishModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ product_id: '', location_id: '', qty: '', notes: '' })
  const mutation = useMutation({
    mutationFn: (data) => inventoryApi.replenish(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      toast.success('Stock actualizado correctamente')
      onClose()
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al actualizar stock'),
  })
  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate({ ...form, product_id: parseInt(form.product_id), location_id: parseInt(form.location_id), qty: parseInt(form.qty) })
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Ingresar mercancía</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ID Producto *</label>
            <input type="number" className="input" required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} placeholder="Ej: 1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ID Ubicación *</label>
            <input type="number" className="input" required value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} placeholder="Ej: 2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad *</label>
            <input type="number" className="input" required min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="Ej: 20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Factura #, proveedor..." />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending ? 'Guardando...' : 'Ingresar stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function InventoryPage() {
  const [showReplenish, setShowReplenish] = useState(false)

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['inventory', 'low-stock'],
    queryFn: () => inventoryApi.lowStock().then((r) => r.data),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500 mt-1">Control de stock por punto físico</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowReplenish(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Ingresar mercancía
          </button>
        </div>
      </div>

      {/* Alertas */}
      {!isLoading && alerts?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-600" />
            <span className="font-semibold text-amber-800 text-sm">
              {alerts.length} productos con stock bajo o sin rotación
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {alerts.slice(0, 6).map((item) => (
              <div key={item.product_id} className="bg-white rounded-lg px-3 py-2 border border-amber-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 line-clamp-1">{item.product_name}</p>
                  <p className="text-xs text-gray-500 font-mono">{item.sku}</p>
                </div>
                <span className={`ml-2 flex-shrink-0 font-bold text-sm ${item.total_stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  {item.total_stock} uds
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="card">
        <div className="flex items-center gap-2 text-gray-500 mb-4">
          <ArrowRightLeft size={18} className="text-brand-600" />
          <span className="text-sm font-medium text-gray-700">
            Para ver el inventario detallado por producto o transferir entre puntos, usa las herramientas de la API o selecciona un producto desde la lista de productos.
          </span>
        </div>
        <div className="bg-brand-50 rounded-xl p-4 text-sm text-brand-700">
          <p className="font-semibold mb-1">Endpoints disponibles:</p>
          <ul className="space-y-1 font-mono text-xs">
            <li>GET /api/v1/inventory/product/{'{id}'} — stock por producto</li>
            <li>GET /api/v1/inventory/location/{'{id}'} — stock por punto</li>
            <li>POST /api/v1/inventory/replenish — ingresar mercancía</li>
            <li>POST /api/v1/inventory/transfer — transferir entre puntos</li>
            <li>GET /api/v1/inventory/alerts/low-stock — alertas</li>
          </ul>
        </div>
      </div>

      {showReplenish && <ReplenishModal onClose={() => setShowReplenish(false)} />}
    </div>
  )
}
