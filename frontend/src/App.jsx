import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store'

// Layout
import ShopLayout from './components/layout/ShopLayout'

// Páginas tienda
import HomePage     from './pages/shop/HomePage'
import CatalogPage  from './pages/shop/CatalogPage'
import ProductPage  from './pages/shop/ProductPage'
import CartPage     from './pages/shop/CartPage'
import CheckoutPage from './pages/shop/CheckoutPage'
import LoginPage    from './pages/shop/LoginPage'
import AccountPage  from './pages/shop/AccountPage'

function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        <Route path="/"          element={<HomePage />} />
        <Route path="/catalogo"  element={<CatalogPage />} />
        <Route path="/producto/:slug" element={<ProductPage />} />
        <Route path="/carrito"   element={<CartPage />} />
        <Route path="/checkout"  element={
          <ProtectedRoute><CheckoutPage /></ProtectedRoute>
        } />
        <Route path="/mi-cuenta" element={
          <ProtectedRoute><AccountPage /></ProtectedRoute>
        } />
      </Route>

      <Route path="/login"    element={<LoginPage />} />
      <Route path="*"         element={<Navigate to="/" replace />} />
    </Routes>
  )
}
