import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Plus,
    Search,
    UserCog,
    ShieldCheck,
    Store,
    Mail,
    Phone,
    CheckCircle,
    XCircle,
    Pencil,
    X,
} from 'lucide-react'
import { usersApi, locationsApi } from '../services/api'
import { useAuthStore } from '../store'
import toast from 'react-hot-toast'

function roleLabel(role) {
    switch (role) {
        case 'super_admin':
        return 'Super Admin'
        case 'admin':
        return 'Administrador'
        case 'seller':
        return 'Vendedor'
        case 'customer':
        return 'Cliente'
        default:
        return role || '—'
    }
}

function roleBadge(role) {
    switch (role) {
        case 'super_admin':
        return 'bg-purple-100 text-purple-700'
        case 'admin':
        return 'bg-brand-100 text-brand-700'
        case 'seller':
        return 'bg-blue-100 text-blue-700'
        case 'customer':
        return 'bg-gray-100 text-gray-700'
        default:
        return 'bg-gray-100 text-gray-700'
    }
}

function statusBadge(active) {
    return active
        ? 'bg-green-100 text-green-700'
        : 'bg-red-100 text-red-700'
    }

    function UserFormModal({ userItem, locations, onClose }) {
    const isEdit = !!userItem
    const queryClient = useQueryClient()

    const [form, setForm] = useState({
        full_name: userItem?.full_name || '',
        email: userItem?.email || '',
        phone: userItem?.phone || '',
        password: '',
        role: userItem?.role || 'seller',
        location_id: userItem?.location_id ? String(userItem.location_id) : '',
        active: userItem?.active ?? true,
    })

    const mutation = useMutation({
        mutationFn: async () => {
        if (!form.full_name || !form.email || !form.role) {
            throw new Error('Completa los campos obligatorios')
        }

        if (!isEdit && !form.password) {
            throw new Error('La contraseña es obligatoria al crear un usuario')
        }

        if (form.role === 'seller' && !form.location_id) {
            throw new Error('Debes asignar un punto físico al vendedor')
        }

        const payload = {
            full_name: form.full_name,
            email: form.email,
            phone: form.phone || null,
            role: form.role,
            location_id: form.role === 'seller' ? Number(form.location_id) : null,
            active: Boolean(form.active),
        }

        if (!isEdit || form.password) {
            payload.password = form.password
        }

        if (isEdit) {
            const { data } = await usersApi.update(userItem.id, payload)
            return data
        }

        const { data } = await usersApi.create(payload)
        return data
        },
        onSuccess: () => {
        toast.success(isEdit ? 'Usuario actualizado' : 'Usuario creado')
        queryClient.invalidateQueries({ queryKey: ['admin-users'] })
        onClose()
        },
        onError: (error) => {
        toast.error(error?.response?.data?.detail || error.message || 'Error guardando usuario')
        },
    })

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
                <h3 className="text-lg font-bold text-gray-900">
                {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                Administra accesos del panel y vendedores por punto físico
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
                <label className="block text-sm text-gray-600 mb-1">Nombre completo *</label>
                <input
                className="input"
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                placeholder="Ej: José Jorge Cortines Osorio"
                />
            </div>

            <div>
                <label className="block text-sm text-gray-600 mb-1">Correo *</label>
                <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="usuario@correo.com"
                />
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

            <div>
                <label className="block text-sm text-gray-600 mb-1">
                {isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña *'}
                </label>
                <input
                type="password"
                className="input"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder={isEdit ? 'Solo si deseas cambiarla' : 'Contraseña temporal'}
                />
            </div>

            <div>
                <label className="block text-sm text-gray-600 mb-1">Rol *</label>
                <select
                className="input"
                value={form.role}
                onChange={(e) =>
                    setForm((p) => ({
                    ...p,
                    role: e.target.value,
                    location_id: e.target.value === 'seller' ? p.location_id : '',
                    }))
                }
                >
                <option value="admin">Administrador</option>
                <option value="seller">Vendedor</option>
                </select>
            </div>

            {form.role === 'seller' && (
                <div className="md:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Punto físico *</label>
                <select
                    className="input"
                    value={form.location_id}
                    onChange={(e) => setForm((p) => ({ ...p, location_id: e.target.value }))}
                >
                    <option value="">Selecciona un punto</option>
                    {locations
                    .filter((loc) => String(loc.type).toLowerCase() === 'physical')
                    .map((loc) => (
                        <option key={loc.id} value={loc.id}>
                        {loc.name}
                        </option>
                    ))}
                </select>
                </div>
            )}

            <div className="md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                />
                Usuario activo
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
                {mutation.isPending ? 'Guardando...' : <><CheckCircle size={16} /> Guardar usuario</>}
            </button>
            </div>
        </div>
        </div>
    )
}

export default function UsersPage() {
    const { user } = useAuthStore()
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [selectedUser, setSelectedUser] = useState(null)
    const [showCreate, setShowCreate] = useState(false)

    const isSuperAdmin = user?.role === 'super_admin'
    const isAdmin = user?.role === 'admin' || isSuperAdmin

    const { data: users = [], isLoading } = useQuery({
        queryKey: ['admin-users'],
        queryFn: () => usersApi.list().then((r) => r.data),
        enabled: isAdmin,
    })

    const { data: locations = [] } = useQuery({
        queryKey: ['admin-user-locations'],
        queryFn: () => locationsApi.list().then((r) => r.data),
        enabled: isAdmin,
    })

    const locationMap = useMemo(() => {
        const map = new Map()
        locations.forEach((loc) => map.set(Number(loc.id), loc.name))
        return map
    }, [locations])

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
        const term = search.trim().toLowerCase()
        const matchesSearch = !term
            ? true
            : `${u.full_name || ''} ${u.email || ''} ${u.phone || ''}`
                .toLowerCase()
                .includes(term)

        const matchesRole = roleFilter ? String(u.role) === String(roleFilter) : true

        const matchesStatus =
            statusFilter === ''
            ? true
            : statusFilter === 'active'
            ? Boolean(u.active)
            : !Boolean(u.active)

        return matchesSearch && matchesRole && matchesStatus
        })
    }, [users, search, roleFilter, statusFilter])

    const stats = useMemo(() => {
        return {
        total: users.length,
        admins: users.filter((u) => u.role === 'admin' || u.role === 'super_admin').length,
        sellers: users.filter((u) => u.role === 'seller').length,
        active: users.filter((u) => u.active).length,
        }
    }, [users])

    if (!isAdmin) {
        return (
        <div className="card">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Usuarios</h1>
            <p className="text-sm text-gray-500">
            Este módulo está disponible solo para administradores.
            </p>
        </div>
        )
    }

    return (
        <div className="space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div>
            <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
            <p className="text-sm text-gray-500 mt-1">
                Administra administradores y vendedores de puntos físicos
            </p>
            </div>

            <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2"
            >
            <Plus size={16} />
            Nuevo usuario
            </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card">
            <p className="text-sm text-gray-500">Total usuarios</p>
            <p className="text-2xl font-black text-gray-900 mt-2">{stats.total}</p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Administradores</p>
            <p className="text-2xl font-black text-brand-700 mt-2">{stats.admins}</p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Vendedores</p>
            <p className="text-2xl font-black text-blue-700 mt-2">{stats.sellers}</p>
            </div>
            <div className="card">
            <p className="text-sm text-gray-500">Activos</p>
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
                placeholder="Buscar por nombre, correo o teléfono..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <select
                className="input"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
            >
                <option value="">Todos los roles</option>
                <option value="admin">Administrador</option>
                <option value="super_admin">Super Admin</option>
                <option value="seller">Vendedor</option>
                <option value="customer">Cliente</option>
            </select>

            <select
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
            >
                <option value="">Todos los estados</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
            </select>
            </div>
        </div>

        {/* Tabla */}
        <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Listado de usuarios</h2>
            <p className="text-xs text-gray-500 mt-1">
                {filteredUsers.length} usuarios encontrados
            </p>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Usuario</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Contacto</th>
                    <th className="text-center px-4 py-3 text-gray-500 font-semibold">Rol</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Punto físico</th>
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
                ) : filteredUsers.length === 0 ? (
                    <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                        <UserCog size={40} className="mx-auto mb-3 text-gray-200" />
                        <p className="text-gray-400 text-sm">No hay usuarios para este filtro</p>
                    </td>
                    </tr>
                ) : (
                    filteredUsers.map((u) => (
                    <tr
                        key={u.id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                        <td className="px-4 py-3">
                        <div className="min-w-0">
                            <p className="font-semibold text-gray-900 line-clamp-1">
                            {u.full_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">ID: {u.id}</p>
                        </div>
                        </td>

                        <td className="px-4 py-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-gray-700">
                            <Mail size={13} className="text-brand-600" />
                            <span className="text-xs">{u.email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-700">
                            <Phone size={13} className="text-brand-600" />
                            <span className="text-xs">{u.phone || 'Sin teléfono'}</span>
                            </div>
                        </div>
                        </td>

                        <td className="px-4 py-3 text-center">
                        <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${roleBadge(u.role)}`}
                        >
                            {u.role === 'seller' ? (
                            <Store size={12} />
                            ) : (
                            <ShieldCheck size={12} />
                            )}
                            {roleLabel(u.role)}
                        </span>
                        </td>

                        <td className="px-4 py-3 text-gray-700">
                        {u.role === 'seller'
                            ? locationMap.get(Number(u.location_id)) || 'Sin asignar'
                            : 'No aplica'}
                        </td>

                        <td className="px-4 py-3 text-center">
                        <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge(u.active)}`}
                        >
                            {u.active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                            {u.active ? 'Activo' : 'Inactivo'}
                        </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                        <button
                            onClick={() => setSelectedUser(u)}
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
            <UserFormModal
            locations={locations}
            onClose={() => setShowCreate(false)}
            />
        )}

        {selectedUser && (
            <UserFormModal
            userItem={selectedUser}
            locations={locations}
            onClose={() => setSelectedUser(null)}
            />
        )}
        </div>
    )
}