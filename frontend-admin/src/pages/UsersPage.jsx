import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, Shield, MapPin, User as UserIcon } from 'lucide-react'
import { apiClient } from '../services/api'
import { useAuthStore } from '../store'
import toast from 'react-hot-toast'

const ROLE_LABELS = {
    super_admin: { label: 'Super Admin', color: 'badge-red' },
    admin:       { label: 'Admin',       color: 'badge-blue' },
    seller:      { label: 'Vendedor',    color: 'badge-green' },
    customer:    { label: 'Cliente',     color: 'badge-gray' },
    }

    function UserModal({ user, locations, onClose }) {
    const qc = useQueryClient()
    const { user: currentUser } = useAuthStore()
    const isEdit = !!user?.id
    const isSuperAdmin = currentUser?.role === 'super_admin'

    const [form, setForm] = useState({
        full_name:   user?.full_name   || '',
        email:       user?.email       || '',
        password:    '',
        role:        user?.role        || 'seller',
        phone:       user?.phone       || '',
        location_id: user?.location_id || '',
        active:      user?.active ?? true,
    })

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

    const mutation = useMutation({
        mutationFn: (data) => isEdit
        ? apiClient.put(`/users/${user.id}`, data).then(r => r.data)
        : apiClient.post('/users', data).then(r => r.data),
        onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['users'] })
        toast.success(isEdit ? 'Usuario actualizado' : 'Usuario creado')
        onClose()
        },
        onError: (e) => toast.error(e.response?.data?.detail || 'Error al guardar'),
    })

    const handleSubmit = (e) => {
        e.preventDefault()
        const payload = {
        full_name: form.full_name,
        email: form.email,
        role: form.role,
        phone: form.phone || undefined,
        location_id: form.location_id ? parseInt(form.location_id) : undefined,
        }
        if (!isEdit) payload.password = form.password
        else if (form.password) payload.password = form.password
        if (isEdit) payload.active = form.active
        mutation.mutate(payload)
    }

    const needsLocation = form.role === 'seller'

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-lg">
                {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                <input
                className="input" required value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                placeholder="Juan Pérez"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico *</label>
                <input
                type="email" className="input" required value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="correo@hjstorevp.com"
                disabled={isEdit}
                />
                {isEdit && <p className="text-xs text-gray-400 mt-1">El correo no se puede cambiar</p>}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                {isEdit ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
                </label>
                <input
                type="password" className="input"
                required={!isEdit}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={isEdit ? 'Dejar vacío para no cambiar' : 'Mínimo 8 caracteres'}
                minLength={form.password ? 8 : undefined}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
                <select
                    className="input" value={form.role}
                    onChange={e => { set('role', e.target.value); if (e.target.value !== 'seller') set('location_id', '') }}
                >
                    <option value="seller">Vendedor</option>
                    <option value="admin">Admin</option>
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                    <option value="customer">Cliente</option>
                </select>
                </div>
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input
                    className="input" value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="+57 300 000 0000"
                />
                </div>
            </div>

            {needsLocation && (
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Punto físico asignado *
                </label>
                <select
                    className="input" required={needsLocation}
                    value={form.location_id}
                    onChange={e => set('location_id', e.target.value)}
                >
                    <option value="">Selecciona un punto...</option>
                    {locations.filter(l => l.type === 'physical').map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                </select>
                </div>
            )}

            {isEdit && (
                <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox" checked={form.active}
                    onChange={e => set('active', e.target.checked)}
                    className="rounded"
                />
                <span className="text-sm font-medium text-gray-700">Usuario activo</span>
                </label>
            )}

            <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
                {mutation.isPending ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear usuario')}
                </button>
            </div>
            </form>
        </div>
        </div>
    )
}

export default function UsersPage() {
    const qc = useQueryClient()
    const [modal, setModal] = useState(null)
    const [filterRole, setFilterRole] = useState('')
    const { user: currentUser } = useAuthStore()

    const { data: users = [], isLoading } = useQuery({
        queryKey: ['users', filterRole],
        queryFn: () => apiClient.get('/users', {
        params: filterRole ? { role: filterRole } : {}
        }).then(r => r.data),
    })

    const { data: locations = [] } = useQuery({
        queryKey: ['locations'],
        queryFn: () => apiClient.get('/locations').then(r => r.data),
    })

    const toggleMutation = useMutation({
        mutationFn: ({ id, active }) => apiClient.put(`/users/${id}`, { active: !active }),
        onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['users'] })
        toast.success('Usuario actualizado')
        },
        onError: (e) => toast.error(e.response?.data?.detail || 'Error'),
    })

    return (
        <div>
        <div className="flex items-center justify-between mb-6">
            <div>
            <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
            <p className="text-sm text-gray-500 mt-1">{users.length} usuarios registrados</p>
            </div>
            <button onClick={() => setModal('create')} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nuevo usuario
            </button>
        </div>

        {/* Filtro por rol */}
        <div className="card mb-4 flex gap-2 flex-wrap">
            {[
            { value: '', label: 'Todos' },
            { value: 'super_admin', label: 'Super Admin' },
            { value: 'admin', label: 'Admin' },
            { value: 'seller', label: 'Vendedores' },
            { value: 'customer', label: 'Clientes' },
            ].map(opt => (
            <button
                key={opt.value}
                onClick={() => setFilterRole(opt.value)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filterRole === opt.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
                {opt.label}
            </button>
            ))}
        </div>

        {/* Tabla */}
        <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Usuario</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Rol</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Punto físico</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Teléfono</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Estado</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Acciones</th>
                </tr>
                </thead>
                <tbody>
                {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                        {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                        ))}
                    </tr>
                    ))
                ) : users.map(u => {
                    const roleInfo = ROLE_LABELS[u.role] || { label: u.role, color: 'badge-gray' }
                    const isMe = u.id === currentUser?.id

                    return (
                    <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${!u.active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-brand-700 font-bold text-xs">
                                {u.full_name?.[0]?.toUpperCase() || '?'}
                            </span>
                            </div>
                            <div>
                            <p className="font-medium text-gray-900 text-sm">
                                {u.full_name}
                                {isMe && <span className="ml-2 text-xs text-brand-500 font-normal">(tú)</span>}
                            </p>
                            <p className="text-xs text-gray-400">{u.email}</p>
                            </div>
                        </div>
                        </td>
                        <td className="px-4 py-3">
                        <span className={roleInfo.color}>{roleInfo.label}</span>
                        </td>
                        <td className="px-4 py-3">
                        {u.location_name ? (
                            <div className="flex items-center gap-1.5 text-gray-600">
                            <MapPin size={13} className="text-brand-500" />
                            <span className="text-xs">{u.location_name}</span>
                            </div>
                        ) : (
                            <span className="text-gray-300 text-xs">—</span>
                        )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                        {u.phone || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                        <button
                            onClick={() => !isMe && toggleMutation.mutate({ id: u.id, active: u.active })}
                            disabled={isMe}
                            className={`flex items-center gap-1 mx-auto text-xs font-medium ${
                            isMe ? 'cursor-not-allowed opacity-40' :
                            u.active ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {u.active
                            ? <><ToggleRight size={18} className="text-green-500" /> Activo</>
                            : <><ToggleLeft size={18} /> Inactivo</>
                            }
                        </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                        <button
                            onClick={() => setModal(u)}
                            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                            title="Editar usuario"
                        >
                            <Pencil size={15} />
                        </button>
                        </td>
                    </tr>
                    )
                })}
                </tbody>
            </table>
            </div>
        </div>

        {modal && (
            <UserModal
            user={modal === 'create' ? null : modal}
            locations={locations}
            onClose={() => setModal(null)}
            />
        )}
        </div>
    )
}
