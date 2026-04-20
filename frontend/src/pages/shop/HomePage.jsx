import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ShoppingBag, Star, Truck, Shield } from 'lucide-react'
import { productsApi } from '../../services/api'
import ProductCard from '../../components/shop/ProductCard'

const CATEGORIES = [
  { name: 'Gorras',    slug: 'gorras',    emoji: '🧢', color: 'from-blue-500 to-blue-700' },
  { name: 'Perfumes',  slug: 'perfumes',  emoji: '🌸', color: 'from-pink-500 to-rose-600' },
  { name: 'Relojes',   slug: 'relojes',   emoji: '⌚', color: 'from-amber-500 to-orange-600' },
  { name: 'Bolsos',    slug: 'bolsos',    emoji: '👜', color: 'from-purple-500 to-purple-700' },
  { name: 'Canguros',  slug: 'canguros',  emoji: '🎽', color: 'from-teal-500 to-teal-700' },
]

export default function HomePage() {
  const { data: featured } = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: () => productsApi.list({ featured: true, per_page: 8 }).then((r) => r.data),
  })

  return (
    <div>
      {/* ── HERO ───────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, #7088ff 0%, transparent 50%), radial-gradient(circle at 80% 20%, #4f5ff7 0%, transparent 40%)' }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-brand-800/60 border border-brand-700 rounded-full px-4 py-1.5 text-sm text-brand-300 mb-6">
              <Star size={14} className="fill-brand-400 text-brand-400" />
              Nueva colección disponible
            </div>
            <h1 className="text-5xl md:text-6xl font-black leading-tight mb-6">
              Tu estilo,<br />
              <span className="text-brand-400">tu historia.</span>
            </h1>
            <p className="text-lg text-gray-300 mb-8 max-w-lg">
              Gorras, perfumes, relojes, bolsos y más. Todo lo que necesitas para lucir increíble, con envíos a todo Colombia.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/catalogo" className="btn-primary flex items-center gap-2 text-base">
                Ver catálogo <ArrowRight size={18} />
              </Link>
              <Link to="/catalogo?featured=true" className="btn-secondary flex items-center gap-2 text-base">
                <ShoppingBag size={18} /> Destacados
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────── */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Truck, title: 'Envíos a todo Colombia', desc: 'Recibe en la puerta de tu casa' },
              { icon: Shield, title: 'Compra segura', desc: 'Pagos con tarjeta y PSE' },
              { icon: ShoppingBag, title: 'Múltiples puntos físicos', desc: 'Encuéntranos en tu ciudad' },
            ].map((f) => (
              <div key={f.title} className="flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <f.icon size={22} className="text-brand-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{f.title}</p>
                  <p className="text-gray-500 text-sm">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CATEGORÍAS ─────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Explora por categoría</h2>
          <Link to="/catalogo" className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
            Ver todo <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              to={`/catalogo?categoria=${cat.slug}`}
              className={`bg-gradient-to-br ${cat.color} rounded-2xl p-6 text-white text-center hover:scale-105 transition-transform duration-200 shadow-md`}
            >
              <span className="text-4xl block mb-2">{cat.emoji}</span>
              <span className="font-semibold text-sm">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── PRODUCTOS DESTACADOS ───────────────────────────────── */}
      {featured?.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Productos destacados</h2>
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
    </div>
  )
}
