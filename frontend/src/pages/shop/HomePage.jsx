import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, PackageCheck, Truck, CreditCard } from 'lucide-react'
import { productsApi, categoriesApi, storefrontSettingsApi } from '../../services/api'
import ProductCard from '../../components/shop/ProductCard'
import PersonalizedShowcase from '../../components/shop/PersonalizedShowcase'
import HomeVisualBlocks from '../../components/shop/HomeVisualBlocks'
import ShopProductCarousel from '../../components/shop/ShopProductCarousel'
import { ErrorState, LoadingGrid } from '../../components/shop/StoreUI'
import { useState } from 'react'
import useAutoCarousel from '../../hooks/useAutoCarousel'

const API_URL = import.meta.env.VITE_API_URL || ''
const sourceUrl = (value) => value?.startsWith('/') ? `${API_URL}${value}` : value
const FAQ = [
  { q: '¿Cómo puedo realizar una compra?', a: 'Selecciona tus productos, agrégalos al carrito y continúa al checkout. Allí podrás revisar las opciones de pago disponibles.' },
  { q: '¿Hacen envíos a otras ciudades?', a: 'Sí, atendemos pedidos en Colombia. La disponibilidad y el costo del envío se confirman durante la gestión del pedido.' },
  { q: '¿Dónde puedo revisar mis pedidos?', a: 'Inicia sesión y entra a Mi cuenta para consultar el estado de tus compras.' },
  { q: '¿Qué sucede si un producto se agota?', a: 'Los artículos sin existencias no se pueden agregar al carrito. Puedes revisar otras referencias en el catálogo.' },
]
function SectionHeading({ eyebrow, title, link = '/catalogo', action = 'VER TODO' }) {
  return (
    <div className="editorial-section-heading">
      <div>
        {eyebrow && <span className="editorial-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      <Link to={link} className="editorial-view-all">{action} <ArrowRight size={15} /></Link>
    </div>
  )
}

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState(-1)
  const { data: storeSettings = {} } = useQuery({
    queryKey: ['storefront-settings-public'],
    queryFn: () => storefrontSettingsApi.public().then(({ data }) => data),
    staleTime: 15000,
    refetchInterval: 60000, // Permite activar o retirar campañas sin recargar la página.
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['storefront-categories'],
    queryFn: () => categoriesApi.list().then((r) => r.data),
  })
  const featuredCategories = categories.filter((c) => c.active !== false).slice(0, 10)
  const { data: newest = [], isLoading: loadingNewest, isError: newestError, refetch: retryNewest } = useQuery({
    queryKey: ['products', 'newest', 'editorial'],
    queryFn: () => productsApi.list({ per_page: 10, sort: 'newest' }).then((r) => r.data),
  })
  const { data: featured = [], isLoading: loadingFeatured, isError: featuredError, refetch: retryFeatured } = useQuery({
    queryKey: ['products', 'featured', 'editorial'],
    queryFn: () => productsApi.list({ featured: true, per_page: 8 }).then((r) => r.data),
  })
  // Solo la galería publicada aparece en portada. El campo hero_image_url
  // heredado no se reutiliza: puede contener imágenes antiguas incorrectas.
  const [failedHeroImages, setFailedHeroImages] = useState([])
  const heroImages = (Array.isArray(storeSettings.hero_images) ? storeSettings.hero_images : [])
    .filter((url) => typeof url === 'string' && url.trim() && !failedHeroImages.includes(url))
  const heroPresentation = storeSettings.hero_presentation || {}
  const statementPresentation = storeSettings.statement_presentation || {}
  const heroPlayback = storeSettings.hero_carousel_settings || {}
  const statementPlayback = storeSettings.statement_carousel_settings || {}
  const carousel = useAutoCarousel(heroImages.length, heroPlayback.interval_ms ?? 6000,
    heroImages.join('|'), heroPlayback.autoplay ?? true)
  const activeHeroImage = heroImages[carousel.index]
  const [failedStatementImages, setFailedStatementImages] = useState([])
  const statementImages = (Array.isArray(storeSettings.statement_images) ? storeSettings.statement_images : [])
    .filter((url) => typeof url === 'string' && url.trim() && !failedStatementImages.includes(url))
  const statementCarousel = useAutoCarousel(statementImages.length,
    statementPlayback.interval_ms ?? 6000, statementImages.join('|'), statementPlayback.autoplay ?? true)
  const activeStatementImage = statementImages[statementCarousel.index]
  const campaignBanners = (Array.isArray(storeSettings.homepage_banners) ? storeSettings.homepage_banners : [])
    .filter((banner) => banner?.active && banner?.image_url && banner?.title)
  // Dos formatos distintos, sin volver a mostrar exactamente las mismas fichas.
  const showNewestCarousel = newest.filter(product => product?.primary_image).length >= 4
  const showcase = newest.slice(0, 4)
  const alreadyDisplayedIds = new Set((showNewestCarousel
    ? newest.filter(product => product?.primary_image)
    : showcase).map(product => product.id))
  const featuredShowcase = featured.filter(product =>
    !alreadyDisplayedIds.has(product.id)).slice(0, 4)
  // Nuevos carruseles vivos: muestran fotos de los productos disponibles en el catálogo.
  // No dependen de campañas creadas manualmente desde el administrador.
  const latestWithPhotos = newest.filter(product => product?.primary_image)
  const savedCategoryPhotos = Array.isArray(storeSettings.homepage_category_tiles)
    ? storeSettings.homepage_category_tiles : []
  // Solo fotografías elegidas por el superadministrador para uso editorial.
  // Nunca promocionar automáticamente un archivo de producto como imagen de categoría.
  const categoriesWithPhotos = savedCategoryPhotos
    .filter(tile => tile.image_url)
    .map(tile => {
      const category = featuredCategories.find(item => item.slug === tile.category_slug)
      return category ? { ...category, title: tile.title || category.name,
        image_url: tile.image_url, mobile_image_url: tile.mobile_image_url } : null
    }).filter(Boolean)
  const loyalty = storeSettings.homepage_loyalty_banner
  const DEFAULT_ORDER = ['newest', 'statement', 'featured', 'campaigns', 'personalized',
    'visual', 'categories', 'loyalty', 'services', 'faq', 'closing']
  const rawOrder = storeSettings.homepage_section_order
  const savedOrder = Array.isArray(rawOrder) ? [...rawOrder] : []
  for (const [id, after] of [['visual', 'campaigns'], ['loyalty', 'categories']]) {
    if (!savedOrder.includes(id)) savedOrder.splice(savedOrder.indexOf(after) + 1, 0, id)
  }
  const customSections = Array.isArray(storeSettings.homepage_custom_sections)
    ? storeSettings.homepage_custom_sections : []
  const customIds = customSections.map(block => 'custom:' + block.id)
  const allowedIds = [...DEFAULT_ORDER, ...customIds]
  const knownOrder = savedOrder.filter(id => allowedIds.includes(id))
  const sectionOrder = [...new Set([...knownOrder, ...allowedIds])]
  const hiddenSections = Array.isArray(storeSettings.homepage_hidden_sections)
    ? storeSettings.homepage_hidden_sections : []
  const sectionStyle = (id) => ({
    order: sectionOrder.indexOf(id) + 1,
    display: hiddenSections.includes(id) ? 'none' : undefined,
  })

  return (
    <div className="editorial-home">
      <section className={`store-home-hero ${heroImages.length ? "store-home-hero--immersive" : ""}`}
        style={{ '--visual-shade': String((heroPresentation.overlay_opacity ?? 65)/100),
          '--visual-align': heroPresentation.text_align || 'left',
          '--visual-position': heroPresentation.text_position || 'center' }}
        aria-label="Colección HJStoreVP">
        <div className="store-home-hero-grid">
          <div className="store-home-hero-copy">
            <div className="store-home-hero-kicker"><span className="store-home-hero-dot" aria-hidden="true" />{storeSettings.hero_eyebrow || 'HJSTOREVP · ESTILO PROPIO'}</div>
            <h1>{storeSettings.hero_title || 'EL ESTILO NO SE EXPLICA. SE LLEVA.'}</h1>
            <p>{storeSettings.hero_description || 'Gorras, perfumes, relojes y accesorios para construir tu propio estilo.'}</p>
            <div className="store-home-hero-buttons">
              <Link to="/catalogo" className="store-home-hero-primary">
                {storeSettings.hero_button || 'EXPLORAR COLECCIÓN'} <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/catalogo?sort=newest" className="store-home-hero-secondary">
                VER NOVEDADES <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <span className="store-home-hero-footnote">SELECCIÓN DE ACCESORIOS · COLOMBIA</span>
          </div>
          <div className={`store-home-hero-art store-home-hero-carousel ${activeHeroImage ? 'has-image' : ''}`}
            onMouseEnter={() => carousel.setPaused(true)}
            onMouseLeave={() => carousel.setPaused(false)}
            onFocusCapture={() => carousel.setPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) carousel.setPaused(false)
            }}
            aria-label="Carrusel de imágenes promocionales">
            {activeHeroImage ? (
              <img key={activeHeroImage} className="store-home-hero-carousel-image"
                src={sourceUrl(activeHeroImage)} alt={`Imagen promocional ${carousel.index + 1} de HJStoreVP`}
                onError={() => setFailedHeroImages((previous) =>
                  previous.includes(activeHeroImage) ? previous : [...previous, activeHeroImage])}
                decoding="async" loading="eager" fetchPriority="high" />
            ) : (
              <div className="store-home-hero-fallback" aria-label="Identidad de HJStoreVP">
                <div className="store-home-hero-orbit" aria-hidden="true" />
                <span className="store-home-hero-art-top">CURATED / HJSTOREVP</span>
                <div className="store-home-hero-art-center">
                  <span>ESTILO</span>
                  <strong>PROPIO<span className="store-home-hero-art-period">.</span></strong>
                </div>
                <div className="store-home-hero-art-bottom">
                  <span>DETAILS MAKE THE DIFFERENCE</span>
                  <span>HJSTOREVP</span>
                </div>
              </div>
            )}
            {heroImages.length > 1 && (heroPlayback.show_navigation ?? true) && (
              <div className="store-home-hero-carousel-controls" aria-label="Controles del carrusel">
                <button type="button" onClick={() => carousel.goTo(carousel.index - 1)}
                  aria-label="Imagen promocional anterior"><ChevronLeft size={19}/></button>
                <div className="store-home-hero-carousel-dots">
                  {heroImages.map((url, index) => (
                    <button key={url} type="button" className={index === carousel.index ? 'active' : ''}
                      aria-label={`Ver imagen promocional ${index + 1}`}
                      aria-current={index === carousel.index ? 'true' : undefined}
                      onClick={() => carousel.goTo(index)} />
                  ))}
                </div>
                <button type="button" onClick={() => carousel.goTo(carousel.index + 1)}
                  aria-label="Imagen promocional siguiente"><ChevronRight size={19}/></button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div style={sectionStyle("newest")}>
        {showNewestCarousel ? (
          <ShopProductCarousel sectionId="coleccion-en-movimiento"
            products={latestWithPhotos}
            eyebrow="01 / RECIÉN LLEGADOS"
            title="ACABAN DE LLEGAR."
            description="Descubre las últimas referencias de nuestra colección."
            link="/catalogo?sort=newest" />
        ) : (
          <section className="editorial-products-section store-home-products">
            <SectionHeading eyebrow="01 / LO ÚLTIMO EN HJSTOREVP"
              title="ACABAN DE LLEGAR" link="/catalogo?sort=newest" />
            {loadingNewest ? (
              <LoadingGrid count={4} />
            ) : newestError ? (
              <ErrorState onRetry={() => retryNewest()}
                description="No pudimos consultar las últimas novedades." />
            ) : showcase.length ? (
              <div className="editorial-product-grid">
                {showcase.map(product => <ProductCard key={product.id}
                  product={product} label="NUEVO" />)}
              </div>
            ) : (
              <div className="editorial-empty-state">Pronto encontrarás aquí nuestros productos.
                <Link to="/catalogo"> Ver catálogo</Link>
              </div>
            )}
          </section>
        )}
      </div>

      <section className="store-home-statement" style={{
        ...sectionStyle("statement"),
        '--visual-shade': String((statementPresentation.overlay_opacity ?? 65)/100),
        '--visual-align': statementPresentation.text_align || 'left',
        '--visual-position': statementPresentation.text_position || 'center',
      }} aria-label="Nuestra filosofía de estilo">
        <div className="store-home-statement-copy">
          <span>NO ES SOLO UN ACCESORIO</span>
          <h2>HAZ QUE TU<br />ESTILO HABLE.</h2>
          <p>Una buena elección transforma lo cotidiano. Encuentra las piezas que van contigo.</p>
          <Link to="/catalogo" className="store-home-statement-link">
            DESCUBRIR PRODUCTOS <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className={`store-home-statement-media ${activeStatementImage ? 'has-image' : ''}`}
          onMouseEnter={() => statementCarousel.setPaused(true)}
          onMouseLeave={() => statementCarousel.setPaused(false)}
          onFocusCapture={() => statementCarousel.setPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) statementCarousel.setPaused(false)
          }}>
          {activeStatementImage ? (
            <img className="store-home-statement-image" key={activeStatementImage}
              src={sourceUrl(activeStatementImage)}
              alt={`Imagen de campaña de estilo ${statementCarousel.index + 1}`}
              decoding="async" loading="lazy" fetchPriority="low"
              onError={() => setFailedStatementImages((current) =>
                current.includes(activeStatementImage) ? current : [...current, activeStatementImage])}
            />
          ) : (
            <div className="store-home-statement-mark" aria-hidden="true">HJ<span>VP</span></div>
          )}
          {statementImages.length > 1 && (statementPlayback.show_navigation ?? true) && (
            <div className="store-home-statement-controls" aria-label="Carrusel de campaña">
              <button type="button" aria-label="Imagen anterior"
                onClick={() => statementCarousel.goTo(statementCarousel.index - 1)}><ChevronLeft size={18}/></button>
              <span aria-live="off">{statementCarousel.index + 1} / {statementImages.length}</span>
              <button type="button" aria-label="Imagen siguiente"
                onClick={() => statementCarousel.goTo(statementCarousel.index + 1)}><ChevronRight size={18}/></button>
            </div>
          )}
        </div>
      </section>

      {(loadingFeatured || featuredError || featuredShowcase.length > 0) && (
        <section className="editorial-products-section store-home-featured"
          style={sectionStyle("featured")}>
          <SectionHeading eyebrow="02 / SELECCIÓN HJSTOREVP"
            title="PIEZAS QUE DESTACAN" link="/catalogo?featured=true" />
          {loadingFeatured ? (
            <LoadingGrid count={4} />
          ) : featuredError ? (
            <ErrorState onRetry={() => retryFeatured()}
              description="No pudimos consultar los productos destacados." />
          ) : (
            <div className="editorial-product-grid">
              {featuredShowcase.map(product => <ProductCard key={product.id}
                product={product} label="DESTACADO" />)}
            </div>
          )}
        </section>
      )}

      {campaignBanners.length > 0 && (
        <section className="w-full bg-white" style={sectionStyle("campaigns")} aria-label="Campañas destacadas">
          <div className="editorial-section-heading px-5 sm:px-8">
            <div><span className="editorial-eyebrow">DESCUBRE MÁS</span><h2>COLECCIONES Y CAMPAÑAS</h2></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {campaignBanners.map((banner, index) => (
              <Link key={`${banner.image_url}-${index}`} to={banner.link || '/catalogo'}
                style={{ '--visual-shade': String((banner.overlay_opacity ?? 65) / 100),
                  '--visual-align': banner.text_align || 'left',
                  '--visual-position': banner.text_position || 'bottom' }}
                className="store-campaign-presentation relative block overflow-hidden bg-neutral-900 text-white group min-h-[380px] sm:min-h-[480px]">
                <picture>
                  {banner.mobile_image_url && <source media="(max-width: 767px)" srcSet={sourceUrl(banner.mobile_image_url)} />}
                  <img src={sourceUrl(banner.image_url)} alt={banner.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy" decoding="async" />
                </picture>
                <div className="store-campaign-presentation-shade absolute inset-0" aria-hidden="true" />
                <div className="store-campaign-presentation-copy absolute left-0 right-0 p-7 sm:p-10">
                  {banner.subtitle && <p className="text-xs font-bold tracking-[.16em] uppercase mb-2">{banner.subtitle}</p>}
                  <h3 className="text-3xl sm:text-5xl font-black uppercase leading-tight">{banner.title}</h3>
                  <span className="inline-flex mt-5 bg-white text-black px-5 py-3 text-xs font-black uppercase items-center gap-2">
                    {banner.button_text || 'DESCUBRIR'} <ArrowUpRight size={16} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div style={sectionStyle("personalized")}><PersonalizedShowcase /></div>
      <HomeVisualBlocks blocks={Array.isArray(storeSettings.homepage_visual_blocks)
        ? storeSettings.homepage_visual_blocks : []} style={sectionStyle("visual")} />

      <section className="editorial-category-section store-home-categories" style={sectionStyle("categories")}>
        {categoriesWithPhotos.length > 0 && (
          <div className="store-photo-category-feature">
            <div className="store-photo-category-title">
              <span>ESTILO POR CATEGORÍA / HJSTOREVP</span>
              <h2>ENCUENTRA LO QUE TE DEFINE.</h2>
              <p>Recorre nuestras categorías a través de las fotografías reales del catálogo.</p>
            </div>
            <div className="store-photo-category-tiles"
              style={{ '--category-photo-columns': Math.min(categoriesWithPhotos.length, 4) }}>
              {categoriesWithPhotos.map(category => (
                <Link key={category.slug} className="store-photo-category-tile"
                  to={`/catalogo?categoria=${encodeURIComponent(category.slug)}`}>
                  <picture>
                    {category.mobile_image_url && <source media="(max-width: 767px)"
                      srcSet={sourceUrl(category.mobile_image_url)}/>}
                    <img src={sourceUrl(category.image_url)} alt={category.name}
                      loading="lazy" decoding="async"/>
                  </picture>
                  <span className="store-photo-category-label">
                    <strong>{category.title}</strong><ArrowUpRight size={19} aria-hidden="true"/>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="editorial-section-heading">
          <div><span className="editorial-eyebrow">ENCUENTRA LO TUYO</span><h2>EXPLORA POR CATEGORÍA</h2></div>
        </div>
        <div className="editorial-category-grid">
          {featuredCategories.map((category, index) => (
            <Link key={category.slug} to={`/catalogo?categoria=${encodeURIComponent(category.slug)}`} className="editorial-category-tile">
              <span className="editorial-category-number">{String(index + 1).padStart(2, '0')} / {String(featuredCategories.length).padStart(2, '0')}</span>
              <div><h3>{category.name.toUpperCase()}</h3><p>{category.description || 'Encuentra tus favoritos en esta categoría'}</p></div>
              <ArrowUpRight size={25} strokeWidth={1.4} />
            </Link>
          ))}
        </div>
      </section>

      {loyalty?.active && loyalty?.image_url && (
        <section className="store-loyalty-campaign" style={{
          ...sectionStyle("loyalty"),
          '--visual-shade': String((loyalty.overlay_opacity ?? 65) / 100),
          '--visual-align': loyalty.text_align || 'left',
          '--visual-position': loyalty.text_position || 'bottom',
        }}
          aria-label="Club de clientes HJStoreVP">
          <picture className="store-loyalty-campaign-image">
            {loyalty.mobile_image_url && <source media="(max-width: 767px)"
              srcSet={sourceUrl(loyalty.mobile_image_url)}/>}
            <img src={sourceUrl(loyalty.image_url)} alt="Campaña del club de clientes"
              decoding="async" loading="lazy"/>
          </picture>
          <div className="store-loyalty-campaign-shade" aria-hidden="true"/>
          <div className="store-loyalty-campaign-copy">
            {loyalty.eyebrow && <span>{loyalty.eyebrow}</span>}
            <h2>{loyalty.title}</h2>
            {loyalty.description && <p>{loyalty.description}</p>}
            <Link to={loyalty.link || '/mi-cuenta'}>
              {loyalty.button_text || 'DESCUBRIR'} <ArrowUpRight size={18}/>
            </Link>
          </div>
        </section>
      )}

      {customSections.map(block => (
        <HomeVisualBlocks key={block.id} blocks={[block]}
          style={sectionStyle('custom:' + block.id)} />
      ))}

      <section className="editorial-service-strip store-home-services" style={sectionStyle("services")}>
        <div><Truck size={25} strokeWidth={1.4}/><h3>ENVÍOS A COLOMBIA</h3><p>Compra desde donde estés</p></div>
        <div><CreditCard size={25} strokeWidth={1.4}/><h3>OPCIONES DE PAGO</h3><p>Consulta los medios disponibles al pagar</p></div>
        <div><PackageCheck size={25} strokeWidth={1.4}/><h3>CONSULTA TUS PEDIDOS</h3><p>Sigue tus compras desde tu cuenta</p></div>
      </section>

      <section className="editorial-faq-section store-home-faq" style={sectionStyle("faq")}>
        <span className="editorial-eyebrow">¿TIENES DUDAS?</span>
        <h2>PREGUNTAS FRECUENTES</h2>
        <div className="editorial-faq-items">
          {FAQ.map((item, i) => (
            <div key={item.q} className="editorial-faq-item">
              <button type="button" id={`store-faq-question-${i}`}
                aria-controls={`store-faq-answer-${i}`}
                onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                aria-expanded={openFaq === i}>
                <span>{item.q}</span><ChevronDown size={18} className={openFaq === i ? 'rotate-180' : ''}/>
              </button>
              {openFaq === i && (
                <p id={`store-faq-answer-${i}`} role="region"
                  aria-labelledby={`store-faq-question-${i}`}>{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="editorial-closing store-home-closing" style={sectionStyle("closing")}>
        <span>HJSTOREVP / ESTILO PROPIO</span>
        <h2>ENCUENTRA TU SIGUIENTE FAVORITO.</h2>
        <Link to="/catalogo">DESCUBRIR PRODUCTOS <ArrowRight size={16}/></Link>
      </section>
    </div>
  )
}
