import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from './store'

import AdminLayout from './components/layout/AdminLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProductsPage from './pages/ProductsPage'
import CategoriesPage from './pages/CategoriesPage'
import InventoryPage from './pages/InventoryPage'
import OrdersPage from './pages/OrdersPage'
import WebOrdersPage from './pages/WebOrdersPage'
import LocationsPage from './pages/LocationsPage'
import UsersPage from './pages/UsersPage'
import ReportsPage from './pages/ReportsPage'

function ProtectedAdmin({ roles }) {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // El cliente web no debe entrar jamás al panel administrativo
  if (user?.role === 'customer') {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(user?.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Área privada del panel */}
      <Route
        element={
          <ProtectedAdmin roles={['super_admin', 'admin', 'seller']} />
        }
      >
        <Route path="/" element={<AdminLayout />}>
          {/* Seller sí puede ver su dashboard operativo */}
          <Route index element={<DashboardPage />} />

          {/* Admin / Super Admin */}
          <Route
            path="productos"
            element={
              <ProtectedAdmin roles={['super_admin', 'admin']} />
            }
          >
            <Route index element={<ProductsPage />} />
          </Route>

          <Route
            path="categorias"
            element={
              <ProtectedAdmin roles={['super_admin', 'admin']} />
            }
          >
            <Route index element={<CategoriesPage />} />
          </Route>

          {/* Seller sí puede ver inventario de su punto */}
          <Route
            path="inventario"
            element={
              <ProtectedAdmin roles={['super_admin', 'admin', 'seller']} />
            }
          >
            <Route index element={<InventoryPage />} />
          </Route>

          {/* Seller sí puede registrar y ver ventas físicas de su punto */}
          <Route
            path="pedidos"
            element={
              <ProtectedAdmin roles={['super_admin', 'admin', 'seller']} />
            }
          >
            <Route index element={<OrdersPage />} />
          </Route>

          {/* Solo admin / super admin */}
          <Route
            path="pedidos-web"
            element={
              <ProtectedAdmin roles={['super_admin', 'admin']} />
            }
          >
            <Route index element={<WebOrdersPage />} />
          </Route>

          <Route
            path="puntos"
            element={
              <ProtectedAdmin roles={['super_admin', 'admin']} />
            }
          >
            <Route index element={<LocationsPage />} />
          </Route>

          <Route
            path="usuarios"
            element={
              <ProtectedAdmin roles={['super_admin', 'admin']} />
            }
          >
            <Route index element={<UsersPage />} />
          </Route>

          <Route
            path="reportes"
            element={
              <ProtectedAdmin roles={['super_admin', 'admin']} />
            }
          >
            <Route index element={<ReportsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}