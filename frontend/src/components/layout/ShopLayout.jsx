import { Outlet, Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, User, Search, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { useCartStore, useAuthStore } from '../../store'

export default function ShopLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const cartCount = useCartStore((s) => s.count())
  const { isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()

  const categories = ['Gorras', 'Perfumes', 'Relojes', 'Bolsos', 'Canguros']

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── NAVBAR ─────────────────────────────────────────────── */}
      <header className="bg-brand-950 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-white">
                HJ<span className="text-brand-400">Store</span>
                <span className="text-brand-300">VP</span>
              </span>
            </Link>

            {/* Nav desktop */}
            <nav className="hidden md:flex items-center gap-6">
              {categories.map((cat) => (
                <Link
                  key={cat}
                  to={`/catalogo?categoria=${cat.toLowerCase()}`}
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  {cat}
                </Link>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button className="p-2 text-gray-300 hover:text-white transition-colors">
                <Search size={20} />
              </button>

              <Link to="/carrito" className="relative p-2 text-gray-300 hover:text-white transition-colors">
                <ShoppingCart size={20} />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Link>

              {isAuthenticated ? (
                <div className="flex items-center gap-2">
                  <Link to="/mi-cuenta" className="p-2 text-gray-300 hover:text-white transition-colors">
                    <User size={20} />
                  </Link>
                  <button
                    onClick={() => { logout(); navigate('/') }}
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Salir
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="text-sm bg-brand-600 hover:bg-brand-500 px-4 py-1.5 rounded-lg font-medium transition-colors"
                >
                  Ingresar
                </Link>
              )}

              {/* Mobile menu btn */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden p-2 text-gray-300 hover:text-white"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          {menuOpen && (
            <div className="md:hidden py-4 border-t border-brand-800">
              {categories.map((cat) => (
                <Link
                  key={cat}
                  to={`/catalogo?categoria=${cat.toLowerCase()}`}
                  className="block py-2 text-sm text-gray-300 hover:text-white"
                  onClick={() => setMenuOpen(false)}
                >
                  {cat}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── CONTENT ────────────────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── FOOTER ─────────────────────────────────────────────── */}
      <footer className="bg-brand-950 text-gray-400 py-10 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <p className="text-white font-black text-xl mb-3">
                HJ<span className="text-brand-400">Store</span>VP
              </p>
              <p className="text-sm">Tu tienda de moda y accesorios con envíos a todo el país.</p>
            </div>
            <div>
              <p className="text-white font-semibold mb-3">Categorías</p>
              <div className="flex flex-col gap-1">
                {categories.map((cat) => (
                  <Link key={cat} to={`/catalogo?categoria=${cat.toLowerCase()}`}
                    className="text-sm hover:text-white transition-colors">{cat}</Link>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-semibold mb-3">Contacto</p>
              <p className="text-sm">WhatsApp: +57 300 000 0000</p>
              <p className="text-sm">info@hjstorevp.com</p>
            </div>
          </div>
          <div className="border-t border-brand-800 mt-8 pt-6 text-center text-xs">
            © {new Date().getFullYear()} HJStoreVP. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </div>
  )
}
