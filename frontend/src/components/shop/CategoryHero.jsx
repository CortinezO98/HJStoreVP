import { Link } from 'react-router-dom'

const DESCRIPTIONS = {
  gorras: 'Gorras para todos los estilos. Encuentra referencias que van contigo.',
  perfumes: 'Aromas para cada ocasión. Explora nuestra selección de fragancias.',
  relojes: 'Detalles que acompañan tu día. Descubre nuestra selección de relojes.',
  bolsos: 'Bolsos para acompañarte en tu rutina y en cada salida.',
  canguros: 'Accesorios prácticos para llevar lo esencial contigo.',
}
const API_URL = import.meta.env.VITE_API_URL || ''
function src(url) { return url?.startsWith('/') ? API_URL + url : url }
export default function CategoryHero({ category, featured = false }) {
  const name = category?.name || (featured ? 'Destacados' : 'Catálogo')
  const description = category?.description?.trim() || DESCRIPTIONS[category?.slug] ||
    'Descubre gorras, perfumes, relojes, bolsos y accesorios disponibles en HJStoreVP.'
  const image = category?.image_url || category?.image || ''
  return <section className="hj-catalog-hero" aria-label={`Colección ${name}`}>
    <div className="hj-catalog-hero-copy">
      <nav aria-label="Ruta de navegación" className="hj-catalog-breadcrumb">
        <Link to="/">Inicio</Link><span aria-hidden="true">/</span>
        {category ? <><Link to="/catalogo">Catálogo</Link><span aria-hidden="true">/</span><strong>{name}</strong></> : <strong>Catálogo</strong>}
      </nav>
      <h1>{name.toUpperCase()}<span>.</span></h1>
      <p>{description}</p>
    </div>
    {image && <div className="hj-catalog-hero-image">
      <img src={src(image)} alt={`Colección ${name}`} loading="eager"
        onError={event => { event.currentTarget.parentElement.hidden = true }}/>
    </div>}
  </section>
}
