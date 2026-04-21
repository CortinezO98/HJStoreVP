import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Plus,
    Search,
    MapPin,
    Globe,
    Store,
    Pencil,
    CheckCircle,
    XCircle,
    Warehouse,
} from 'lucide-react'
import { locationsApi } from '../services/api'
import toast from 'react-hot-toast'

function typeLabel(type) {
    switch (String(type || '').toLowerCase()) {
        case 'web':
        return 'Tienda web'
        case 'physical':
        return 'Punto físico'
        default:
        return type || '—'
    }
}

function typeBadge(type) {
    switch (String(type || '').toLowerCase()) {
        case 'web':
        return 'bg-brand-100 text-brand-700'
        case 'physical':
        return 'bg-blue-100 text-blue-700'
        default:
        return 'bg-gray-100 text-gray-700'
    }
}

function statusBadge(active) {
    return active
        ? 'bg-green-100 text-green-700'
        : 'bg-red-100 text-red-700'
}

function LocationFormModal({ locationItem, onClose }) {
    const isEdit = !!locationItem
    const queryClient = useQueryClient()

    const [form, setForm] = useState({
        name: locationItem?.name || '',
        type: locationItem?.type || 'physical',
        address: locationItem?.address || '',
        city: locationItem?.city || '',
        department: locationItem?.department || '',
        phone: locationItem?.phone || '',
        active: locationItem?.active ?? true,
    })

    const mutation = useMutation({
        mutationFn: async () => {
        if (!form.name || !form.type) {
            throw new Error('Completa los campos obligatorios')
        }

        const payload = {
            name: form.name,
            type: form.type,
            address: form.address || null,
            city: form.city || null,
            department: form.department || null,
            phone: form.phone || null,
            active: Boolean(form.active),
        }

        if (isEdit) {
            const { data } = await locationsApi.update(locationItem.id, payload)
            return data
        }

        const { data } = await locationsApi.create(payload)
        return data
        },
        onSuccess: () => {
        toast.success(isEdit ? 'Ubicación actualizada' : 'Ubicación creada')
        queryClient.invalidateQueries({ queryKey: ['admin-locations'] })
        onClose()
        },
        onError: (error) => {
        toast.error(error?.response?.data?.detail || error.message || 'Error guardando ubicación')
        },
    })

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
                <h3 className="text-lg font-bold text-gray-900">
                {isEdit ? 'Editar ubicación' : 'Nueva ubicación'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                Gestiona puntos físicos y tienda web
                </p>
            </div>

            <button
                onClick={onClose}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
                Cerrar
            </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Nombre *</label>
                <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Punto Centro / Tienda Web"
                />
            </div>

            <div>
                <label className="block text-sm text-gray-600 mb-1">Tipo *</label>
                <select
                className="input"
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                >
                <option value="physical">Punto físico</option>
                <option value="web">Tienda web</option>
                </select>
            </div>

            <div>
                <label className="block text-sm text-gray-600 mb-1">Teléfono</label>
                <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="3001234567"
                />
            </div>

            <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Dirección</label>
                <input
                className="input"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="Calle 90 # 49C - 20"
                />
            </div>

            <div>
                <label className="block text-sm text-gray-600 mb-1">Ciudad</label>
                <input
                className="input"
                value={form.city}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                placeholder="Barranquilla"
                />
            </div>

            <div>
                <label className="block text-sm text-gray-600 mb-1">Departamento</label>
                <input
                className="input"
                value={form.department}
                onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                placeholder="Atlántico"
                />
            </div>

            <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                />
                Ubicación activa
                </label>
            </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
            <button onClick={onClose} className="btn-secondary">
                Cancelar
            </button>
            <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="btn-primary flex items-center gap-2"
            >
                {mutation.isPending ? 'Guardando...' : <><CheckCircle size={16} /> Guardar ubicación</>}
            </button>
            </div>
        </div>
        </div>
    )
}

export default function LocationsPage() {
    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [selectedLocation, setSelectedLocation] = useState(null)
    const [showCreate, setShowCreate] = useState(false)

    const { data: locations = [], isLoading } = useQuery({
        queryKey: ['admin-locations'],
        queryFn: () => locationsApi.list().then((r) => r.data),
    })

    const filteredLocations = useMemo(() => {
        return locations.filter((loc) => {
        const term = search.trim().toLowerCase()
        const matchesSearch = !term
            ? true
            : `${loc.name || ''} ${loc.address || ''} ${loc.city || ''} ${loc.department || ''}`
                .toLowerCase()
                .includes(term)

        const matchesType = typeFilter ? String(loc.type) === String(typeFilter) : true

        const matchesStatus =
            statusFilter === ''
            ? true
            : statusFilter === 'active'
            ? Boolean(loc.active)
            : !Boolean(loc.active)

        return matchesSearch && matchesType && matchesStatus
        })
    }, [locations, search, typeFilter, statusFilter])

    const stats = useMemo(() => {
        return {
        total: locations.length,
        physical: locations.filter((l) => String(l.type).toLowerCase() === 'physical').length,
        web: locations.filter((l) => String(l.type).toLowerCase() === 'web').length,
        active: locations.filter((l) => l.active).length,
        }
    }, [locations])

    return (
        <div className="space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div>
            <h1 className="text-2xl font-bold text-gray-900">Ubicaciones</h1>
            <p className="text-sm text-gray-500 mt-1">
                Administra tienda web y puntos físicos conectados
            </p>
            </div>

            <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2"
            >
            <Plus size={16} />
            Nueva ubicación
            </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card">
            <p className="text-sm text-gray-500">Total ubicaciones</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{stats.total}</p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Puntos físicos</p>
            <p className="text-2xl font-black text-blue-700 mt-2">{stats.physical}</p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Tienda web</p>
            <p className="text-2xl font-black text-brand-700 mt-2">{stats.web}</p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Activas</p>
            <p className="text-2xl font-black text-green-700 mt-2">{stats.active}</p>
            </div>
        </div>

        {/* Filtros */}
        <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                className="input pl-9"
                placeholder="Buscar por nombre, dirección o ciudad..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <select
                className="input"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
            >
                <option value="">Todos los tipos</option>
                <option value="physical">Punto físico</option>
                <option value="web">Tienda web</option>
            </select>

            <select
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
            >
                <option value="">Todos los estados</option>
                <option value="active">Activas</option>
                <option value="inactive">Inactivas</option>
            </select>
            </div>
        </div>

        {/* Tabla */}
        <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Listado de ubicaciones</h2>
            <p className="text-xs text-gray-500 mt-1">
                {filteredLocations.length} ubicaciones encontradas
            </p>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Ubicación</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Tipo</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Dirección</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Contacto</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Estado</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Acción</th>
                </tr>
                </thead>

                <tbody>
                {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                        {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                        ))}
                    </tr>
                    ))
                ) : filteredLocations.length === 0 ? (
                    <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                        <Warehouse size={40} className="mx-auto mb-3 text-gray-200" />
                        <p className="text-gray-400 text-sm">No hay ubicaciones para este filtro</p>
                    </td>
                    </tr>
                ) : (
                    filteredLocations.map((loc) => (
                    <tr
                        key={loc.id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                        <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                            {String(loc.type).toLowerCase() === 'web' ? (
                                <Globe size={18} className="text-brand-600" />
                            ) : (
                                <Store size={18} className="text-blue-600" />
                            )}
                            </div>

                            <div className="min-w-0">
                            <p className="font-semibold text-gray-900 line-clamp-1">
                                {loc.name}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                ID: {loc.id}
                            </p>
                            </div>
                        </div>
                        </td>

                        <td className="px-4 py-3 text-center">
                        <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${typeBadge(loc.type)}`}
                        >
                            {String(loc.type).toLowerCase() === 'web' ? (
                            <Globe size={12} />
                            ) : (
                            <MapPin size={12} />
                            )}
                            {typeLabel(loc.type)}
                        </span>
                        </td>

                        <td className="px-4 py-3">
                        <div className="min-w-0">
                            <p className="text-gray-900 text-sm line-clamp-1">
                            {loc.address || 'Sin dirección'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                            {[loc.city, loc.department].filter(Boolean).join(', ') || 'Sin ciudad'}
                            </p>
                        </div>
                        </td>

                        <td className="px-4 py-3 text-gray-700">
                        {loc.phone || 'Sin teléfono'}
                        </td>

                        <td className="px-4 py-3 text-center">
                        <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge(loc.active)}`}
                        >
                            {loc.active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                            {loc.active ? 'Activa' : 'Inactiva'}
                        </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                        <button
                            onClick={() => setSelectedLocation(loc)}
                            className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 text-xs font-semibold"
                        >
                            <Pencil size={13} />
                            Editar
                        </button>
                        </td>
                    </tr>
                    ))
                )}
                </tbody>
            </table>
            </div>
        </div>

        {showCreate && (
            <LocationFormModal onClose={() => setShowCreate(false)} />
        )}

        {selectedLocation && (
            <LocationFormModal
            locationItem={selectedLocation}
            onClose={() => setSelectedLocation(null)}
            />
        )}
        </div>
    )
}