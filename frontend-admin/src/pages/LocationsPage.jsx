import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, MapPin, Phone, Store, Globe } from 'lucide-react'
import { apiClient } from '../services/api'
import toast from 'react-hot-toast'

function LocationModal({ location, onClose }) {
    const qc = useQueryClient()
    const isEdit = !!location?.id

    const [form, setForm] = useState({
        name:    location?.name    || '',
        type:    location?.type    || 'physical',
        address: location?.address || '',
        phone:   location?.phone   || '',
    })

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

    const mutation = useMutation({
        mutationFn: (data) => isEdit
        ? apiClient.put(`/locations/${location.id}`, data).then(r => r.data)
        : apiClient.post('/locations', data).then(r => r.data),
        onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['locations-admin'] })
        toast.success(isEdit ? 'Punto actualizado' : 'Punto creado')
        onClose()
        },
        onError: (e) => toast.error(e.response?.data?.detail || 'Error al guardar'),
    })

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-lg">
                {isEdit ? 'Editar punto' : 'Nuevo punto'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>

            <form onSubmit={e => { e.preventDefault(); mutation.mutate(form) }} className="p-6 space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                className="input" required value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Punto Centro, Tienda Norte..."
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                <select
                className="input" value={form.type}
                onChange={e => set('type', e.target.value)}
                disabled={isEdit}
                >
                <option value="physical">Punto físico</option>
                <option value="web">Tienda web</option>
                </select>
                {isEdit && <p className="text-xs text-gray-400 mt-1">El tipo no se puede cambiar</p>}
            </div>

            {form.type === 'physical' && (
                <>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                    <input
                    className="input" value={form.address}
                    onChange={e => set('address', e.target.value)}
                    placeholder="Cra 53 #82-15, Barranquilla"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                    <input
                    className="input" value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="+57 300 000 0000"
                    />
                </div>
                </>
            )}

            <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
                {mutation.isPending ? 'Guardando...' : (isEdit ? 'Guardar' : 'Crear punto')}
                </button>
            </div>
            </form>
        </div>
        </div>
    )
}

export default function LocationsPage() {
    const qc = useQueryClient()
    const [modal, setModal] = useState(null)

    const { data: locations = [], isLoading } = useQuery({
        queryKey: ['locations-admin'],
        queryFn: () => apiClient.get('/locations').then(r => r.data),
    })

    const toggleMutation = useMutation({
        mutationFn: ({ id, active }) => apiClient.put(`/locations/${id}`, { active: !active }),
        onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['locations-admin'] })
        toast.success('Punto actualizado')
        },
        onError: (e) => toast.error(e.response?.data?.detail || 'Error'),
    })

    const physical = locations.filter(l => l.type === 'physical' || l.type === 'PHYSICAL')
    const web      = locations.filter(l => l.type === 'web'      || l.type === 'WEB')

    return (
        <div>
        <div className="flex items-center justify-between mb-6">
            <div>
            <h1 className="text-2xl font-bold text-gray-900">Puntos físicos</h1>
            <p className="text-sm text-gray-500 mt-1">
                {physical.length} puntos físicos · {web.length} tienda web
            </p>
            </div>
            <button onClick={() => setModal('create')} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nuevo punto
            </button>
        </div>

        {/* Tienda web */}
        {web.length > 0 && (
            <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Canal digital</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {web.map(loc => (
                <div key={loc.id} className="card flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Globe size={22} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{loc.name}</p>
                    <p className="text-xs text-blue-500 font-medium">Tienda web</p>
                    </div>
                    <span className="badge-green text-xs">Activo</span>
                </div>
                ))}
            </div>
            </div>
        )}

        {/* Puntos físicos */}
        <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Puntos físicos</p>
            {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card animate-pulse">
                    <div className="h-5 bg-gray-100 rounded w-1/2 mb-3" />
                    <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                    <div className="h-4 bg-gray-100 rounded w-1/2" />
                </div>
                ))}
            </div>
            ) : physical.length === 0 ? (
            <div className="card text-center py-12">
                <MapPin size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 mb-4">No hay puntos físicos registrados</p>
                <button onClick={() => setModal('create')} className="btn-primary inline-flex items-center gap-2">
                <Plus size={16} /> Crear primer punto
                </button>
            </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {physical.map(loc => (
                <div
                    key={loc.id}
                    className={`card flex flex-col gap-3 transition-opacity ${!loc.active ? 'opacity-50' : ''}`}
                >
                    {/* Header */}
                    <div className="flex items-start gap-3">
                    <div className="w-11 h-11 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Store size={20} className="text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 leading-tight">{loc.name}</p>
                        <span className={loc.active ? 'badge-green text-xs' : 'badge-gray text-xs'}>
                        {loc.active ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>
                    </div>

                    {/* Info */}
                    <div className="space-y-1.5">
                    {loc.address && (
                        <div className="flex items-start gap-2 text-sm text-gray-500">
                        <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{loc.address}</span>
                        </div>
                    )}
                    {loc.phone && (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Phone size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{loc.phone}</span>
                        </div>
                    )}
                    {!loc.address && !loc.phone && (
                        <p className="text-xs text-gray-300 italic">Sin información de contacto</p>
                    )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <button
                        onClick={() => toggleMutation.mutate({ id: loc.id, active: loc.active })}
                        className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                        loc.active ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        {loc.active
                        ? <><ToggleRight size={16} className="text-green-500" /> Activo</>
                        : <><ToggleLeft size={16} /> Inactivo</>
                        }
                    </button>
                    <button
                        onClick={() => setModal(loc)}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        title="Editar"
                    >
                        <Pencil size={14} />
                    </button>
                    </div>
                </div>
                ))}
            </div>
            )}
        </div>

        {modal && (
            <LocationModal
            location={modal === 'create' ? null : modal}
            onClose={() => setModal(null)}
            />
        )}
        </div>
    )
}
