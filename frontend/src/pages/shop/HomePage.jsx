import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, ChevronDown, PackageCheck, Truck, CreditCard } from 'lucide-react'
import { productsApi, categoriesApi } from '../../services/api'
import ProductCard from '../../components/shop/ProductCard'
import PersonalizedShowcase from '../../components/shop/PersonalizedShowcase'
import { ErrorState, LoadingGrid } from '../../components/shop/StoreUI'
import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''
const FAQ = [
  { q: '¿Cómo puedo realizar una compra?', a: 'Selecciona tus productos, agrégalos al carrito y continúa al checkout. Allí podrás revisar las opciones de pago disponibles.' },
  { q: '¿Hacen envíos a otras ciudades?', a: 'Sí, atendemos pedidos en Colombia. La disponibilidad y el costo del envío se confirman durante la gestión del pedido.' },
  { q: '¿Dónde puedo revisar mis pedidos?', a: 'Inicia sesión y entra a Mi cuenta para consultar el estado de tus compras.' },
  { q: '¿Qué sucede si un producto se agota?', a: 'Los artículos sin existencias no se pueden agregar al carrito. Puedes revisar otras referencias en el catálogo.' },
]
const imageUrl = (value) => {
  if (!value) return null
  return value.startsWith('http') ? value : `${API_URL}${value}`
}

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
  const heroProduct = featured.find((p) => p.primary_image) || newest.find((p) => p.primary_image)
  const heroImage = imageUrl(heroProduct?.primary_image)
  const showcase = newest.slice(0, 8)

  return (
    <div className="editorial-home">
      <section className="editorial-hero" aria-label="Colección HJStoreVP">
        {heroImage && <div className="editorial-hero-image" style={{ backgroundImage: `url("${heroImage.replaceAll('"', '%22')}")` }} />}
        <div className="editorial-hero-shade" />
        <div className="editorial-hero-content">
          <span className="editorial-hero-kicker">HJSTOREVP / NUEVA TEMPORADA</span>
          <h1>EL ESTILO<br />NO SE EXPLICA.<br /><em>SE LLEVA.</em></h1>
          <p>Una selección de gorras, perfumes, relojes y accesorios para marcar tu propio ritmo.</p>
          <Link to="/catalogo" className="editorial-hero-cta">EXPLORAR COLECCIÓN <ArrowUpRight size={18} /></Link>
        </div>
        <span className="editorial-hero-side">HJSTOREVP · COLOMBIA</span>
        <span className="editorial-hero-number">01 / 03</span>
      </section>

      <section className="editorial-products-section">
        <SectionHeading eyebrow="LO ÚLTIMO EN HJSTOREVP" title="ACABAN DE LLEGAR" link="/catalogo?sort=newest" />
        {loadingNewest ? (
          <LoadingGrid count={8} />
        ) : newestError ? (
          <ErrorState onRetry={() => retryNewest()} description="No pudimos consultar las últimas novedades." />
        ) : showcase.length ? (
          <div className="editorial-product-grid">
            {showcase.map((product) => <ProductCard key={product.id} product={product} label="NUEVO" />)}
          </div>
        ) : (
          <div className="editorial-empty-state">Pronto encontrarás aquí los productos recién agregados. <Link to="/catalogo">Ver catálogo</Link></div>
        )}
      </section>

      <section className="editorial-statement">
        <div className="editorial-statement-content">
          <span>NO ES SOLO UN ACCESORIO</span>
          <h2>HAZ QUE TU<br />ESTILO HABLE.</h2>
          <Link to="/catalogo" className="editorial-hero-cta">COMPRAR AHORA <ArrowUpRight size={18}/></Link>
        </div>
        {heroImage && <div className="editorial-statement-photo" style={{ backgroundImage: `url("${heroImage.replaceAll('"', '%22')}")` }} />}
      </section>

      <section className="editorial-products-section">
        <SectionHeading eyebrow="ELEGIDOS PARA TI" title="PRODUCTOS DESTACADOS" link="/catalogo?featured=true" />
        {loadingFeatured ? (
          <LoadingGrid count={8} />
        ) : featuredError ? (
          <ErrorState onRetry={() => retryFeatured()} description="No pudimos consultar los productos destacados." />
        ) : featured.length ? (
          <div className="editorial-product-grid">
            {featured.map((product) => <ProductCard key={product.id} product={product} label="DESTACADO" />)}
          </div>
        ) : <div className="editorial-empty-state">Explora todas nuestras referencias. <Link to="/catalogo">Ir al catálogo</Link></div>}
      </section>

      <PersonalizedShowcase />

      <section className="editorial-category-section">
        <div className="editorial-section-heading">
          <div><span className="editorial-eyebrow">ENCUENTRA LO TUYO</span><h2>EXPLORA POR CATEGORÍA</h2></div>
        </div>
        <div className="editorial-category-grid">
          {featuredCategories.map((category, index) => (
            <Link key={category.slug} to={`/catalogo?categoria=${category.slug}`} className="editorial-category-tile">
              <span className="editorial-category-number">{String(index + 1).padStart(2, '0')} / {String(featuredCategories.length).padStart(2, '0')}</span>
              <div><h3>{category.name.toUpperCase()}</h3><p>{category.description || 'Encuentra tus favoritos en esta categoría'}</p></div>
              <ArrowUpRight size={25} strokeWidth={1.4} />
            </Link>
          ))}
        </div>
      </section>

      <section className="editorial-service-strip">
        <div><Truck size={25} strokeWidth={1.4}/><h3>ENVÍOS A COLOMBIA</h3><p>Compra desde donde estés</p></div>
        <div><CreditCard size={25} strokeWidth={1.4}/><h3>OPCIONES DE PAGO</h3><p>Consulta los medios disponibles al pagar</p></div>
        <div><PackageCheck size={25} strokeWidth={1.4}/><h3>CONSULTA TUS PEDIDOS</h3><p>Sigue tus compras desde tu cuenta</p></div>
      </section>

      <section className="editorial-faq-section">
        <span className="editorial-eyebrow">¿TIENES DUDAS?</span>
        <h2>PREGUNTAS FRECUENTES</h2>
        <div className="editorial-faq-items">
          {FAQ.map((item, i) => (
            <div key={item.q} className="editorial-faq-item">
              <button type="button" onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                aria-expanded={openFaq === i}>
                <span>{item.q}</span><ChevronDown size={18} className={openFaq === i ? 'rotate-180' : ''}/>
              </button>
              {openFaq === i && <p>{item.a}</p>}
            </div>
          ))}
        </div>
      </section>
      <section className="editorial-closing">
        <span>HJSTOREVP / ESTILO PROPIO</span>
        <h2>ENCUENTRA TU SIGUIENTE FAVORITO.</h2>
        <Link to="/catalogo">DESCUBRIR PRODUCTOS <ArrowRight size={16}/></Link>
      </section>
    </div>
  )
}
