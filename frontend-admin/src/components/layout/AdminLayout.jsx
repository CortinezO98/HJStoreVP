import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, Layers, ShoppingBag,
  MapPin, Users, BarChart2, LogOut, Menu, X, Bell
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../../store'
import toast from 'react-hot-toast'

const NAV_ITEMS = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard',      roles: ['super_admin','admin','seller'] },
  { to: '/productos',  icon: Package,         label: 'Productos',      roles: ['super_admin','admin'] },
  { to: '/inventario', icon: Layers,          label: 'Inventario',     roles: ['super_admin','admin','seller'] },
  { to: '/pedidos',    icon: ShoppingBag,     label: 'Pedidos',        roles: ['super_admin','admin','seller'] },
  { to: '/puntos',     icon: MapPin,          label: 'Puntos Físicos', roles: ['super_admin','admin'] },
  { to: '/usuarios',   icon: Users,           label: 'Usuarios',       roles: ['super_admin','admin'] },
  { to: '/reportes',   icon: BarChart2,       label: 'Reportes',       roles: ['super_admin','admin'] },
]

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user?.role))

  const handleLogout = () => {
    logout()
    toast.success('Sesión cerrada')
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-brand-800">
        <span className="text-xl font-black text-white">
          HJ<span className="text-brand-400">Store</span><span className="text-brand-300">VP</span>
        </span>
        <p className="text-xs text-brand-400 mt-0.5">Panel de administración</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-brand-200 hover:bg-brand-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-brand-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
            {user?.fullName?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.fullName}</p>
            <p className="text-xs text-brand-400 capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-brand-300 hover:bg-brand-800 hover:text-white transition-colors"
        >
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex lg:w-60 flex-col bg-brand-950 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 bg-brand-950 flex flex-col z-50">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-brand-300 hover:text-white"
            >
              <X size={20} />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 h-14 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <button className="relative p-2 text-gray-500 hover:text-gray-700">
              <Bell size={18} />
            </button>
            <div className="text-sm text-gray-500">
              <span className="font-medium text-gray-900">{user?.fullName}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
