import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { ShoppingBag, UserRound, Search, Menu, X, ArrowRight, Instagram, Heart } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoriesApi, storefrontSettingsApi } from '../../services/api'
import { useCartStore, useAuthStore, useWishlistStore } from '../../store'


export default function ShopLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const searchRef = useRef(null)
  const cartCount = useCartStore((s) => s.count())
  const wishlistCount = useWishlistStore((s) => s.items.length)
  const { data: storeSettings = {} } = useQuery({
    queryKey: ['storefront-settings-public'],
    queryFn: () => storefrontSettingsApi.public().then(({ data }) => data),
    staleTime: 60000,
  })
  const logo = storeSettings.logo_url
  const logoSrc = logo?.startsWith('/') ? `${import.meta.env.VITE_API_URL || ''}${logo}` : logo
  const storeName = storeSettings.store_name || 'HJStoreVP'
  const { data: categories = [] } = useQuery({
    queryKey: ['storefront-categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data),
  })
  const navigationCategories = categories.filter((c) => c.active !== false)
  const { isAuthenticated, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    setMenuOpen(false)
    setSearchOpen(false)
  }, [location.pathname, location.search])

  const handleSearch = (event) => {
    event.preventDefault()
    const query = searchText.trim()
    if (!query) return
    navigate(`/catalogo?q=${encodeURIComponent(query)}`)
    setSearchText('')
    setSearchOpen(false)
    setMenuOpen(false)
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-black">
      <a href="#store-main-content" className="store-skip-link">Saltar al contenido principal</a>
      <div className="editorial-announcement">
        {storeSettings.announcement || 'DESCUBRE LA NUEVA COLECCIÓN · ENVÍOS A TODO COLOMBIA'}
      </div>

      <header className="editorial-header">
        <div className="editorial-header-inner">
          <Link to="/" className="editorial-logo" aria-label={`${storeName}, inicio`}>
            {logoSrc ? <img src={logoSrc} alt={storeName} className="max-h-12 max-w-40 object-contain" /> :
              <>HJ<span>STORE</span><small>VP</small></>}
          </Link>
          <nav className="editorial-nav" aria-label="Navegación principal">
            <Link to="/">INICIO</Link>
            {navigationCategories.map((cat) => (
              <Link key={cat.slug} to={`/catalogo?categoria=${cat.slug}`}>{cat.name.toUpperCase()}</Link>
            ))}
            <Link to="/catalogo?sort=newest">NOVEDADES</Link>
            <Link to="/catalogo?featured=true" className="editorial-sale">DESTACADOS</Link>
          </nav>
          <div className="editorial-actions">
            <button type="button" onClick={() => setSearchOpen((v) => !v)}
              aria-label="Buscar productos" aria-expanded={searchOpen}>
              <Search size={19} strokeWidth={1.5} />
            </button>
            <Link to={isAuthenticated ? '/mi-cuenta' : '/login'}
              aria-label={isAuthenticated ? 'Mi cuenta' : 'Iniciar sesión'}>
              <UserRound size={19} strokeWidth={1.5} />
            </Link>
            <Link to="/favoritos" className="editorial-bag" aria-label={`Ver favoritos, ${wishlistCount} productos`}>
              <Heart size={19} strokeWidth={1.5} />
              {wishlistCount > 0 && <span>{wishlistCount > 99 ? '99+' : wishlistCount}</span>}
            </Link>
            <Link to="/carrito" className="editorial-bag" aria-label={`Ver carrito, ${cartCount} productos`}>
              <ShoppingBag size={19} strokeWidth={1.5} />
              {cartCount > 0 && <span>{cartCount > 99 ? '99+' : cartCount}</span>}
            </Link>
            <button type="button" className="editorial-menu-toggle lg:hidden"
              onClick={() => setMenuOpen((v) => !v)} aria-label="Abrir menú" aria-expanded={menuOpen}>
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
        {searchOpen && (
          <form className="editorial-search" role="search" onSubmit={handleSearch}>
            <Search size={19} strokeWidth={1.5} />
            <input ref={searchRef} value={searchText} onChange={(e) => setSearchText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false) }}
              placeholder="¿Qué estás buscando?" aria-label="Buscar" />
            <button type="submit">BUSCAR <ArrowRight size={15} /></button>
          </form>
        )}
        {menuOpen && (
          <nav className="editorial-mobile-nav" aria-label="Menú móvil">
            <Link to="/" onClick={() => setMenuOpen(false)}>INICIO</Link>
            {navigationCategories.map((cat) => (
              <Link key={cat.slug} to={`/catalogo?categoria=${cat.slug}`}
                onClick={() => setMenuOpen(false)}>{cat.name.toUpperCase()}</Link>
            ))}
            <Link to="/catalogo?sort=newest" onClick={() => setMenuOpen(false)}>NOVEDADES</Link>
            <Link to="/catalogo?featured=true" onClick={() => setMenuOpen(false)}>DESTACADOS</Link>
            <Link to="/favoritos" onClick={() => setMenuOpen(false)}>MIS FAVORITOS</Link>
            {isAuthenticated && <button type="button" onClick={() => { logout(); setMenuOpen(false); navigate('/') }}>CERRAR SESIÓN</button>}
          </nav>
        )}
      </header>

      <main id="store-main-content" tabIndex={-1} className="flex-1"><Outlet /></main>

      <footer className="editorial-footer">
        <div className="editorial-footer-inner">
          <div>
            <Link to="/" className="editorial-logo">{logoSrc ? <img src={logoSrc} alt={storeName} className="max-h-12 max-w-40 object-contain" /> : <>HJ<span>STORE</span><small>VP</small></>}</Link>
            <p>{storeSettings.footer_description || 'Una selección con carácter. Gorras, perfumes, relojes y accesorios para todos los estilos.'}</p>
          </div>
          <div>
            <strong>EXPLORA</strong>
            <Link to="/catalogo">Todos los productos</Link>
            {navigationCategories.map((c) => <Link key={c.slug} to={`/catalogo?categoria=${c.slug}`}>{c.name}</Link>)}
          </div>
          <div>
            <strong>TU CUENTA</strong>
            <Link to="/mi-cuenta">Mis pedidos</Link>
            <Link to="/carrito">Carrito</Link>
            <Link to="/favoritos">Mis favoritos</Link>
            <Link to="/login">Iniciar sesión</Link>
            <Link to="/registro">Crear cuenta</Link>
          </div>
          <div>
            <strong>CONTACTO</strong>
            <p>Atención y envíos en Colombia.</p>
            {storeSettings.contact_email && <a href={`mailto:${storeSettings.contact_email}`}>{storeSettings.contact_email}</a>}
            {storeSettings.contact_phone && <p>{storeSettings.contact_phone}</p>}
            {storeSettings.contact_whatsapp && <a href={`https://wa.me/${storeSettings.contact_whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            {storeSettings.instagram_url && <a href={storeSettings.instagram_url} target="_blank" rel="noopener noreferrer" className="inline-flex gap-2 items-center"><Instagram size={15}/> Instagram</a>}
            {storeSettings.facebook_url && <a href={storeSettings.facebook_url} target="_blank" rel="noopener noreferrer">Facebook</a>}
            {storeSettings.tiktok_url && <a href={storeSettings.tiktok_url} target="_blank" rel="noopener noreferrer">TikTok</a>}
          </div>
        </div>
        <div className="editorial-footer-bottom">
          <span>© {new Date().getFullYear()} {storeName}</span>
          <span>{storeSettings.tagline || 'ESTILO PROPIO'} · COMPRA CON CONFIANZA</span>
          <nav aria-label="Políticas comerciales" className="flex flex-wrap gap-3">
            {[
              ['shipping_policy', 'Envíos', 'envios'],
              ['returns_policy', 'Cambios y devoluciones', 'devoluciones'],
              ['privacy_policy', 'Privacidad', 'privacidad'],
              ['terms_policy', 'Términos', 'terminos'],
            ].filter(([key]) => storeSettings[key]?.trim()).map(([, label, slug]) =>
              <Link key={slug} to={`/politicas/${slug}`}>{label}</Link>
            )}
          </nav>
        </div>
      </footer>
    </div>
  )
}
