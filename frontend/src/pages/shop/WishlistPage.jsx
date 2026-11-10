import { Link } from 'react-router-dom'
import { useWishlistStore } from '../../store'
import { useQuery } from '@tanstack/react-query'
import { productsApi } from '../../services/api'
import ProductCard from '../../components/shop/ProductCard'
import { ErrorState, LoadingGrid } from '../../components/shop/StoreUI'

export default function WishlistPage() {
  const saved = useWishlistStore((s) => s.items)
  const clear = useWishlistStore((s) => s.clear)
  // Consultar el catálogo vigente: nunca mostrar un precio histórico guardado
  // en navegador como si fuese precio actual.
  const { data: products = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['wishlist-products', saved.map((p) => p.id).join(',')],
    queryFn: async () => {
      if (!saved.length) return []
      const pages = await Promise.all(
        Array.from({ length: 10 }, (_, i) => i + 1).map(async (page) => {
          const { data } = await productsApi.list({ page, per_page: 100 })
          return data
        })
      )
      const wanted = new Set(saved.map((p) => p.id))
      return pages.flat().filter((p) => wanted.has(p.id))
    },
    enabled: saved.length > 0,
  })

  return <section className="store-container store-section space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="editorial-catalog-title">MIS FAVORITOS</h1>
        <p className="text-gray-500 text-sm mt-2">Tus productos guardados en este navegador.</p></div>
      {saved.length > 0 && <button type="button" onClick={clear}
        className="store-button store-button-outline">LIMPIAR FAVORITOS</button>}
    </div>
    {!saved.length ? <div className="text-center py-20 space-y-4">
      <p className="text-gray-500">Todavía no has guardado productos.</p>
      <Link className="store-button store-button-dark" to="/catalogo">EXPLORAR CATÁLOGO</Link>
    </div> : isLoading ? <LoadingGrid count={4} /> : isError ? <ErrorState onRetry={refetch} /> :
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10">
      {saved.map((item) => {
        const product = products.find((p) => p.id === item.id)
        return product ? <ProductCard key={product.id} product={product}/> :
          <div key={item.id} className="border border-neutral-200 p-4 space-y-3">
            <p className="font-semibold">{item.name}</p>
            <p className="text-sm text-gray-500">No disponible actualmente</p>
            <button type="button" className="text-sm underline" onClick={() => useWishlistStore.getState().remove(item.id)}>Quitar de favoritos</button>
          </div>
      })}
    </div>}
  </section>
}
