import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, Tag } from 'lucide-react'
import { apiClient } from '../services/api'
import toast from 'react-hot-toast'

const EMOJIS = ['🧢','🌸','⌚','👜','🎽','👟','💍','🕶️','🧣','🎒','💄','🛍️']

function CategoryModal({ category, onClose }) {
    const qc = useQueryClient()
    const isEdit = !!category?.id
    const [form, setForm] = useState({
        name:        category?.name        || '',
        description: category?.description || '',
        sort_order:  category?.sort_order  ?? 0,
    })

    const mutation = useMutation({
        mutationFn: (data) => isEdit
        ? apiClient.put(`/categories/${category.id}`, data).then(r => r.data)
        : apiClient.post('/categories', data).then(r => r.data),
        onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['categories'] })
        toast.success(isEdit ? 'Categoría actualizada' : 'Categoría creada')
        onClose()
        },
        onError: (e) => toast.error(e.response?.data?.detail || 'Error al guardar'),
    })

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-lg">
                {isEdit ? 'Editar' : 'Nueva'} categoría
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>

            <form onSubmit={e => { e.preventDefault(); mutation.mutate(form) }} className="p-6 space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                className="input" required value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Gorras, Perfumes, Relojes..."
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                className="input resize-none" rows={2}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Descripción breve de la categoría"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orden de aparición</label>
                <input
                type="number" className="input" min={0}
                value={form.sort_order}
                onChange={e => set('sort_order', parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-gray-400 mt-1">Número menor = aparece primero en la tienda</p>
            </div>

            <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
                {mutation.isPending ? 'Guardando...' : (isEdit ? 'Guardar' : 'Crear categoría')}
                </button>
            </div>
            </form>
        </div>
        </div>
    )
    }

    export default function CategoriesPage() {
    const qc = useQueryClient()
    const [modal, setModal] = useState(null)

    const { data: categories = [], isLoading } = useQuery({
        queryKey: ['categories'],
        queryFn: () => apiClient.get('/categories', { params: { include_inactive: true } }).then(r => r.data),
    })

    const toggleMutation = useMutation({
        mutationFn: (id) => apiClient.patch(`/categories/${id}/toggle`),
        onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['categories'] })
        toast.success('Categoría actualizada')
        },
    })

    const totalProducts = categories.reduce((acc, c) => acc + (c.product_count || 0), 0)

    return (
        <div>
        <div className="flex items-center justify-between mb-6">
            <div>
            <h1 className="text-2xl font-bold text-gray-900">Categorías</h1>
            <p className="text-sm text-gray-500 mt-1">
                {categories.length} categorías · {totalProducts} productos en total
            </p>
            </div>
            <button onClick={() => setModal('create')} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nueva categoría
            </button>
        </div>

        {/* Grid de categorías */}
        {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card animate-pulse">
                <div className="h-6 bg-gray-100 rounded w-1/2 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                </div>
            ))}
            </div>
        ) : categories.length === 0 ? (
            <div className="card text-center py-16">
            <Tag size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 mb-4">No hay categorías creadas</p>
            <button onClick={() => setModal('create')} className="btn-primary inline-flex items-center gap-2">
                <Plus size={16} /> Crear primera categoría
            </button>
            </div>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat, idx) => (
                <div
                key={cat.id}
                className={`card flex flex-col gap-3 transition-opacity ${!cat.active ? 'opacity-50' : ''}`}
                >
                {/* Header */}
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{EMOJIS[idx % EMOJIS.length]}</span>
                    <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{cat.name}</p>
                    <p className="text-xs text-gray-400 font-mono">/{cat.slug}</p>
                    </div>
                </div>

                {/* Descripción */}
                {cat.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">{cat.description}</p>
                )}

                {/* Stats */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                    <span className={`badge-${cat.product_count > 0 ? 'green' : 'gray'} text-xs`}>
                        {cat.product_count} productos
                    </span>
                    <span className="text-xs text-gray-400">Orden: {cat.sort_order}</span>
                    </div>

                    <div className="flex items-center gap-1">
                    <button
                        onClick={() => setModal(cat)}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        title="Editar"
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        onClick={() => toggleMutation.mutate(cat.id)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                        cat.active
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-gray-400 hover:bg-gray-50'
                        }`}
                    >
                        {cat.active
                        ? <><ToggleRight size={16} className="text-green-500" /> Activa</>
                        : <><ToggleLeft size={16} /> Inactiva</>
                        }
                    </button>
                    </div>
                </div>
                </div>
            ))}
            </div>
        )}

        {modal && (
            <CategoryModal
            category={modal === 'create' ? null : modal}
            onClose={() => setModal(null)}
            />
        )}
        </div>
    )
}
