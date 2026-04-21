import { Outlet, NavLink, useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import { useMemo, useState } from 'react'
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
  const { user, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => item.roles.includes(user?.role))
  }, [user?.role])

  const handleLogout = () => {
    logout()
    toast.success('Sesión cerrada')
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex lg:w-72 bg-white border-r border-gray-100 flex-col">
        <div className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-xl font-black text-gray-900">HJ Store Admin</h1>
          <p className="text-xs text-gray-500 mt-1">
            Panel administrativo contable
          </p>
        </div>

        <div className="px-4 py-4 border-b border-gray-100">
          <div className="rounded-2xl bg-brand-50 border border-brand-100 p-4">
            <p className="text-sm font-semibold text-gray-900">
              {user?.fullName || 'Usuario'}
            </p>
            <p className="text-xs text-brand-700 mt-1">
              {roleLabel(user?.role)}
            </p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white border-r border-gray-100 flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black text-gray-900">HJ Store Admin</h1>
                <p className="text-xs text-gray-500 mt-1">
                  Panel administrativo contable
                </p>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-4 py-4 border-b border-gray-100">
              <div className="rounded-2xl bg-brand-50 border border-brand-100 p-4">
                <p className="text-sm font-semibold text-gray-900">
                  {user?.fullName || 'Usuario'}
                </p>
                <p className="text-xs text-brand-700 mt-1">
                  {roleLabel(user?.role)}
                </p>
              </div>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-600 text-white'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>

            <div className="p-3 border-t border-gray-100">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={18} />
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
            >
              <Menu size={18} />
            </button>

            <div>
              <h2 className="text-lg font-bold text-gray-900">Operación del negocio</h2>
              <p className="text-xs text-gray-500">
                Tienda web + puntos físicos conectados
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="p-2 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors">
              <Bell size={18} />
            </button>
          </div>
        </header>

        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}