import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, Tag, Search, Layers, CheckCircle, XCircle } from 'lucide-react'
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
        <div className="admin-catalog-modal-backdrop" role="presentation">
        <div className="admin-catalog-modal admin-category-dialog" role="dialog" aria-modal="true" aria-label={isEdit ? "Editar categoría" : "Nueva categoría"}>
            <div className="admin-catalog-modal-header">
            <h2 className="fw-bold fs-5 mb-0">
                {isEdit ? 'Editar' : 'Nueva'} categoría
            </h2>
            <button type="button" onClick={onClose} className="btn-close" aria-label="Cerrar editor de categoría" />
            </div>

            <form onSubmit={e => { e.preventDefault(); mutation.mutate(form) }} className="admin-category-form">
            <div>
                <label htmlFor="category-name" className="form-label">Nombre de categoría *</label>
                <input
                id="category-name" className="form-control" required maxLength={100} value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Gorras, Perfumes, Relojes..."
                />
            </div>

            <div>
                <label htmlFor="category-description" className="form-label">Descripción</label>
                <textarea
                id="category-description" className="form-control" rows={3}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Descripción breve de la categoría"
                />
            </div>

            <div>
                <label htmlFor="category-order" className="form-label">Orden de aparición</label>
                <input
                id="category-order" type="number" className="form-control" min={0}
                value={form.sort_order}
                onChange={e => set('sort_order', parseInt(e.target.value) || 0)}
                />
                <p className="form-text">Las categorías con números menores se muestran primero.</p>
            </div>

            <div className="d-flex flex-wrap gap-2 justify-content-end pt-3 border-top">
                <button type="button" onClick={onClose} className="btn btn-outline-secondary">Cancelar</button>
                <button type="submit" disabled={mutation.isPending} className="btn btn-primary">
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
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')

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
    const activeCategories = categories.filter(c => c.active).length
    const visibleCategories = useMemo(() => categories.filter(cat => {
      const matchSearch = `${cat.name} ${cat.slug} ${cat.description || ''}`.toLocaleLowerCase('es')
        .includes(search.trim().toLocaleLowerCase('es'))
      const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? cat.active : !cat.active)
      return matchSearch && matchStatus
    }).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)), [categories, search, statusFilter])

    return (
        <div>
        <header className="admin-page-intro">
            <div>
              <p className="admin-page-kicker">Organización del catálogo</p>
              <h1 className="admin-page-heading">Categorías</h1>
              <p className="admin-page-description">Agrupa tus productos y organiza cómo aparecen en la tienda.</p>
            </div>
            <button type="button" onClick={() => setModal('create')} className="btn btn-primary d-inline-flex align-items-center gap-2">
              <Plus size={16} /> Nueva categoría
            </button>
        </header>

        <div className="row g-3 mb-4">
          {[
            {label: 'Categorías registradas', value: categories.length, icon: Layers},
            {label: 'Categorías activas', value: activeCategories, icon: CheckCircle},
            {label: 'Productos relacionados', value: totalProducts, icon: Tag},
          ].map(({label, value, icon: Icon}) => <div key={label} className="col-12 col-sm-4">
            <div className="admin-category-stat">
              <span className="admin-category-stat-icon"><Icon size={18}/></span>
              <div><span className="small text-secondary d-block">{label}</span>
                <strong className="fs-4">{value}</strong></div>
            </div>
          </div>)}
        </div>

        <div className="admin-category-filterbar">
          <div className="admin-category-search">
            <Search size={17} aria-hidden="true"/>
            <input className="form-control" type="search" aria-label="Buscar categoría"
              placeholder="Buscar por nombre o descripción…" value={search}
              onChange={e => setSearch(e.target.value)}/>
          </div>
          <select className="form-select" aria-label="Filtrar por estado"
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Todas las categorías</option>
            <option value="active">Solo activas</option>
            <option value="inactive">Solo inactivas</option>
          </select>
          {(search || statusFilter !== 'all') && <button type="button" className="btn btn-outline-secondary"
            onClick={() => { setSearch(''); setStatusFilter('all') }}>Limpiar filtros</button>}
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
        ) : visibleCategories.length === 0 ? (
          <div className="card text-center py-10">
            <Search size={35} className="text-gray-300 mx-auto mb-3"/>
            <p className="text-gray-500">No encontramos categorías con estos filtros.</p>
            <button type="button" className="btn btn-outline-secondary btn-sm mt-3"
              onClick={() => { setSearch(''); setStatusFilter('all') }}>Mostrar todas</button>
          </div>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleCategories.map((cat, idx) => (
                <div
                key={cat.id}
                className={`admin-category-card ${!cat.active ? 'admin-category-card-inactive' : ''}`}
                >
                {/* Header */}
                <div className="flex items-center gap-3">
                    <span className="admin-category-emoji" aria-hidden="true">{EMOJIS[idx % EMOJIS.length]}</span>
                    <div className="flex-1 min-w-0">
                    <p className="fw-bold text-gray-900 truncate">{cat.name}</p>
                    <p className="text-xs text-gray-400 font-mono">/{cat.slug}</p>
                    </div>
                </div>

                {/* Descripción */}
                {cat.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">{cat.description}</p>
                )}

                {/* Stats */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 mt-auto">
                    <div className="flex items-center gap-3">
                    <span className={`badge-${cat.product_count > 0 ? 'green' : 'gray'} text-xs`}>
                        {cat.product_count} productos
                    </span>
                    <span className="text-xs text-gray-400">Orden: {cat.sort_order}</span>
                    </div>

                    <div className="flex items-center gap-1">
                    <button type="button" aria-label={`Editar categoría ${cat.name}`}
                        onClick={() => setModal(cat)}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        title="Editar"
                    >
                        <Pencil size={14} />
                    </button>
                    <button type="button" disabled={toggleMutation.isPending}
                        aria-label={`${cat.active ? "Desactivar" : "Activar"} categoría ${cat.name}`}
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
