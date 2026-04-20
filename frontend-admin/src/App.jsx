import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store'

import AdminLayout    from './components/layout/AdminLayout'
import LoginPage      from './pages/LoginPage'
import DashboardPage  from './pages/DashboardPage'
import ProductsPage   from './pages/ProductsPage'
import InventoryPage  from './pages/InventoryPage'
import OrdersPage     from './pages/OrdersPage'
import LocationsPage  from './pages/LocationsPage'
import UsersPage      from './pages/UsersPage'
import ReportsPage    from './pages/ReportsPage'

function ProtectedAdmin({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={
        <ProtectedAdmin roles={['super_admin', 'admin', 'seller']}>
          <AdminLayout />
        </ProtectedAdmin>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="productos"  element={<ProductsPage />} />
        <Route path="inventario" element={<InventoryPage />} />
        <Route path="pedidos"    element={<OrdersPage />} />
        <Route path="puntos"     element={
          <ProtectedAdmin roles={['super_admin', 'admin']}>
            <LocationsPage />
          </ProtectedAdmin>
        } />
        <Route path="usuarios"   element={
          <ProtectedAdmin roles={['super_admin', 'admin']}>
            <UsersPage />
          </ProtectedAdmin>
        } />
        <Route path="reportes"   element={
          <ProtectedAdmin roles={['super_admin', 'admin']}>
            <ReportsPage />
          </ProtectedAdmin>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
