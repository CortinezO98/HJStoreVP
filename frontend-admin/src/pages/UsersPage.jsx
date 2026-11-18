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
    ChevronLeft,
    ChevronRight,
    SlidersHorizontal,
    KeyRound,
    PauseCircle,
    PlayCircle,
    Trash2,
    Eye,
    EyeOff,
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

    function UserFormModal({ userItem, locations, onClose, isSuperAdmin, currentUserId }) {
    const isEdit = !!userItem
    const isSelf = isEdit && Number(userItem?.id) === Number(currentUserId)
    const lockedAdmin = isEdit && (!isSuperAdmin && ['admin', 'super_admin'].includes(userItem?.role) || userItem?.role === 'customer')
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

        if (!isEdit && form.password.length < 12) {
            throw new Error('La contraseña inicial debe tener al menos 12 caracteres')
        }

        if (form.role === 'seller' && !form.location_id) {
            throw new Error('Debes asignar un punto físico al vendedor')
        }

        const payload = {
            full_name: form.full_name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim() || null,
        }
        if (!isEdit) {
            payload.role = form.role
            payload.location_id = form.role === 'seller' ? Number(form.location_id) : null
            payload.password = form.password
        } else if (!isSelf && !lockedAdmin) {
            if (form.role !== userItem.role) payload.role = form.role
            if (form.role === 'seller' && Number(form.location_id) !== Number(userItem.location_id || 0)) {
                payload.location_id = Number(form.location_id)
            }
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
        <div className="admin-users-overlay">
        <div className="admin-users-modal" role="dialog" aria-modal="true" aria-label={isEdit ? "Editar usuario" : "Nuevo usuario"}>
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
                type="button" onClick={onClose}
                aria-label="Cerrar formulario de usuario"
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
                Cerrar
            </button>
            </div>

            <div className="admin-users-form-grid">
            <div className="md:col-span-2">
                <label htmlFor="user-full-name" className="form-label">Nombre completo *</label>
                <input
                id="user-full-name" className="form-control"
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                placeholder="Ej: José Jorge Cortines Osorio"
                />
            </div>

            <div>
                <label htmlFor="user-email" className="form-label">Correo *</label>
                <input
                type="email" id="user-email"
                className="form-control"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="usuario@correo.com"
                />
            </div>

            <div>
                <label htmlFor="user-phone" className="form-label">Teléfono</label>
                <input
                id="user-phone" className="form-control"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="3001234567"
                />
            </div>

            {!isEdit && <div>
                <label htmlFor="user-new-password" className="form-label">Contraseña inicial *</label>
                <input id="user-new-password" type="password" className="form-control"
                autoComplete="new-password" minLength={12}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Mínimo 12 caracteres"/>
            </div>}

            <div>
                <label htmlFor="user-role" className="form-label">Rol *</label>
                <select
                id="user-role" className="form-select"
                disabled={isSelf || lockedAdmin}
                value={form.role}
                onChange={(e) =>
                    setForm((p) => ({
                    ...p,
                    role: e.target.value,
                    location_id: e.target.value === 'seller' ? p.location_id : '',
                    }))
                }
                >
                {isSuperAdmin && <option value="admin">Administrador</option>}
                <option value="seller">Vendedor</option>
                {isEdit && userItem.role === "super_admin" && <option value="super_admin">Super Administrador</option>}
                {isEdit && userItem.role === "customer" && <option value="customer">Cliente</option>}
                </select>
            </div>

            {form.role === 'seller' && (
                <div className="md:col-span-2">
                <label htmlFor="user-location" className="form-label">Punto físico *</label>
                <select
                    id="user-location" className="form-select"
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

            {!isEdit && <div className="md:col-span-2">
                <p className="admin-users-hint">La cuenta se crea activa. Más adelante podrás pausarla, reactivarla o cambiar su contraseña desde el listado.</p>
            </div>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
            <button onClick={onClose} className="btn btn-outline-secondary">
                Cancelar
            </button>
            <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="btn btn-primary d-inline-flex align-items-center gap-2"
            >
                {mutation.isPending ? 'Guardando...' : <><CheckCircle size={16} /> Guardar usuario</>}
            </button>
            </div>
        </div>
        </div>
    )
}

function PasswordDialog({ target, onClose, onSuccess }) {
    const [password, setPassword] = useState('')
    const [confirmation, setConfirmation] = useState('')
    const [visible, setVisible] = useState(false)
    const mutation = useMutation({
        mutationFn: () => usersApi.resetPassword(target.id, password),
        onSuccess: () => {
            toast.success('Contraseña actualizada. Se revocaron las sesiones anteriores.')
            setPassword('')
            setConfirmation('')
            onSuccess()
            onClose()
        },
        onError: error => toast.error(error.response?.data?.detail || 'No se pudo cambiar la contraseña'),
    })
    const valid = password.length >= 12 && password === confirmation
    return <div className="admin-users-overlay">
        <div className="admin-users-modal admin-users-modal-small" role="dialog" aria-modal="true"
            aria-labelledby="user-password-title">
            <div className="admin-users-dialog-header">
                <h2 id="user-password-title" className="h5 fw-bold mb-1">Cambiar contraseña</h2>
                <p className="text-secondary small mb-0">{target.full_name} · {target.email}</p>
            </div>
            <form onSubmit={event => {event.preventDefault(); if(valid) mutation.mutate()}}>
                <div className="p-4 d-flex flex-column gap-3">
                    <div className="alert alert-info mb-0 small" role="note">
                        La nueva contraseña debe tener al menos 12 caracteres. Al guardarla, las sesiones anteriores dejarán de ser válidas.
                    </div>
                    <div>
                        <label htmlFor="reset-user-password" className="form-label">Nueva contraseña *</label>
                        <div className="input-group">
                            <input id="reset-user-password" className="form-control" autoComplete="new-password"
                                type={visible ? 'text' : 'password'} minLength={12} required
                                value={password} onChange={event => setPassword(event.target.value)}/>
                            <button type="button" className="btn btn-outline-secondary"
                                aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="reset-user-confirm" className="form-label">Confirmar contraseña *</label>
                        <input id="reset-user-confirm" type="password" autoComplete="new-password"
                            className="form-control" minLength={12} required
                            value={confirmation} onChange={event => setConfirmation(event.target.value)}/>
                        {confirmation && password !== confirmation && <p role="alert" className="text-danger small mt-2 mb-0">
                            Las contraseñas no coinciden.
                        </p>}
                    </div>
                </div>
                <div className="admin-users-dialog-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={onClose}
                        disabled={mutation.isPending}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={!valid || mutation.isPending}>
                        {mutation.isPending ? 'Guardando…' : 'Actualizar contraseña'}
                    </button>
                </div>
            </form>
        </div>
    </div>
}

function DeleteUserDialog({ target, onClose, onSuccess }) {
    const [confirmation, setConfirmation] = useState('')
    const mutation = useMutation({
        mutationFn: () => usersApi.delete(target.id),
        onSuccess: () => {
            toast.success('Usuario eliminado del panel; historial conservado.')
            onSuccess()
            onClose()
        },
        onError: error => toast.error(error.response?.data?.detail || 'No se pudo eliminar al usuario'),
    })
    return <div className="admin-users-overlay">
        <div className="admin-users-modal admin-users-modal-small" role="dialog" aria-modal="true"
            aria-labelledby="user-delete-title">
            <div className="admin-users-dialog-header">
                <h2 id="user-delete-title" className="h5 fw-bold mb-1 text-danger">Eliminar usuario</h2>
                <p className="text-secondary small mb-0">{target.full_name} · {target.email}</p>
            </div>
            <form onSubmit={event => {
                event.preventDefault()
                if (confirmation.trim() === target.email) mutation.mutate()
            }}>
                <div className="p-4">
                    <div className="alert alert-warning small">
                        Esta acción retira la cuenta del listado y bloquea su acceso. No se borran los pedidos,
                        movimientos de inventario ni registros históricos. No puede revertirse desde el panel.
                    </div>
                    <label htmlFor="delete-user-confirm" className="form-label">
                        Escribe <strong>{target.email}</strong> para confirmar
                    </label>
                    <input id="delete-user-confirm" className="form-control" required autoComplete="off"
                        value={confirmation} onChange={event => setConfirmation(event.target.value)}
                        placeholder="Correo exacto del usuario"/>
                </div>
                <div className="admin-users-dialog-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={onClose}
                        disabled={mutation.isPending}>Cancelar</button>
                    <button type="submit" className="btn btn-danger"
                        disabled={confirmation.trim() !== target.email || mutation.isPending}>
                        {mutation.isPending ? 'Eliminando…' : 'Confirmar eliminación'}
                    </button>
                </div>
            </form>
        </div>
    </div>
}

export default function UsersPage() {
    const { user } = useAuthStore()
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [selectedUser, setSelectedUser] = useState(null)
    const [showCreate, setShowCreate] = useState(false)
    const [passwordUser, setPasswordUser] = useState(null)
    const [deleteUser, setDeleteUser] = useState(null)
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(15)

    const isSuperAdmin = user?.role === 'super_admin'
    const currentUserId = user?.id ?? user?.user_id
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

    const qc = useQueryClient()
    const statusMutation = useMutation({
        mutationFn: ({ id, active }) => usersApi.setStatus(id, active),
        onSuccess: (_, { active }) => {
            toast.success(active ? 'Usuario reactivado' : 'Usuario pausado')
            qc.invalidateQueries({ queryKey: ['admin-users'] })
        },
        onError: error => toast.error(error.response?.data?.detail || 'No se pudo cambiar el estado'),
    })
    const canManage = target => Number(target.id) !== Number(currentUserId) &&
        (isSuperAdmin || !['super_admin', 'admin'].includes(target.role))
    const toggleStatus = target => {
        if (!canManage(target) || statusMutation.isPending) return
        const verb = target.active ? 'pausar' : 'reactivar'
        if (!window.confirm(`¿Deseas ${verb} a ${target.full_name}? ${target.active ? 'Se cerrará su acceso al panel de inmediato.' : 'Podrá volver a iniciar sesión.'}`)) return
        statusMutation.mutate({ id: target.id, active: !target.active })
    }

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

    const pageCount = Math.max(1, Math.ceil(filteredUsers.length / perPage))
    const currentPage = Math.min(page, pageCount)
    const pageUsers = filteredUsers.slice((currentPage-1)*perPage, currentPage*perPage)
    const clearFilters = () => {
        setSearch(''); setRoleFilter(''); setStatusFilter(''); setPage(1)
    }
    const hasFilters = Boolean(search || roleFilter || statusFilter)

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
        <div className="admin-users-page space-y-6">
          <header className="admin-page-intro flex-wrap">
            <div>
              <p className="admin-page-kicker">Administración de accesos</p>
              <h1 className="admin-page-heading">Usuarios y permisos</h1>
              <p className="admin-page-description">
                Consulta los accesos, asigna vendedores a sus puntos y administra los roles disponibles.
              </p>
            </div>
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2"
              onClick={() => setShowCreate(true)}><Plus size={16}/> Nuevo usuario</button>
          </header>
          <div className="row g-3" aria-label="Resumen de usuarios">
            {[
              {label:'Usuarios registrados',value:stats.total},
              {label:'Administradores',value:stats.admins},
              {label:'Vendedores',value:stats.sellers},
              {label:'Activos',value:stats.active},
            ].map(item => <div className="col-12 col-sm-6 col-xl-3" key={item.label}>
              <div className="admin-catalog-stat"><span>{item.label}</span>
                <strong>{item.value.toLocaleString('es-CO')}</strong>
              </div>
            </div>)}
          </div>
          <section className="admin-catalog-filter card" aria-label="Filtros de usuarios">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
              <h2 className="h6 fw-bold mb-0 d-inline-flex align-items-center gap-2">
                <SlidersHorizontal size={17}/> Buscar y filtrar
              </h2>
              <button type="button" className="btn btn-sm btn-outline-secondary"
                onClick={clearFilters} disabled={!hasFilters}>Limpiar</button>
            </div>
            <div className="row g-3">
              <div className="col-12 col-lg-6">
                <label htmlFor="users-search" className="form-label">Buscar usuario</label>
                <div className="admin-catalog-search"><Search size={16} aria-hidden="true"/>
                  <input id="users-search" type="search" className="form-control"
                    value={search} placeholder="Nombre, correo o teléfono"
                    onChange={event=>{setSearch(event.target.value);setPage(1)}}/>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <label htmlFor="users-role" className="form-label">Rol</label>
                <select id="users-role" className="form-select" value={roleFilter}
                  onChange={event=>{setRoleFilter(event.target.value);setPage(1)}}>
                  <option value="">Todos los roles</option>
                  <option value="admin">Administrador</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="seller">Vendedor</option>
                  <option value="customer">Cliente</option>
                </select>
              </div>
              <div className="col-6 col-lg-3">
                <label htmlFor="users-status" className="form-label">Estado</label>
                <select id="users-status" className="form-select" value={statusFilter}
                  onChange={event=>{setStatusFilter(event.target.value);setPage(1)}}>
                  <option value="">Todos los estados</option>
                  <option value="active">Activos</option><option value="inactive">Inactivos</option>
                </select>
              </div>
            </div>
          </section>

        {/* Tabla */}
        <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Listado de usuarios</h2>
            <p className="text-xs text-gray-500 mt-1">
                {filteredUsers.length} usuarios encontrados
            </p>
            </div>

            <div className="table-responsive">
            <table className="table table-hover align-middle admin-users-table mb-0">
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
                    pageUsers.map((u) => (
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
                        <div className="admin-users-actions">
                            <button type="button" onClick={() => setSelectedUser(u)}
                              disabled={u.role === 'customer' || (!isSuperAdmin && ['super_admin', 'admin'].includes(u.role))}
                              className="btn btn-sm btn-outline-primary" title="Editar datos y rol"
                              aria-label={`Editar usuario ${u.full_name}`}><Pencil size={15}/> Editar</button>
                            <button type="button" onClick={() => setPasswordUser(u)}
                              disabled={!isSuperAdmin && ['super_admin', 'admin'].includes(u.role)}
                              className="btn btn-sm btn-outline-secondary" title="Cambiar contraseña"
                              aria-label={`Cambiar contraseña de ${u.full_name}`}><KeyRound size={15}/> Contraseña</button>
                            <button type="button" onClick={() => toggleStatus(u)}
                              disabled={!canManage(u) || statusMutation.isPending}
                              className={u.active ? 'btn btn-sm btn-outline-warning' : 'btn btn-sm btn-outline-success'}
                              aria-label={`${u.active ? 'Pausar' : 'Reactivar'} a ${u.full_name}`}>
                              {u.active ? <PauseCircle size={15}/> : <PlayCircle size={15}/>}
                              {u.active ? 'Pausar' : 'Reactivar'}
                            </button>
                            <button type="button" onClick={() => setDeleteUser(u)}
                              disabled={!canManage(u)}
                              className="btn btn-sm btn-outline-danger"
                              aria-label={`Eliminar usuario ${u.full_name}`}><Trash2 size={15}/> Eliminar</button>
                        </div>
                        </td>
                    </tr>
                    ))
                )}
                </tbody>
            </table>
            </div>
        </div>

        <div className="admin-catalog-pagination">
          <span className="text-secondary small">
            {filteredUsers.length === 0 ? 'Sin resultados' : `Mostrando ${(currentPage-1)*perPage+1}–${Math.min(currentPage*perPage,filteredUsers.length)} de ${filteredUsers.length}`}
          </span>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <label className="small text-secondary" htmlFor="users-per-page">Por página</label>
            <select className="form-select form-select-sm admin-catalog-per-page"
              id="users-per-page" value={perPage}
              onChange={event=>{setPerPage(Number(event.target.value));setPage(1)}}>
              {[10,15,25,50].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Página anterior"
              disabled={currentPage===1} onClick={()=>setPage(n=>Math.max(1,n-1))}><ChevronLeft size={16}/></button>
            <span className="small fw-semibold">{currentPage} / {pageCount}</span>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Página siguiente"
              disabled={currentPage===pageCount} onClick={()=>setPage(n=>Math.min(pageCount,n+1))}><ChevronRight size={16}/></button>
          </div>
        </div>
        {showCreate && (
            <UserFormModal
            locations={locations} isSuperAdmin={isSuperAdmin} currentUserId={currentUserId}
            onClose={() => setShowCreate(false)}
            />
        )}

        {selectedUser && (
            <UserFormModal
            userItem={selectedUser}
            locations={locations} isSuperAdmin={isSuperAdmin} currentUserId={currentUserId}
            onClose={() => setSelectedUser(null)}
            />
        )}
        {passwordUser && <PasswordDialog key={passwordUser.id} target={passwordUser}
            onClose={() => setPasswordUser(null)} onSuccess={() => qc.invalidateQueries({queryKey:['admin-users']})}/>}
        {deleteUser && <DeleteUserDialog key={deleteUser.id} target={deleteUser}
            onClose={() => setDeleteUser(null)} onSuccess={() => qc.invalidateQueries({queryKey:['admin-users']})}/>}
        </div>
    )
}