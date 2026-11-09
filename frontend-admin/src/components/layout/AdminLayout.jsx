import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Tag,
  Layers,
  ShoppingBag,
  Globe,
  MapPin,
  Users,
  BarChart2,
  LogOut,
  Menu,
  X,
  Bell,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../store'
import toast from 'react-hot-toast'

const NAV_ITEMS = [
  {
    to: '/',
    icon: LayoutDashboard,
    label: 'Dashboard',
    roles: ['super_admin', 'admin', 'seller'],
  },
  {
    to: '/productos',
    icon: Package,
    label: 'Productos',
    roles: ['super_admin', 'admin'],
  },
  {
    to: '/categorias',
    icon: Tag,
    label: 'Categorías',
    roles: ['super_admin', 'admin'],
  },
  {
    to: '/inventario',
    icon: Layers,
    label: 'Inventario',
    roles: ['super_admin', 'admin', 'seller'],
  },
  {
    to: '/pedidos',
    icon: ShoppingBag,
    label: 'Ventas físicas',
    roles: ['super_admin', 'admin', 'seller'],
  },
  {
    to: '/pedidos-web',
    icon: Globe,
    label: 'Pedidos web',
    roles: ['super_admin', 'admin'],
  },
  {
    to: '/puntos',
    icon: MapPin,
    label: 'Puntos físicos',
    roles: ['super_admin', 'admin'],
  },
  {
    to: '/envios',
    icon: Truck,
    label: 'Envíos y tarifas',
    roles: ['super_admin', 'admin'],
  },
  {
    to: '/usuarios',
    icon: Users,
    label: 'Usuarios',
    roles: ['super_admin', 'admin'],
  },
  {
    to: '/reportes',
    icon: BarChart2,
    label: 'Reportes',
    roles: ['super_admin', 'admin'],
  },
]

function roleLabel(role) {
  switch (role) {
    case 'super_admin':
      return 'Super Admin'
    case 'admin':
      return 'Administrador'
    case 'seller':
      return 'Vendedor'
    default:
      return role || 'Usuario'
  }
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => item.roles.includes(user?.role)),
    [user?.role]
  )
  const activeItem = navItems.find((item) => item.to === location.pathname)
  const activeLabel = activeItem?.label || 'Dashboard'
  const storeUrl = import.meta.env.VITE_STORE_URL || 'http://localhost:5173/'

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!sidebarOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  const handleLogout = () => {
    logout()
    toast.success('Sesión cerrada')
    navigate('/login', { replace: true })
  }

  const navLinkClass = ({ isActive }) =>
    `admin-sidebar-link ${isActive ? 'admin-sidebar-link-active' : ''}`

  const Navigation = ({ mobile = false }) => (
    <nav className="admin-sidebar-nav" aria-label="Módulos de administración">
      <span className="admin-sidebar-group-label">GESTIÓN DEL NEGOCIO</span>
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            onClick={mobile ? () => setSidebarOpen(false) : undefined}
            className={navLinkClass}>
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>{item.label}</span>
            <ChevronRight size={14} className="admin-sidebar-arrow" aria-hidden="true" />
          </NavLink>
        )
      })}
    </nav>
  )

  const SidebarContent = ({ mobile = false }) => (
    <>
      <div className="admin-sidebar-brand">
        <div className="admin-brand-mark" aria-hidden="true">HJ</div>
        <div className="min-w-0">
          <p className="admin-brand-name">HJSTORE<span>VP</span></p>
          <p className="admin-brand-subtitle">PANEL ADMINISTRATIVO</p>
        </div>
        {mobile && (
          <button type="button" onClick={() => setSidebarOpen(false)}
            className="admin-sidebar-close" aria-label="Cerrar menú">
            <X size={20} />
          </button>
        )}
      </div>
      <div className="admin-sidebar-user">
        <span className="admin-sidebar-avatar" aria-hidden="true">
          {(user?.fullName || 'A').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="admin-sidebar-user-name">{user?.fullName || 'Usuario'}</p>
          <p className="admin-sidebar-role"><ShieldCheck size={13} /> {roleLabel(user?.role)}</p>
        </div>
      </div>
      <Navigation mobile={mobile} />
      <div className="admin-sidebar-bottom">
        <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="admin-sidebar-store-link">
          <ExternalLink size={17} /> Ver tienda pública
        </a>
        <button type="button" onClick={handleLogout} className="admin-sidebar-logout">
          <LogOut size={18} /> Cerrar sesión
        </button>
        <p className="admin-sidebar-version">HJSTOREVP · GESTIÓN COMERCIAL</p>
      </div>
    </>
  )

  return (
    <div className="admin-app-shell">
      <a href="#admin-main" className="admin-skip-link">Saltar al contenido</a>

      <aside className="admin-sidebar admin-sidebar-desktop" aria-label="Navegación administrativa">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="admin-mobile-overlay" role="presentation">
          <button type="button" className="admin-mobile-backdrop" aria-label="Cerrar menú"
            onClick={() => setSidebarOpen(false)} />
          <aside id="admin-mobile-sidebar" className="admin-sidebar admin-sidebar-mobile" aria-label="Navegación móvil">
            <SidebarContent mobile />
          </aside>
        </div>
      )}

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-topbar-main">
            <button type="button" className="admin-icon-button admin-mobile-toggle"
              onClick={() => setSidebarOpen(true)} aria-label="Abrir menú de administración"
              aria-controls="admin-mobile-sidebar" aria-expanded={sidebarOpen}>
              <Menu size={21} />
            </button>
            <div className="min-w-0">
              <p className="admin-topbar-eyebrow">HJSTOREVP <ChevronRight size={13} /> OPERACIÓN</p>
              <h2 className="admin-topbar-title">{activeLabel}</h2>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <span className="admin-topbar-role"><ShieldCheck size={15}/> {roleLabel(user?.role)}</span>
            <a href={storeUrl} target="_blank" rel="noopener noreferrer"
              className="admin-topbar-store" aria-label="Abrir tienda pública en otra pestaña">
              <ExternalLink size={16} /> <span>Tienda</span>
            </a>
            <button type="button" className="admin-icon-button" onClick={() => navigate('/inventario')}
              aria-label="Revisar inventario y alertas" title="Inventario y alertas">
              <Bell size={19} />
            </button>
          </div>
        </header>

        <main className="admin-main" id="admin-main" tabIndex={-1}>
          <div className="admin-main-inner"><Outlet /></div>
        </main>
      </div>
    </div>
  )
}
