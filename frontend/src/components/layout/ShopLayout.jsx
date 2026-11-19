import { Outlet, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { ShoppingBag, UserRound, Search, Menu, X, ArrowRight, Instagram, Heart } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoriesApi, storefrontSettingsApi, productsApi } from '../../services/api'
import hjShield from '../../assets/hj-shield.svg'
import MiniCartDrawer from '../shop/MiniCartDrawer'
import { useCartStore, useAuthStore, useWishlistStore } from '../../store'


export default function ShopLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const closeCart = useCallback(() => setCartOpen(false), [])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(-1)
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
    setCartOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!menuOpen && !searchOpen) return undefined
    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setSearchOpen(false)
      }
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [menuOpen, searchOpen])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 280)
    return () => window.clearTimeout(timer)
  }, [searchText])

  const { data: searchResults = [], isFetching: searchBusy } = useQuery({
    queryKey: ['store-header-search', debouncedSearch],
    queryFn: () => productsApi.list({ search: debouncedSearch, per_page: 6, page: 1 })
      .then((response) => response.data),
    enabled: searchOpen && debouncedSearch.length >= 2,
    staleTime: 30000,
  })

  const suggestedProducts = Array.isArray(searchResults) ? searchResults : []
  const displayedSuggestions = debouncedSearch.length >= 2 ? suggestedProducts : []
  const selectSuggestion = (slug) => {
    setSearchOpen(false)
    setSearchText('')
    setHighlightedSuggestion(-1)
    navigate(`/producto/${encodeURIComponent(slug)}`)
  }

  const handleSearch = (event) => {
    event.preventDefault()
    const query = searchText.trim()
    if (!query) return
    navigate(`/catalogo?q=${encodeURIComponent(query)}`)
    setSearchText('')
    setHighlightedSuggestion(-1)
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
          <Link to="/" className="editorial-logo store-brand-lockup" aria-label={`${storeName}, inicio`}>
            {logoSrc ? <img src={logoSrc} alt={storeName} className="store-custom-header-logo" /> : (
              <>
                <img src={hjShield} alt="" aria-hidden="true" className="store-brand-emblem" />
                <span className="store-brand-name">STORE<small>VP</small></span>
              </>
            )}
          </Link>
          <nav className="editorial-nav" aria-label="Navegación principal">
            <NavLink to="/" end>INICIO</NavLink>
            <NavLink to="/catalogo">CATÁLOGO</NavLink>
            {navigationCategories.slice(0, 4).map((cat) => (
              <Link key={cat.slug} to={`/catalogo?categoria=${encodeURIComponent(cat.slug)}`}>{cat.name.toUpperCase()}</Link>
            ))}
            <Link to="/catalogo?sort=newest">NOVEDADES</Link>
            <Link to="/catalogo?featured=true" className="editorial-sale">DESTACADOS</Link>
          </nav>
          <div className="editorial-actions">
            <button type="button" onClick={() => { setSearchOpen((v) => !v); setMenuOpen(false) }}
              aria-label="Buscar productos" aria-controls="store-search-panel" aria-expanded={searchOpen}>
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
            <button type="button" className="editorial-bag"
              onClick={() => { setCartOpen(true); setSearchOpen(false); setMenuOpen(false) }}
              aria-controls="store-mini-cart" aria-expanded={cartOpen}
              aria-label={`Abrir mini-carrito, ${cartCount} unidades`}>
              <ShoppingBag size={19} strokeWidth={1.5} />
              {cartCount > 0 && <span>{cartCount > 99 ? '99+' : cartCount}</span>}
            </button>
            <button type="button" className="editorial-menu-toggle lg:hidden"
              onClick={() => { setMenuOpen((v) => !v); setSearchOpen(false) }}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-controls="store-mobile-menu" aria-expanded={menuOpen}>
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
        {searchOpen && (
          <div id="store-search-panel" className="store-search-shell">
            <form className="editorial-search" role="search" onSubmit={handleSearch}>
              <Search size={19} strokeWidth={1.5} aria-hidden="true"/>
              <input ref={searchRef} value={searchText}
                onChange={(event) => { setSearchText(event.target.value); setHighlightedSuggestion(-1) }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSearchOpen(false)
                  if (event.key === 'ArrowDown' && displayedSuggestions.length) {
                    event.preventDefault()
                    setHighlightedSuggestion((index) => Math.min(displayedSuggestions.length - 1, index + 1))
                  }
                  if (event.key === 'ArrowUp' && displayedSuggestions.length) {
                    event.preventDefault()
                    setHighlightedSuggestion((index) => Math.max(-1, index - 1))
                  }
                  if (event.key === 'Enter' && highlightedSuggestion >= 0 && displayedSuggestions[highlightedSuggestion]) {
                    event.preventDefault()
                    selectSuggestion(displayedSuggestions[highlightedSuggestion].slug)
                  }
                }}
                placeholder="Busca por nombre o referencia" aria-label="Buscar productos"
                aria-autocomplete="list" aria-controls="store-search-suggestions"
                aria-expanded={displayedSuggestions.length > 0}
                aria-activedescendant={highlightedSuggestion >= 0 ? `store-search-option-${highlightedSuggestion}` : undefined}
                role="combobox" autoComplete="off" type="search"/>
              <button type="submit" disabled={!searchText.trim()}>VER RESULTADOS <ArrowRight size={15}/></button>
            </form>
            <div id="store-search-suggestions" className="store-search-suggestions" role="listbox"
              aria-label="Sugerencias de productos">
              {debouncedSearch.length < 2 ? (
                <p className="store-search-assist">Escribe al menos dos letras para encontrar productos.</p>
              ) : searchBusy ? (
                <p className="store-search-assist" role="status">Buscando productos...</p>
              ) : displayedSuggestions.length ? (
                displayedSuggestions.map((item, index) => (
                  <button id={`store-search-option-${index}`} key={item.id}
                    type="button" role="option" aria-selected={highlightedSuggestion === index}
                    className={`store-search-suggestion ${highlightedSuggestion === index ? 'is-active' : ''}`}
                    onMouseEnter={() => setHighlightedSuggestion(index)}
                    onClick={() => selectSuggestion(item.slug)}>
                    <span className="store-search-suggestion-title">{item.name}</span>
                    <span className="store-search-suggestion-meta">
                      {item.category_name || 'Catálogo'} · {new Intl.NumberFormat('es-CO',
                        { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(item.sale_price || 0))}
                    </span>
                  </button>
                ))
              ) : (
                <p className="store-search-assist">Sin coincidencias. Puedes buscar en todo el catálogo.</p>
              )}
              {debouncedSearch.length >= 2 && (
                <button type="button" className="store-search-all"
                  onClick={() => {
                    navigate(`/catalogo?q=${encodeURIComponent(searchText.trim())}`)
                    setSearchOpen(false)
                    setSearchText('')
                  }}>
                  VER TODOS LOS RESULTADOS <ArrowRight size={14}/>
                </button>
              )}
            </div>
          </div>
        )}
        {menuOpen && (
          <nav id="store-mobile-menu" className="editorial-mobile-nav" aria-label="Menú móvil">
            <Link to="/catalogo" onClick={() => setMenuOpen(false)}>VER TODO EL CATÁLOGO</Link>
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

      <footer className="editorial-footer store-footer-compact">
        <div className="store-footer-main">
          <div className="store-footer-brand">
            <Link to="/" className="editorial-logo store-brand-lockup store-brand-light"
              aria-label={`${storeName}, volver al inicio`}>
              <img src={hjShield} alt="" aria-hidden="true" className="store-brand-emblem" />
              <span className="store-brand-name">STORE<small>VP</small></span>
            </Link>
            <p>GORRAS Y ALGO MÁS</p>
          </div>
          <nav className="store-footer-primary-links" aria-label="Enlaces rápidos">
            <Link to="/catalogo">Catálogo</Link>
            <Link to="/mi-cuenta">Mis pedidos</Link>
            <Link to="/carrito">Carrito</Link>
            <Link to="/favoritos">Favoritos</Link>
          </nav>
          <div className="store-footer-contact" aria-label="Contacto y redes sociales">
            {storeSettings.contact_email && (
              <a href={`mailto:${storeSettings.contact_email}`} aria-label="Correo de contacto">Correo</a>
            )}
            {storeSettings.contact_whatsapp && (
              <a href={`https://wa.me/${String(storeSettings.contact_whatsapp).replace(/\D/g, '')}`}
                target="_blank" rel="noopener noreferrer">WhatsApp</a>
            )}
            {storeSettings.instagram_url && (
              <a href={storeSettings.instagram_url} target="_blank"
                rel="noopener noreferrer" aria-label="Instagram de la tienda">
                <Instagram size={17} aria-hidden="true" /> Instagram
              </a>
            )}
            {!storeSettings.contact_email && !storeSettings.contact_whatsapp && !storeSettings.instagram_url && (
              <span>Compras y atención en Colombia</span>
            )}
          </div>
        </div>
        <div className="store-footer-bottom">
          <span className="store-footer-copyright">© {new Date().getFullYear()} {storeName}. Todos los derechos reservados.</span>
          <nav aria-label="Información legal y políticas de la tienda">
            {[
              ['shipping_policy', 'Envíos', 'envios'],
              ['returns_policy', 'Devoluciones', 'devoluciones'],
              ['privacy_policy', 'Privacidad', 'privacidad'],
              ['terms_policy', 'Términos', 'terminos'],
            ].filter(([key]) => storeSettings[key]?.trim()).map(([, label, slug]) => (
              <Link key={slug} to={`/politicas/${slug}`}>{label}</Link>
            ))}
          </nav>
        </div>
      </footer>
      <MiniCartDrawer open={cartOpen} onClose={closeCart}/>
    </div>
  )
}
