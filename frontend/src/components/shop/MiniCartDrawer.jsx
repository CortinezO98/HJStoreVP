import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, X, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore, useCartStore } from '../../store'

const API_URL = import.meta.env.VITE_API_URL || ''
const money = (amount) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(amount || 0))
const imageUrl = (product) => {
  const path = product?.primary_image
  return path ? (/^https?:\/\//i.test(path) ? path : `${API_URL}${path}`) : null
}

export default function MiniCartDrawer({ open, onClose }) {
  const firstFocus = useRef(null)
  const opener = useRef(null)
  const navigate = useNavigate()
  const items = useCartStore((state) => state.items)
  const updateQty = useCartStore((state) => state.updateQty)
  const removeItem = useCartStore((state) => state.removeItem)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const amount = items.reduce((sum, item) => sum + Number(item.product?.sale_price || 0) * Number(item.qty || 0), 0)
  const units = items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
  const invalid = items.some(({ product, qty }) => {
    const available = product?.total_stock ?? product?.stock
    return !Number.isSafeInteger(qty) || qty < 1 ||
      !Number.isFinite(Number(product.sale_price)) || Number(product.sale_price) < 0 ||
      (available != null && qty > Number(available))
  })
  useEffect(() => {
    if (!open) return undefined
    opener.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    firstFocus.current?.focus()
    const keyHandler = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const drawer = firstFocus.current?.closest('[role="dialog"]')
        if (!drawer) return
        const controls = Array.from(drawer.querySelectorAll(
          'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ))
        if (!controls.length) return
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', keyHandler)
      opener.current?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null

  const changeQuantity = (product, qty) => {
    if (!updateQty(product.id, qty)) {
      toast.error('No es posible aumentar la cantidad por encima del inventario disponible')
    }
  }
  const checkout = () => {
    if (invalid) {
      toast.error('Revisa las existencias y cantidades del carrito antes de pagar')
      return
    }
    onClose()
    navigate(isAuthenticated ? '/checkout' : '/login?next=%2Fcheckout')
  }

  return (
    <div className="store-cart-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <aside id="store-mini-cart" className="store-cart-drawer" role="dialog" aria-modal="true"
        aria-labelledby="store-cart-drawer-title">
        <div className="store-cart-drawer-heading">
          <div>
            <span className="store-cart-drawer-eyebrow">TU SELECCIÓN</span>
            <h2 id="store-cart-drawer-title">MI CARRITO <span>({units})</span></h2>
          </div>
          <button ref={firstFocus} type="button" className="store-cart-drawer-close"
            aria-label="Cerrar mini-carrito" onClick={onClose}><X size={20}/></button>
        </div>
        {items.length ? (
          <>
            <p className="store-cart-confirmation"><ShoppingBag size={17}/> {items.length} referencias · {units} unidades</p>
            <div className="store-cart-drawer-items">
              {items.map(({ product, qty }) => {
                const url = imageUrl(product)
                const available = product.total_stock ?? product.stock ?? null
                const max = available == null ? 99 : Math.max(0, Number(available))
                return (
                  <article key={product.id} className="store-cart-drawer-item">
                    <Link to={`/producto/${product.slug}`} onClick={onClose}
                      aria-label={`Ver producto ${product.name}`} className="store-cart-drawer-photo">
                      {url ? <img src={url} alt="" loading="lazy" decoding="async"/> :
                        <ShoppingBag size={25} aria-hidden="true"/>}
                    </Link>
                    <div className="store-cart-drawer-item-details">
                      <Link className="store-cart-drawer-item-name" to={`/producto/${product.slug}`}
                        onClick={onClose}>{product.name}</Link>
                      <span>{money(product.sale_price)} por unidad</span>
                      {available != null && qty > Number(available) &&
                        <span className="store-cart-stock-warning" role="alert">Solo {available} disponibles</span>}
                      <div className="store-cart-drawer-qty">
                        <button type="button" aria-label={`Reducir cantidad de ${product.name}`}
                          onClick={() => changeQuantity(product, qty - 1)}><Minus size={14}/></button>
                        <span aria-label={`Cantidad: ${qty}`}>{qty}</span>
                        <button type="button" disabled={qty >= max}
                          aria-label={`Aumentar cantidad de ${product.name}`}
                          onClick={() => changeQuantity(product, qty + 1)}><Plus size={14}/></button>
                      </div>
                    </div>
                    <div className="store-cart-drawer-item-total">
                      <strong>{money(qty * Number(product.sale_price))}</strong>
                      <button type="button" onClick={() => removeItem(product.id)}
                        aria-label={`Quitar ${product.name} del carrito`}>
                        <Trash2 size={16}/> Quitar
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
            <div className="store-cart-drawer-footer">
              <div className="store-cart-drawer-subtotal"><span>Subtotal</span><strong>{money(amount)}</strong></div>
              <p>El envío y los descuentos se calcularán en el checkout antes de confirmar tu pedido.</p>
              <button type="button" className="store-button store-button-dark w-full"
                disabled={invalid} onClick={checkout}>
                CONTINUAR A ENTREGA Y PAGO <ArrowRight size={16}/>
              </button>
              <Link to="/carrito" className="store-cart-drawer-full" onClick={onClose}>
                VER CARRITO COMPLETO
              </Link>
              <span className="store-cart-drawer-secure"><ShieldCheck size={15}/> Tu pedido se verificará antes del pago</span>
            </div>
          </>
        ) : (
          <div className="store-cart-drawer-empty">
            <ShoppingBag size={46} strokeWidth={1.2}/>
            <h3>TU CARRITO ESTÁ VACÍO</h3>
            <p>Explora el catálogo para encontrar tu próximo favorito.</p>
            <Link to="/catalogo" onClick={onClose} className="store-button store-button-dark">
              EXPLORAR PRODUCTOS <ArrowRight size={15}/>
            </Link>
          </div>
        )}
      </aside>
    </div>
  )
}
