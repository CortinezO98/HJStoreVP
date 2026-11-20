import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from './store'

import AdminLayout from './components/layout/AdminLayout'
const LoginPage = lazy(() => import('./pages/LoginPage'))
const MyProfilePage = lazy(() => import('./pages/MyProfilePage'))
const SecurityAuditPage = lazy(() => import('./pages/SecurityAuditPage'))
const CommercialAuditPage = lazy(() => import('./pages/CommercialAuditPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const WebOrdersPage = lazy(() => import('./pages/WebOrdersPage'))
const LocationsPage = lazy(() => import('./pages/LocationsPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const ShippingRatesPage = lazy(() => import('./pages/ShippingRatesPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const PostSalePage = lazy(() => import('./pages/PostSalePage'))
const BillingPage = lazy(() => import('./pages/BillingPage'))
const TaxReadinessPage = lazy(() => import('./pages/TaxReadinessPage'))
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'))
const EngagementPage = lazy(() => import('./pages/EngagementPage'))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'))
const CashPage = lazy(() => import('./pages/CashPage'))
const StorefrontSettingsPage = lazy(() => import('./pages/StorefrontSettingsPage'))
const HomeStudioPage = lazy(() => import('./pages/HomeStudioPage'))

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
    <Suspense fallback={<div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center text-gray-600">Cargando módulo…</div>}>
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
          <Route path="mi-perfil" element={<MyProfilePage />} />
          <Route path="auditoria-comercial" element={<ProtectedAdmin roles={['super_admin']} />}>
            <Route index element={<CommercialAuditPage />} />
          </Route>
          <Route path="auditoria-seguridad" element={<ProtectedAdmin roles={['super_admin']} />}>
            <Route index element={<SecurityAuditPage />} />
          </Route>

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

          <Route path="caja" element={<ProtectedAdmin roles={['super_admin', 'admin', 'seller']} />}>
            <Route index element={<CashPage />} />
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
            path="envios"
            element={
              <ProtectedAdmin roles={['super_admin', 'admin']} />
            }
          >
            <Route index element={<ShippingRatesPage />} />
          </Route>

          <Route
            path="notificaciones"
            element={<ProtectedAdmin roles={['super_admin', 'admin']} />}
          >
            <Route index element={<NotificationsPage />} />
          </Route>

          <Route
            path="posventa"
            element={<ProtectedAdmin roles={['super_admin', 'admin']} />}
          >
            <Route index element={<PostSalePage />} />
          </Route>

          <Route
            path="comprobantes"
            element={<ProtectedAdmin roles={['super_admin', 'admin']} />}
          >
            <Route index element={<BillingPage />} />
          </Route>

          <Route
            path="configuracion-dian"
            element={<ProtectedAdmin roles={['super_admin', 'admin']} />}
          >
            <Route index element={<TaxReadinessPage />} />
          </Route>

          <Route
            path="promociones"
            element={<ProtectedAdmin roles={['super_admin', 'admin']} />}
          >
            <Route index element={<PromotionsPage />} />
          </Route>

          <Route
            path="fidelizacion"
            element={<ProtectedAdmin roles={['super_admin', 'admin']} />}
          >
            <Route index element={<EngagementPage />} />
          </Route>

          <Route path="integraciones" element={<ProtectedAdmin roles={['super_admin', 'admin']} />}>
            <Route index element={<IntegrationsPage />} />
          </Route>

          <Route path="estudio-inicio" element={<ProtectedAdmin roles={['super_admin']} />}>
            <Route index element={<HomeStudioPage />} />
          </Route>

          <Route path="configuracion-tienda" element={<ProtectedAdmin roles={['super_admin']} />}>
            <Route index element={<StorefrontSettingsPage />} />
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
    </Suspense>
  )
}