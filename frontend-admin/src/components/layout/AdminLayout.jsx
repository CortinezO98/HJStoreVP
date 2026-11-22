import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, Tag, Layers, ShoppingBag, Globe, MapPin, Users, UserCircle,
  BarChart2, LogOut, Menu, X, Bell, ExternalLink, ChevronRight, ShieldCheck, History,
  Truck, Mail, RotateCcw, ReceiptText, FileCheck2, TicketPercent, HeartHandshake, PlugZap,
  Wallet, Settings2, PanelsTopLeft, Search, ChevronDown, PanelLeftClose, PanelLeftOpen, ShieldAlert, Activity,
} from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store'
import { inventoryApi } from '../../services/api'
import AdminCommandPalette from './AdminCommandPalette'
import ModuleErrorBoundary from '../ui/ModuleErrorBoundary'
import { ConfirmHost } from '../ui/ConfirmDialog'

const ALL = ['super_admin', 'admin', 'seller']
const ADMINS = ['super_admin', 'admin']
const SUPER = ['super_admin']

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ALL },
  { to: '/reportes', icon: BarChart2, label: 'Reportes', roles: ADMINS },
  { to: '/productos', icon: Package, label: 'Productos', roles: ADMINS },
  { to: '/categorias', icon: Tag, label: 'Categorías', roles: ADMINS },
  { to: '/inventario', icon: Layers, label: 'Inventario', roles: ALL, badge: 'lowStock' },
  { to: '/puntos', icon: MapPin, label: 'Puntos físicos', roles: ADMINS },
  { to: '/pedidos', icon: ShoppingBag, label: 'Ventas físicas', roles: ALL },
  { to: '/caja', icon: Wallet, label: 'Caja y arqueos', roles: ALL },
  { to: '/pedidos-web', icon: Globe, label: 'Pedidos web', roles: ADMINS },
  { to: '/envios', icon: Truck, label: 'Envíos y tarifas', roles: ADMINS },
  { to: '/posventa', icon: RotateCcw, label: 'Devoluciones y posventa', roles: ADMINS },
  { to: '/promociones', icon: TicketPercent, label: 'Promociones y cupones', roles: ADMINS },
  { to: '/fidelizacion', icon: HeartHandshake, label: 'Fidelización y carritos', roles: ADMINS },
  { to: '/notificaciones', icon: Mail, label: 'Notificaciones', roles: ADMINS },
  { to: '/estudio-inicio', icon: PanelsTopLeft, label: 'Estudio visual del inicio', roles: SUPER },
  { to: '/configuracion-tienda', icon: Settings2, label: 'Configuración de tienda', roles: SUPER },
  { to: '/comprobantes', icon: ReceiptText, label: 'Comprobantes', roles: ADMINS },
  { to: '/configuracion-dian', icon: FileCheck2, label: 'Configuración DIAN', roles: ADMINS },
  { to: '/usuarios', icon: Users, label: 'Usuarios', roles: ADMINS },
  { to: '/integraciones', icon: PlugZap, label: 'Centro de integraciones', roles: ADMINS },
  { to: '/monitoreo-tecnico', icon: Activity, label: 'Monitoreo técnico', roles: SUPER },
  { to: '/auditoria-seguridad', icon: ShieldAlert, label: 'Auditoría de seguridad', roles: SUPER },
  { to: '/auditoria-comercial', icon: History, label: 'Auditoría comercial', roles: SUPER },
  // Accesible desde el menú de usuario y la búsqueda (Ctrl K), no desde el lateral.
  { to: '/mi-perfil', icon: UserCircle, label: 'Mi perfil y seguridad', roles: ALL, hidden: true },
]

const NAV_GROUPS = [
  { label: 'General', links: ['/', '/reportes'] },
  { label: 'Catálogo', links: ['/productos', '/categorias', '/inventario', '/puntos'] },
  { label: 'Ventas', links: ['/pedidos', '/caja', '/pedidos-web', '/envios', '/posventa'] },
  { label: 'Marketing', links: ['/promociones', '/fidelizacion', '/notificaciones'] },
  { label: 'Tienda en línea', links: ['/estudio-inicio', '/configuracion-tienda'] },
  { label: 'Facturación', links: ['/comprobantes', '/configuracion-dian'] },
  { label: 'Administración', links: ['/usuarios', '/integraciones', '/monitoreo-tecnico', '/auditoria-seguridad', '/auditoria-comercial'] },
]

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Administrador', seller: 'Vendedor' }
const STORE_URL = import.meta.env.VITE_STORE_URL || '/'

function readStored(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
function writeStored(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* almacenamiento no disponible */ }
}

function BrandMark({ collapsed }) {
  return collapsed
    ? <span className="hj-brand-mono" aria-label="HJStoreVP">HJ<i>.</i></span>
    : <span className="hj-brand-word">HJSTORE<small>VP</small><i>.</i></span>
}

function AdminNavigation({ items, counts, mobile, onNavigate, openGroups, toggleGroup }) {
  const [query, setQuery] = useState('')
  const filter = query.trim().toLocaleLowerCase('es')
  const visible = items.filter((item) => !item.hidden)
  const matches = (item) => !filter || item.label.toLocaleLowerCase('es').includes(filter)
  return (
    <nav className="admin-sidebar-nav" aria-label="Módulos de administración">
      <div className="admin-sidebar-search-wrap">
        <Search size={16} aria-hidden="true" />
        <input type="search" aria-label="Filtrar módulos del menú" value={query}
          onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar menú…" className="admin-sidebar-search" />
      </div>
      {NAV_GROUPS.map((group) => {
        const links = visible.filter((item) => group.links.includes(item.to) && matches(item))
        if (!links.length) return null
        const open = Boolean(filter) || openGroups.includes(group.label)
        const groupId = `nav-group-${group.label.replace(/\s+/g, '-').toLowerCase()}${mobile ? '-m' : ''}`
        return (
          <div className="admin-sidebar-group" key={group.label}>
            <button type="button" className="admin-sidebar-group-toggle" aria-expanded={open} aria-controls={groupId}
              onClick={() => toggleGroup(group.label)}>
              <span>{group.label}</span>
              <ChevronDown size={14} className={open ? 'admin-group-chevron is-open' : 'admin-group-chevron'} aria-hidden="true" />
            </button>
            {open && (
              <div id={groupId} className="admin-sidebar-group-links">
                {links.map((item) => {
                  const Icon = item.icon
                  const count = item.badge ? counts[item.badge] : 0
                  return (
                    <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={onNavigate} title={item.label}
                      className={({ isActive }) => `admin-sidebar-link ${isActive ? 'admin-sidebar-link-active' : ''}`}>
                      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                      <span>{item.label}</span>
                      {count > 0 && <span className="hj-nav-badge" aria-label={`${count} alertas`}>{count > 99 ? '99+' : count}</span>}
                    </NavLink>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {filter && !visible.some(matches) && <p className="admin-sidebar-no-results">Ningún módulo coincide con «{query}».</p>}
    </nav>
  )
}

function UserMenu({ user, email, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => { if (!ref.current?.contains(event.target)) setOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const name = user?.fullName || 'Usuario'
  return (
    <div className="position-relative" ref={ref}>
      <button type="button" className="hj-user-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="hj-avatar" aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</span>
        <span className="hj-user-meta"><strong>{name}</strong><small>{ROLE_LABEL[user?.role] || 'Usuario'}</small></span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="hj-menu" role="menu">
          <div className="hj-menu-head">
            <strong>{name}</strong>
            {email && <span>{email}</span>}
            <div><span className="hj-role-chip"><ShieldCheck size={12} /> {ROLE_LABEL[user?.role] || 'Usuario'}</span></div>
          </div>
          <Link to="/mi-perfil" role="menuitem" className="hj-menu-item" onClick={() => setOpen(false)}><UserCircle size={17} /> Mi perfil y seguridad</Link>
          <a href={STORE_URL} target="_blank" rel="noopener noreferrer" role="menuitem" className="hj-menu-item"><ExternalLink size={17} /> Ver tienda pública</a>
          <div className="hj-menu-sep" />
          <button type="button" role="menuitem" className="hj-menu-item is-danger" onClick={onLogout}><LogOut size={17} /> Cerrar sesión</button>
        </div>
      )}
    </div>
  )
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => readStored('hj-admin-collapsed', false))
  const [openGroups, setOpenGroups] = useState(() => readStored('hj-admin-groups', NAV_GROUPS.map((g) => g.label)))
  const closeCommand = useCallback(() => setCommandOpen(false), [])

  const navItems = useMemo(() => NAV_ITEMS.filter((item) => item.roles.includes(user?.role)), [user?.role])
  const active = NAV_ITEMS.find((item) => item.to === location.pathname)
  const activeGroup = NAV_GROUPS.find((group) => group.links.includes(location.pathname))

  // Alertas reales de stock para el indicador del menú y la campana.
  const { data: lowStock = [] } = useQuery({
    queryKey: ['layout-low-stock'],
    queryFn: () => inventoryApi.lowStock().then((r) => r.data),
    enabled: Boolean(user?.role),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
  const lowStockCount = Array.isArray(lowStock) ? lowStock.length : 0
  const counts = { lowStock: lowStockCount }

  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  useEffect(() => { document.title = `${active?.label || 'Panel'} · HJStoreVP Admin` }, [active?.label])
  useEffect(() => { writeStored('hj-admin-collapsed', collapsed) }, [collapsed])
  useEffect(() => { writeStored('hj-admin-groups', openGroups) }, [openGroups])
  // Abrir siempre el grupo del módulo actual.
  useEffect(() => {
    if (activeGroup && !openGroups.includes(activeGroup.label)) setOpenGroups((g) => [...g, activeGroup.label])
  }, [activeGroup?.label])

  useEffect(() => {
    const shortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setMobileOpen(false)
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previous }
  }, [mobileOpen])

  const toggleGroup = (label) => setOpenGroups((current) =>
    current.includes(label) ? current.filter((group) => group !== label) : [...current, label])

  const handleLogout = () => {
    logout()
    toast.success('Sesión cerrada')
    navigate('/login', { replace: true })
  }

  const sidebarBody = (mobile) => (
    <>
      <div className="admin-sidebar-brand">
        <Link to="/" className="text-decoration-none" aria-label="Ir al dashboard"><BrandMark collapsed={!mobile && collapsed} /></Link>
        {mobile && (
          <button type="button" onClick={() => setMobileOpen(false)} className="admin-sidebar-close" aria-label="Cerrar menú"><X size={20} /></button>
        )}
      </div>
      <AdminNavigation items={navItems} counts={counts} mobile={mobile} openGroups={openGroups} toggleGroup={toggleGroup}
        onNavigate={mobile ? () => setMobileOpen(false) : undefined} />
      <div className="admin-sidebar-bottom">
        <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="admin-sidebar-store-link" title="Ver tienda pública">
          <ExternalLink size={17} /> <span>Ver tienda pública</span>
        </a>
        {!mobile && (
          <button type="button" className="hj-collapse-btn" onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'} title={collapsed ? 'Expandir menú' : 'Contraer menú'}>
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />} <span>Contraer menú</span>
          </button>
        )}
      </div>
    </>
  )

  return (
    <div className={`admin-app-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <a href="#admin-main" className="admin-skip-link">Saltar al contenido</a>

      <aside className="admin-sidebar admin-sidebar-desktop" aria-label="Navegación administrativa">
        {sidebarBody(false)}
      </aside>

      {mobileOpen && (
        <div className="admin-mobile-overlay" role="presentation">
          <button type="button" className="admin-mobile-backdrop" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />
          <aside id="admin-mobile-sidebar" className="admin-sidebar admin-sidebar-mobile" role="dialog" aria-modal="true" aria-label="Navegación">
            {sidebarBody(true)}
          </aside>
        </div>
      )}

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-topbar-main">
            <button type="button" className="admin-icon-button admin-mobile-toggle" onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú de administración" aria-controls="admin-mobile-sidebar" aria-expanded={mobileOpen}>
              <Menu size={20} />
            </button>
            <nav className="hj-crumbs" aria-label="Ubicación">
              {activeGroup && <><span className="hj-crumb-group">{activeGroup.label}</span><ChevronRight size={14} className="hj-crumb-sep" aria-hidden="true" /></>}
              <strong className="admin-topbar-title" aria-current="page">{active?.label || 'Panel'}</strong>
            </nav>
          </div>
          <div className="admin-topbar-actions">
            <button type="button" className="admin-topbar-search-cta" onClick={() => setCommandOpen(true)}
              aria-label="Buscar módulo (Ctrl K)" aria-haspopup="dialog" aria-expanded={commandOpen}>
              <Search size={16} aria-hidden="true" />
              <span>Buscar módulo…</span>
              <kbd className="admin-search-shortcut">Ctrl K</kbd>
            </button>
            <button type="button" className="admin-icon-button" onClick={() => navigate('/inventario')}
              aria-label={lowStockCount ? `${lowStockCount} productos con stock bajo` : 'Sin alertas de stock'}
              title={lowStockCount ? `${lowStockCount} productos con stock bajo` : 'Sin alertas de stock'}>
              <Bell size={19} />
              {lowStockCount > 0 && <span className="hj-dot-count" aria-hidden="true">{lowStockCount > 99 ? '99+' : lowStockCount}</span>}
            </button>
            <UserMenu user={user} email={user?.email} onLogout={handleLogout} />
          </div>
        </header>

        <main className="admin-main" id="admin-main" tabIndex={-1}>
          <div className="admin-main-inner">
            <ModuleErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<div className="hj-loading" role="status"><span className="hj-spinner" /> Cargando módulo…</div>}>
                <Outlet />
              </Suspense>
            </ModuleErrorBoundary>
          </div>
        </main>
      </div>
      <AdminCommandPalette open={commandOpen} onClose={closeCommand} items={navItems} />
      <ConfirmHost />
    </div>
  )
}
