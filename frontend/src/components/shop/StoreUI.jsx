import { Link } from 'react-router-dom'
import { ArrowRight, AlertCircle, ShoppingBag } from 'lucide-react'

export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="store-page-heading">
      <div className="min-w-0">
        {eyebrow && <p className="store-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="store-description">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export function EmptyState({ title, description, action = 'Explorar catálogo', to = '/catalogo', icon: Icon = ShoppingBag }) {
  return (
    <div className="store-empty-state" role="status">
      <Icon size={38} strokeWidth={1.25} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      <Link to={to} className="store-button store-button-dark">{action}<ArrowRight size={16} /></Link>
    </div>
  )
}

export function ErrorState({ title = 'No pudimos cargar la información', description = 'Revisa tu conexión e inténtalo nuevamente.', onRetry }) {
  return (
    <div className="store-empty-state" role="alert">
      <AlertCircle size={36} strokeWidth={1.3} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry && <button type="button" className="store-button store-button-dark" onClick={onRetry}>Reintentar<ArrowRight size={16}/></button>}
    </div>
  )
}

export function LoadingGrid({ count = 8 }) {
  return (
    <div className="editorial-product-grid" role="status" aria-label="Cargando productos">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="bg-neutral-100 aspect-[4/4.5]" />
          <div className="bg-neutral-100 h-3 w-4/5 mt-4" />
          <div className="bg-neutral-100 h-3 w-2/5 mt-2" />
        </div>
      ))}
    </div>
  )
}

export function QuantityStepper({ value, onChange, min = 1, max = 99, label = 'Cantidad' }) {
  return (
    <div className="store-quantity" role="group" aria-label={label}>
      <button type="button" aria-label="Disminuir cantidad" onClick={() => onChange(value - 1)} disabled={value <= min}>−</button>
      <output aria-live="polite" aria-label={label}>{value}</output>
      <button type="button" aria-label="Aumentar cantidad" onClick={() => onChange(value + 1)} disabled={value >= max}>+</button>
    </div>
  )
}
