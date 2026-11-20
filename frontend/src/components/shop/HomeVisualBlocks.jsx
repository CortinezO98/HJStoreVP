import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || ''
const sourceUrl = value => value?.startsWith('/') ? `${API_URL}${value}` : value

function VisualTile({ item, priority = false }) {
  return (
    <Link to={item.link || '/catalogo'} className="home-visual-tile group" aria-label={item.title || 'Ver colección'}>
      <picture>
        {item.mobile_image_url && <source media="(max-width: 767px)" srcSet={sourceUrl(item.mobile_image_url)} />}
        <img src={sourceUrl(item.image_url)} alt={item.title || 'Campaña HJStoreVP'}
          loading={priority ? 'eager' : 'lazy'} decoding="async" />
      </picture>
      <div className="home-visual-tile-shade" aria-hidden="true" />
      <div className="home-visual-tile-copy">
        {item.subtitle && <p>{item.subtitle}</p>}
        {item.title && <h3>{item.title}</h3>}
        <span>{item.button_text || 'VER AHORA'} <ArrowUpRight size={17} aria-hidden="true" /></span>
      </div>
    </Link>
  )
}

function CarouselBlock({ block }) {
  const track = useRef(null)
  const move = (direction) => {
    const el = track.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior:
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  return (
    <div className="home-visual-carousel">
      <div className="home-visual-carousel-track" ref={track}
        role="region" tabIndex={0} aria-label={block.title || 'Carrusel de campañas'}>
        {block.items.map((item, index) => <div className="home-visual-carousel-slide" key={index}>
          <VisualTile item={item} />
        </div>)}
      </div>
      {block.items.length > 1 && <div className="home-visual-carousel-controls">
        <button type="button" aria-label="Desplazar a la izquierda" onClick={() => move(-1)}><ChevronLeft size={22}/></button>
        <button type="button" aria-label="Desplazar a la derecha" onClick={() => move(1)}><ChevronRight size={22}/></button>
      </div>}
    </div>
  )
}

function MosaicBlock({ block }) {
  return (
    <div className="home-visual-mosaic">
      {block.items.map((item, index) => <VisualTile key={index} item={item} />)}
    </div>
  )
}

export default function HomeVisualBlocks({ blocks = [], style }) {
  if (!blocks.length) return null
  return (
    <section className="home-visual-blocks" style={style} aria-label="Galerías y campañas especiales">
      {blocks.map(block => {
        if (!block.active || !block.items?.length) return null
        const valid = block.items.filter(item => item.image_url)
        if (!valid.length) return null
        const visibleBlock = { ...block, items: valid }
        return <div className="home-visual-block" key={block.id}>
          {block.title && <h2 className="home-visual-block-title">{block.title}</h2>}
          {block.type === 'carousel' ? <CarouselBlock block={visibleBlock}/> :
            block.type === 'mosaic' ? <MosaicBlock block={visibleBlock}/> :
              <div className="home-visual-wide"><VisualTile item={valid[0]} /></div>}
        </div>
      })}
    </section>
  )
}
