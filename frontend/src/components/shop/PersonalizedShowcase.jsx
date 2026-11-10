import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { productsApi, recommendationsApi } from '../../services/api'
import { useBrowsingStore, useWishlistStore } from '../../store'
import ProductCard from './ProductCard'

export default function PersonalizedShowcase() {
  const saved = useWishlistStore((state) => state.items)
  const enabled = useBrowsingStore((state) => state.enabled)
  const viewed = useBrowsingStore((state) => state.viewed)
  const setEnabled = useBrowsingStore((state) => state.setEnabled)
  const clearViewed = useBrowsingStore((state) => state.clear)

  const visibleHistory = enabled ? viewed : []
  const interestIds = [...new Set([
    ...saved.slice(-12).map((entry) => Number(entry.id)),
    ...visibleHistory.map((entry) => Number(entry.id)),
  ].filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 20)

  const { data: recentProducts = [] } = useQuery({
    queryKey: ['personalization-recent-products', visibleHistory.map((item) => item.slug)],
    enabled: enabled && visibleHistory.length > 0,
    queryFn: async () => {
      // Consultar siempre el estado actual, sin guardar precios o stocks históricos.
      const results = await Promise.all(visibleHistory.slice(0, 6).map((entry) =>
        productsApi.get(entry.slug).then(({ data }) => data).catch((error) => {
          if (error?.response?.status === 404) return null
          throw error
        })
      ))
      return results.filter((product) => product?.active !== false && product?.id)
    },
  })

  const { data: suggested = [] } = useQuery({
    queryKey: ['personalization-recommendations', interestIds],
    queryFn: () => recommendationsApi.personalized(interestIds, 8)
      .then(({ data }) => data),
    enabled: interestIds.length > 0,
  })

  return <div className="space-y-10">
    <section className="editorial-products-section" aria-labelledby="personalization-title">
      <div className="editorial-section-heading">
        <div>
          <span className="editorial-eyebrow">SEGÚN TUS INTERESES</span>
          <h2 id="personalization-title">SELECCIONADOS PARA TI</h2>
        </div>
        <Link className="editorial-view-all" to="/favoritos">MIS FAVORITOS</Link>
      </div>
      {suggested.length ? (
        <div className="editorial-product-grid">
          {suggested.slice(0, 8).map((product) =>
            <ProductCard key={product.id} product={product} label={product.recommendation_reason} />
          )}
        </div>
      ) : <p className="text-sm text-neutral-500">
        {interestIds.length
          ? 'Aún no tenemos recomendaciones disponibles para estos intereses.'
          : 'Guarda tus favoritos para descubrir recomendaciones relacionadas.'}
      </p>}
    </section>

    <section className="editorial-products-section" aria-labelledby="recently-viewed-title">
      <div className="editorial-section-heading">
        <div>
          <span className="editorial-eyebrow">HISTORIAL DE ESTE NAVEGADOR</span>
          <h2 id="recently-viewed-title">VISTOS RECIENTEMENTE</h2>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <label className="inline-flex gap-2 items-center text-sm text-neutral-700">
          <input type="checkbox" checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="accent-neutral-900" />
          Recordar productos vistos en este navegador
        </label>
        {enabled && viewed.length > 0 && (
          <button type="button" onClick={clearViewed}
            className="text-xs underline uppercase font-semibold text-neutral-700">
            Borrar historial
          </button>
        )}
      </div>
      {!enabled ? (
        <p className="text-sm text-neutral-500">
          Opcional: al activarlo guardaremos hasta 12 referencias en este dispositivo.
          Puedes borrar el historial o desactivarlo cuando quieras.
        </p>
      ) : recentProducts.length ? (
        <div className="editorial-product-grid">
          {recentProducts.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">
          Todavía no has visitado productos desde que activaste esta opción.
        </p>
      )}
    </section>
  </div>
}
