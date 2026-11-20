import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'
import ProductCard from './ProductCard'

/**
 * Real storefront merchandise: uses the same ProductCard, stock and cart rules
 * as the catalog. This rail needs no manually uploaded promotional campaigns.
 */
export default function ShopProductCarousel({
  products = [], eyebrow = 'SELECCIÓN HJSTOREVP', title = 'DESCUBRE ALGO NUEVO',
  description = 'Explora piezas que van con tu estilo.',
  link = '/catalogo', sectionId,
}) {
  const track = useRef(null)
  const move = direction => {
    const el = track.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({
      left: direction * Math.max(260, el.clientWidth * 0.82),
      behavior: reduce ? 'instant' : 'smooth',
    })
  }
  if (!products.length) return null
  return <section id={sectionId} className="store-editorial-rail" aria-label={title}>
    <div className="store-editorial-rail-top">
      <div className="store-editorial-rail-copy">
        <span className="store-editorial-rail-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="store-editorial-rail-actions">
        <Link className="store-editorial-rail-viewall" to={link}>
          VER COLECCIÓN <ArrowUpRight size={16} aria-hidden="true"/>
        </Link>
        <button type="button" aria-label={`Desplazar ${title} a la izquierda`}
          onClick={() => move(-1)}><ChevronLeft size={20}/></button>
        <button type="button" aria-label={`Desplazar ${title} a la derecha`}
          onClick={() => move(1)}><ChevronRight size={20}/></button>
      </div>
    </div>
    <div className="store-editorial-rail-track" ref={track} tabIndex={0}
      role="region" aria-roledescription="carrusel" aria-label={title}>
      {products.map(product => <div className="store-editorial-rail-item" key={product.id}>
        <ProductCard product={product} />
      </div>)}
      <Link to={link} className="store-editorial-rail-end">
        <span>HJ / VP</span>
        <strong>ENCUENTRA TU PRÓXIMO FAVORITO</strong>
        <span className="store-editorial-rail-end-button">EXPLORAR CATÁLOGO <ArrowRight size={18}/></span>
      </Link>
    </div>
    <div className="store-editorial-rail-bottom"><span>DESLIZA PARA DESCUBRIR</span><span>HJSTOREVP / COLOMBIA</span></div>
  </section>
}
