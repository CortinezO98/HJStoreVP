import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { recommendationsApi } from '../../services/api'
import ProductCard from '../../components/shop/ProductCard'
import { Trash2, ShoppingBag, ArrowRight, Truck, ShieldCheck } from 'lucide-react'
import { useCartStore, useAuthStore } from '../../store'
import { PageHeading, EmptyState, QuantityStepper } from '../../components/shop/StoreUI'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''
const formatCOP = (amount) => new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
}).format(Number(amount) || 0)

function imageUrl(product) {
  const value = product.primary_image
  return value ? (value.startsWith('http') ? value : `${API_URL}${value}`) : null
}

export default function CartPage() {
  const items = useCartStore((state) => state.items)
  const removeItem = useCartStore((state) => state.removeItem)
  const updateQty = useCartStore((state) => state.updateQty)
  const clearCart = useCartStore((state) => state.clearCart)
  const total = useCartStore((state) => state.total())
  const authenticated = useAuthStore((state) => state.isAuthenticated)
  const navigate = useNavigate()
  const cartIds = [...new Set(items.map((item) => item.product.id))].sort((a, b) => a - b)
  const { data: suggestions = [] } = useQuery({
    queryKey: ['commercial-recommendations-cart', cartIds],
    queryFn: () => recommendationsApi.cart(cartIds).then(({ data }) => data),
    enabled: cartIds.length > 0,
  })

  const goCheckout = () => {
    if (items.some(({ product, qty }) => !Number.isSafeInteger(qty) || qty <= 0 ||
      !Number.isFinite(Number(product.sale_price)) || Number(product.sale_price) < 0 ||
      (product.total_stock != null && qty > Number(product.total_stock)))) {
      toast.error('Hay productos con cantidad o disponibilidad inválida')
      return
    }
    navigate(authenticated ? '/checkout' : '/login?next=%2Fcheckout')
  }

  const changeQty = (id, qty) => {
    if (!updateQty(id, qty)) toast.error('La cantidad supera las existencias disponibles')
  }

  return (
    <div className="store-container store-section">
      <PageHeading eyebrow="TU SELECCIÓN" title="MI CARRITO"
        description="Revisa los artículos y las cantidades antes de continuar.">
        {items.length > 0 && <span className="text-sm text-neutral-500">{items.length} referencias</span>}
      </PageHeading>

      {items.length === 0 ? (
        <EmptyState title="TU CARRITO ESTÁ VACÍO"
          description="Todavía no has agregado productos. Explora la colección y encuentra tu próximo favorito." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px] gap-10 xl:gap-14 items-start">
          <section aria-label="Productos del carrito" className="min-w-0">
            {items.map(({ product, qty }) => {
              const available = product.total_stock ?? product.stock ?? null
              const max = available === null ? 99 : Math.max(0, Number(available))
              const photo = imageUrl(product)
              return (
                <article key={product.id} className="store-order-item">
                  <Link to={`/producto/${product.slug}`} className="shrink-0 block">
                    {photo ? <img loading="lazy" src={photo} alt={product.name} className="store-order-img"/> :
                      <span className="store-order-img flex items-center justify-center text-neutral-400"><ShoppingBag size={28}/></span>}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/producto/${product.slug}`} className="font-bold text-sm sm:text-base text-black hover:underline">{product.name}</Link>
                    <p className="text-xs text-neutral-500 mt-2">SKU: {product.sku}</p>
                    <p className="text-sm text-neutral-600 mt-2">{formatCOP(product.sale_price)} / unidad</p>
                    {available !== null && Number(available) < qty &&
                      <p className="text-xs text-red-700 mt-2" role="alert">Stock insuficiente: {available} disponibles</p>}
                  </div>
                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-4">
                    <p className="font-black text-base whitespace-nowrap">{formatCOP(Number(product.sale_price) * qty)}</p>
                    <QuantityStepper value={qty} onChange={(next) => changeQty(product.id, next)}
                      max={max} min={1} label={`Cantidad de ${product.name}`}/>
                    <button type="button" onClick={() => removeItem(product.id)}
                      className="inline-flex gap-1 items-center text-xs text-neutral-500 hover:text-red-700 min-h-11"
                      aria-label={`Eliminar ${product.name} del carrito`}>
                      <Trash2 size={15}/> ELIMINAR
                    </button>
                  </div>
                </article>
              )
            })}
            <div className="flex flex-wrap items-center justify-between gap-4 mt-8">
              <Link to="/catalogo" className="store-inline-link inline-flex items-center gap-2"><ArrowRight className="rotate-180" size={16}/> SEGUIR COMPRANDO</Link>
              <button type="button" className="text-xs font-bold uppercase tracking-wider text-red-700 underline underline-offset-4 min-h-11"
                onClick={clearCart}>Vaciar carrito</button>
            </div>
          </section>

          <aside aria-label="Resumen de la compra" className="store-responsive-summary">
            <h2 className="text-xl font-black uppercase">RESUMEN DEL PEDIDO</h2>
            <div className="flex justify-between gap-3 border-b border-neutral-200 py-6 text-sm">
              <span className="text-neutral-500">Subtotal</span>
              <strong>{formatCOP(total)}</strong>
            </div>
            <div className="flex justify-between gap-3 border-b border-neutral-200 py-5 text-sm">
              <span className="text-neutral-500">Envío</span>
              <span>Por confirmar</span>
            </div>
            <p className="text-xs text-neutral-500 leading-6 py-4">El valor del envío se confirma antes de finalizar tu compra.</p>
            <div className="flex justify-between items-center border-t border-neutral-200 pt-5 mb-6">
              <strong className="uppercase text-sm">Subtotal</strong>
              <strong className="text-2xl">{formatCOP(total)}</strong>
            </div>
            <button type="button" onClick={goCheckout} className="store-button store-button-dark w-full">
              CONTINUAR AL PAGO <ArrowRight size={17}/>
            </button>
            <div className="flex flex-col gap-3 mt-7 text-xs text-neutral-500">
              <span className="inline-flex gap-2 items-center"><ShieldCheck size={16}/> Tu pedido se verifica antes del pago</span>
              <span className="inline-flex gap-2 items-center"><Truck size={16}/> Envíos en Colombia</span>
            </div>
          </aside>
        </div>
      )}
      {items.length > 0 && suggestions.length > 0 && (
        <section className="mt-16" aria-label="Productos que complementan tu compra">
          <h2 className="text-2xl sm:text-3xl font-black uppercase mb-6">Completa tu compra</h2>
          <p className="text-sm text-neutral-500 mb-6">Explora referencias disponibles que combinan con tu selección.</p>
          <div className="editorial-product-grid">
            {suggestions.map((product) => (
              <ProductCard key={product.id} product={product} label={product.recommendation_reason} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
