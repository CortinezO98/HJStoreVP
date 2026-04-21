import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ShoppingBag, Star, Truck, Shield, MessageCircle, Zap, Award } from 'lucide-react'
import { productsApi } from '../../services/api'
import ProductCard from '../../components/shop/ProductCard'

const WHATSAPP_NUMBER = '573000000000'
const WHATSAPP_MSG    = 'Hola! Me interesa hacer un pedido en HJStoreVP 🛍️'

const CATEGORIES = [
  { name: 'Gorras',   slug: 'gorras',   emoji: '🧢', color: 'from-blue-500 to-blue-700',     count: '50+ estilos' },
  { name: 'Perfumes', slug: 'perfumes', emoji: '🌸', color: 'from-pink-500 to-rose-600',      count: 'Importados' },
  { name: 'Relojes',  slug: 'relojes',  emoji: '⌚', color: 'from-amber-500 to-orange-600',   count: 'Casuales y formales' },
  { name: 'Bolsos',   slug: 'bolsos',   emoji: '👜', color: 'from-purple-500 to-purple-700',  count: 'Dama y caballero' },
  { name: 'Canguros', slug: 'canguros', emoji: '🎽', color: 'from-teal-500 to-teal-700',      count: 'Riñoneras incluidas' },
]

const BENEFITS = [
  { icon: Truck,          title: 'Envíos a todo Colombia',    desc: 'Recibe en la puerta de tu casa',         color: 'bg-blue-100 text-blue-600' },
  { icon: Shield,         title: 'Pago 100% seguro',          desc: 'Wompi · Sistecréditos · Addi',           color: 'bg-green-100 text-green-600' },
  { icon: Award,          title: 'Productos originales',       desc: 'Garantía en todos nuestros artículos',   color: 'bg-purple-100 text-purple-600' },
  { icon: MessageCircle,  title: 'Atención por WhatsApp',      desc: 'Respuesta en menos de 1 hora',           color: 'bg-amber-100 text-amber-600' },
]

const TESTIMONIALS = [
  { name: 'María G.',    city: 'Barranquilla', rating: 5, text: 'Excelente servicio, la gorra llegó súper rápido y en perfecto estado. Definitivamente vuelvo a comprar.' },
  { name: 'Carlos R.',   city: 'Bogotá',       rating: 5, text: 'El perfume es idéntico al original. Muy buen precio y el envío fue rápido. 100% recomendado.' },
  { name: 'Valentina M.', city: 'Medellín',    rating: 5, text: 'Mi reloj llegó en 3 días con el empaque intacto. La atención por WhatsApp fue increíble.' },
]

function StarRating({ count }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
      ))}
    </div>
  )
}

export default function HomePage() {
  const { data: featured } = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: () => productsApi.list({ featured: true, per_page: 8 }).then((r) => r.data),
  })

  const { data: newest } = useQuery({
    queryKey: ['products', 'newest'],
    queryFn: () => productsApi.list({ per_page: 4, sort: 'newest' }).then((r) => r.data),
  })

  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MSG)}`

  return (
    <div>

      {/* ── HERO ───────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, #7088ff 0%, transparent 50%), radial-gradient(circle at 80% 20%, #4f5ff7 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-brand-800/60 border border-brand-700 rounded-full px-4 py-1.5 text-sm text-brand-300 mb-5">
              <Zap size={13} className="fill-brand-400 text-brand-400" />
              Nueva colección disponible · Envíos desde $0
            </div>
            <h1 className="text-5xl md:text-6xl font-black leading-tight mb-5">
              Tu estilo,<br />
              <span className="text-brand-400">tu historia.</span>
            </h1>
            <p className="text-lg text-gray-300 mb-4 max-w-lg">
              Gorras, perfumes, relojes, bolsos y más. Todo original, con envíos rápidos a todo Colombia.
            </p>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-3 mb-8">
              {['✅ Productos originales', '🚚 Envíos rápidos', '🔒 Pago seguro', '💬 Soporte WhatsApp'].map(b => (
                <span key={b} className="text-xs text-brand-200 bg-brand-800/50 border border-brand-700/50 rounded-full px-3 py-1">
                  {b}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to="/catalogo" className="btn-primary flex items-center gap-2 text-base">
                Ver catálogo <ArrowRight size={18} />
              </Link>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-base bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors"
              >
                <MessageCircle size={18} /> Comprar por WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── BENEFICIOS ─────────────────────────────────────────── */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                <div className={`w-10 h-10 ${b.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <b.icon size={20} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-xs">{b.title}</p>
                  <p className="text-gray-500 text-xs">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CATEGORÍAS ─────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Explora por categoría</h2>
            <p className="text-sm text-gray-500 mt-1">Encuentra exactamente lo que buscas</p>
          </div>
          <Link to="/catalogo" className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
            Ver todo <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              to={`/catalogo?categoria=${cat.slug}`}
              className={`bg-gradient-to-br ${cat.color} rounded-2xl p-5 text-white text-center hover:scale-105 transition-transform duration-200 shadow-md group`}
            >
              <span className="text-4xl block mb-2 group-hover:scale-110 transition-transform">{cat.emoji}</span>
              <span className="font-bold text-sm block">{cat.name}</span>
              <span className="text-xs opacity-75 block mt-0.5">{cat.count}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── PRODUCTOS DESTACADOS ───────────────────────────────── */}
      {featured?.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">⭐ Productos destacados</h2>
              <p className="text-sm text-gray-500 mt-1">Los más populares de nuestra tienda</p>
            </div>
            <Link to="/catalogo?featured=true" className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
              Ver más <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* ── BANNER WHATSAPP ────────────────────────────────────── */}
      <section className="bg-green-600 text-white py-12 my-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <MessageCircle size={40} className="mx-auto mb-4 opacity-90" />
          <h2 className="text-2xl font-bold mb-2">¿Prefieres comprar por WhatsApp?</h2>
          <p className="text-green-100 mb-6">
            Escríbenos y te asesoramos personalmente. Respuesta en menos de 1 hora.
          </p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white text-green-700 font-bold px-8 py-3 rounded-xl hover:bg-green-50 transition-colors text-base"
          >
            <MessageCircle size={20} />
            Chatear ahora en WhatsApp
          </a>
        </div>
      </section>

      {/* ── NOVEDADES ──────────────────────────────────────────── */}
      {newest?.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">🆕 Últimas novedades</h2>
              <p className="text-sm text-gray-500 mt-1">Los productos más recientes de nuestra tienda</p>
            </div>
            <Link to="/catalogo" className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
              Ver catálogo <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6">
            {newest.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* ── TESTIMONIOS ────────────────────────────────────────── */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Lo que dicen nuestros clientes</h2>
            <div className="flex items-center justify-center gap-2">
              <StarRating count={5} />
              <span className="text-sm text-gray-500 font-medium">4.9/5 · +500 clientes satisfechos</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <StarRating count={t.rating} />
                <p className="text-gray-700 text-sm mt-3 mb-4 leading-relaxed">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 font-bold text-sm">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.city}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}
