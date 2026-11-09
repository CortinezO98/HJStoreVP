import { Link } from 'react-router-dom'
import { ShieldCheck, ShoppingBag, ArrowLeft } from 'lucide-react'

export default function AuthShell({ eyebrow, headline, description, children }) {
  return (
    <div className="store-auth-shell">
      <aside className="store-auth-aside">
        <Link to="/" className="editorial-logo !text-white" aria-label="Volver a HJStoreVP">
          HJ<span>STORE</span><small>VP</small>
        </Link>
        <div>
          <p className="store-eyebrow !text-neutral-400">{eyebrow}</p>
          <h2>{headline}</h2>
          <p className="text-neutral-400 max-w-sm text-sm leading-7 mt-6">{description}</p>
        </div>
        <div className="hidden lg:flex gap-6 text-neutral-400 text-xs">
          <span className="inline-flex items-center gap-2"><ShieldCheck size={17}/> Compra con confianza</span>
          <span className="inline-flex items-center gap-2"><ShoppingBag size={17}/> Tu estilo, a un clic</span>
        </div>
      </aside>
      <main className="store-auth-panel">
        <div className="w-full max-w-lg">
          {children}
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-black mt-6"><ArrowLeft size={16}/> Volver a la tienda</Link>
        </div>
      </main>
    </div>
  )
}
