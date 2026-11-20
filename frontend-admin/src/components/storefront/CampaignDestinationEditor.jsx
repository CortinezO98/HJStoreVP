import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { productsApi, categoriesApi } from '../../services/api'

const COLLECTIONS = [
  ['all', 'Todo el catálogo', '/catalogo'],
  ['newest', 'Novedades', '/catalogo?sort=newest'],
  ['featured', 'Productos destacados', '/catalogo?featured=true'],
]
const buildLink = (type, slug) => {
  if (type === 'product') return `/producto/${slug}`
  if (type === 'category') return `/catalogo?categoria=${encodeURIComponent(slug)}`
  if (type === 'collection') return COLLECTIONS.find(([key]) => key === slug)?.[2] || '/catalogo'
  return '/catalogo'
}

/** Uses active catalog records, not arbitrary URLs or editable provider IDs. */
export default function CampaignDestinationEditor({ value = {}, onChange, id = 'campaign-destination' }) {
  const [search, setSearch] = useState('')
  const type = value.destination_type || 'custom'
  const slug = value.destination_slug || ''
  const { data: categories = [], isError: categoryError } = useQuery({
    queryKey: ['homepage-destination-categories'],
    queryFn: () => categoriesApi.list().then(({ data }) => data),
    staleTime: 60000,
  })
  const { data: products = [], isError: productError } = useQuery({
    queryKey: ['homepage-destination-products', search],
    queryFn: () => productsApi.list({ per_page: 50, search }).then(({ data }) => data),
    enabled: type === 'product',
    staleTime: 30000,
  })
  const selectType = next => onChange({
    ...value, destination_type: next, destination_slug: '',
    link: next === 'custom' ? (value.link || '/catalogo') : '/catalogo',
  })
  const selectTarget = next => onChange({
    ...value, destination_slug: next, link: buildLink(type, next),
  })
  const availableProducts = Array.isArray(products) ? products.filter(p => p.active !== false) : []
  const availableCategories = Array.isArray(categories) ? categories.filter(c => c.active !== false) : []

  return <div className="border rounded p-3 mt-3">
    <strong className="d-block mb-2">Destino comercial de la campaña</strong>
    <label className="form-label d-block" htmlFor={`${id}-type`}>Tipo de destino
      <select id={`${id}-type`} className="form-select mt-1" value={type}
        onChange={e => selectType(e.target.value)}>
        <option value="custom">Enlace interno manual</option>
        <option value="product">Producto del catálogo</option>
        <option value="category">Categoría</option>
        <option value="collection">Colección automática</option>
      </select>
    </label>
    {type === 'custom' && <label className="form-label d-block" htmlFor={`${id}-link`}>
      Ruta interna
      <input id={`${id}-link`} className="form-control mt-1" maxLength={300}
        placeholder="/catalogo" value={value.link || ''}
        onChange={e => onChange({ ...value, link: e.target.value })}/>
    </label>}
    {type === 'product' && <>
      <label className="form-label d-block" htmlFor={`${id}-search`}>Buscar producto por nombre
        <input id={`${id}-search`} className="form-control mt-1"
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Escribe el nombre del producto"/>
      </label>
      <label className="form-label d-block" htmlFor={`${id}-product`}>Producto de destino
        <select id={`${id}-product`} className="form-select mt-1" value={slug}
          onChange={e => selectTarget(e.target.value)}>
          <option value="">Selecciona un producto</option>
          {slug && !availableProducts.some(p => p.slug === slug) &&
            <option value={slug}>{slug} (selección actual)</option>}
          {availableProducts.map(product =>
            <option value={product.slug} key={product.id}>{product.name}</option>)}
        </select>
      </label>
      {productError && <p className="text-danger small">No se pudo consultar el catálogo.</p>}
    </>}
    {type === 'category' && <label className="form-label d-block" htmlFor={`${id}-category`}>
      Categoría de destino
      <select id={`${id}-category`} className="form-select mt-1" value={slug}
        onChange={e => selectTarget(e.target.value)}>
        <option value="">Selecciona una categoría</option>
        {slug && !availableCategories.some(c => c.slug === slug) &&
          <option value={slug}>{slug} (selección actual)</option>}
        {availableCategories.map(category =>
          <option value={category.slug} key={category.id}>{category.name}</option>)}
      </select>
      {categoryError && <span className="text-danger small">No se pudieron consultar las categorías.</span>}
    </label>}
    {type === 'collection' && <label className="form-label d-block" htmlFor={`${id}-collection`}>
      Colección comercial
      <select id={`${id}-collection`} className="form-select mt-1" value={slug}
        onChange={e => selectTarget(e.target.value)}>
        <option value="">Selecciona una colección</option>
        {COLLECTIONS.map(([key,label]) => <option value={key} key={key}>{label}</option>)}
      </select>
    </label>}
    <p className="small text-secondary mb-0">
      Enlace resultante: <code>{type === 'custom' ? (value.link || '/catalogo') : slug ?
        buildLink(type, slug) : 'Selecciona un destino'}</code>
    </p>
  </div>
}
