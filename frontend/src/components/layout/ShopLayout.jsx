import { Outlet, Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, User, Search, Menu, X, MessageCircle, Phone, MapPin } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useCartStore, useAuthStore } from '../../store'

const WHATSAPP_NUMBER = '573000000000' // ← Cambiar por el número real
const WHATSAPP_MSG    = 'Hola! Me interesa hacer un pedido en HJStoreVP 🛍️'

const CATEGORIES = [
  { name: 'Gorras',   slug: 'gorras',   emoji: '🧢' },
  { name: 'Perfumes', slug: 'perfumes', emoji: '🌸' },
  { name: 'Relojes',  slug: 'relojes',  emoji: '⌚' },
  { name: 'Bolsos',   slug: 'bolsos',   emoji: '👜' },
  { name: 'Canguros', slug: 'canguros', emoji: '🎽' },
]

export default function ShopLayout() {
  const [menuOpen, setMenuOpen]   = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const searchRef = useRef(null)
  const cartCount = useCartStore((s) => s.count())
  const { isAuthenticated, user, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchText.trim()) {
      navigate(`/catalogo?q=${encodeURIComponent(searchText.trim())}`)
      setSearchText('')
      setSearchOpen(false)
    }
  }

  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MSG)}`

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── BARRA SUPERIOR (info) ─────────────────────────────── */}
      <div className="bg-brand-900 text-brand-200 text-xs py-1.5 hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Phone size={11} /> +57 300 000 0000
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={11} /> Barranquilla, Colombia
            </span>
          </div>
          <span>🚚 Envíos a todo Colombia · Pago seguro · Productos originales</span>
        </div>
      </div>

      {/* ── NAVBAR ─────────────────────────────────────────────── */}
      <header className="bg-brand-950 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 h-16">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <span className="text-2xl font-black tracking-tight text-white">
                HJ<span className="text-brand-400">Store</span>
                <span className="text-brand-300">VP</span>
              </span>
            </Link>

            {/* Buscador central (desktop) */}
            <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md mx-4">
              <div className="relative w-full">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar gorras, perfumes, relojes..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  className="w-full bg-brand-800 border border-brand-700 text-white placeholder-gray-400 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-brand-400 focus:bg-brand-700 transition-colors"
                />
              </div>
            </form>

            {/* Nav desktop */}
            <nav className="hidden lg:flex items-center gap-5 flex-shrink-0">
              {CATEGORIES.map((cat) => (
                <Link
                  key={cat.slug}
                  to={`/catalogo?categoria=${cat.slug}`}
                  className="text-sm text-gray-300 hover:text-white transition-colors whitespace-nowrap"
                >
                  {cat.name}
                </Link>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">

              {/* Buscar mobile */}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="md:hidden p-2 text-gray-300 hover:text-white transition-colors"
              >
                <Search size={20} />
              </button>

              {/* WhatsApp */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                title="Comprar por WhatsApp"
              >
                <MessageCircle size={14} />
                <span className="hidden lg:inline">WhatsApp</span>
              </a>

              {/* Carrito */}
              <Link to="/carrito" className="relative p-2 text-gray-300 hover:text-white transition-colors">
                <ShoppingCart size={20} />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </Link>

              {/* Usuario */}
              {isAuthenticated ? (
                <div className="flex items-center gap-1">
                  <Link
                    to="/mi-cuenta"
                    className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors px-2 py-1.5"
                  >
                    <User size={18} />
                    <span className="hidden lg:inline text-xs truncate max-w-20">
                      {user?.fullName?.split(' ')[0]}
                    </span>
                  </Link>
                  <button
                    onClick={() => { logout(); navigate('/') }}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-1"
                  >
                    Salir
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="text-sm bg-brand-600 hover:bg-brand-500 px-4 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  Ingresar
                </Link>
              )}

              {/* Mobile menu */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="lg:hidden p-2 text-gray-300 hover:text-white"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {/* Búsqueda mobile expandida */}
          {searchOpen && (
            <div className="md:hidden pb-3">
              <form onSubmit={handleSearch}>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Buscar productos..."
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    className="w-full bg-brand-800 border border-brand-700 text-white placeholder-gray-400 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-brand-400"
                  />
                </div>
              </form>
            </div>
          )}

          {/* Mobile nav */}
          {menuOpen && (
            <div className="lg:hidden py-4 border-t border-brand-800">
              {CATEGORIES.map((cat) => (
                <Link
                  key={cat.slug}
                  to={`/catalogo?categoria=${cat.slug}`}
                  className="flex items-center gap-2 py-2.5 text-sm text-gray-300 hover:text-white"
                  onClick={() => setMenuOpen(false)}
                >
                  <span>{cat.emoji}</span> {cat.name}
                </Link>
              ))}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-2.5 text-sm text-green-400 hover:text-green-300 mt-2 pt-2 border-t border-brand-800"
              >
                <MessageCircle size={16} /> Comprar por WhatsApp
              </a>
            </div>
          )}
        </div>
      </header>

      {/* ── CONTENT ────────────────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── FOOTER ─────────────────────────────────────────────── */}
      <footer className="bg-brand-950 text-gray-400 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <p className="text-white font-black text-2xl mb-3">
                HJ<span className="text-brand-400">Store</span>VP
              </p>
              <p className="text-sm mb-4 max-w-sm">
                Tu tienda de moda y accesorios con los mejores precios. Gorras, perfumes, relojes, bolsos y más con envíos a todo Colombia.
              </p>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              >
                <MessageCircle size={16} /> Escríbenos al WhatsApp
              </a>
            </div>
            <div>
              <p className="text-white font-semibold mb-3">Categorías</p>
              <div className="flex flex-col gap-2">
                {CATEGORIES.map((cat) => (
                  <Link key={cat.slug} to={`/catalogo?categoria=${cat.slug}`}
                    className="text-sm hover:text-white transition-colors flex items-center gap-1.5">
                    <span className="text-base">{cat.emoji}</span> {cat.name}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-semibold mb-3">Contacto</p>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <MessageCircle size={14} className="text-green-500" />
                  +57 300 000 0000
                </p>
                <p className="flex items-center gap-2">
                  <Phone size={14} /> info@hjstorevp.com
                </p>
                <p className="flex items-center gap-2">
                  <MapPin size={14} /> Barranquilla, Colombia
                </p>
              </div>
            </div>
          </div>
          <div className="border-t border-brand-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <p>© {new Date().getFullYear()} HJStoreVP. Todos los derechos reservados.</p>
            <div className="flex items-center gap-4">
              <span>🔒 Pagos seguros con Wompi</span>
              <span>🚚 Envíos a todo Colombia</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ── BOTÓN WHATSAPP FLOTANTE ─────────────────────────────── */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-500 hover:bg-green-400 text-white rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110"
        title="Chatea con nosotros"
      >
        <MessageCircle size={26} />
      </a>
    </div>
  )
}
