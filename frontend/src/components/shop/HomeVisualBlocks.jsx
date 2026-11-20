import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'
import useAutoCarousel from '../../hooks/useAutoCarousel'

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
  const items = block.items
  const carousel = useAutoCarousel(items.length, 6000, block.id + ':' + items.map(i => i.image_url).join('|'))
  return (
    <div className="home-visual-carousel" onMouseEnter={() => carousel.setPaused(true)}
      onMouseLeave={() => carousel.setPaused(false)}
      onFocusCapture={() => carousel.setPaused(true)}
      onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) carousel.setPaused(false) }}>
      <VisualTile item={items[carousel.index]} />
      {items.length > 1 && <div className="home-visual-carousel-controls">
        <button type="button" aria-label="Imagen anterior" onClick={() => carousel.goTo(carousel.index - 1)}><ChevronLeft size={22}/></button>
        <span aria-live="off">{carousel.index + 1} / {items.length}</span>
        <button type="button" aria-label="Imagen siguiente" onClick={() => carousel.goTo(carousel.index + 1)}><ChevronRight size={22}/></button>
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
