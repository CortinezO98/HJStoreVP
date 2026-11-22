import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight, Tag, Search, Layers3 } from 'lucide-react'
import { apiClient } from '../services/api'
import toast from 'react-hot-toast'

const normalizeSearch = (value = '') => String(value).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const EMOJIS = ['🧢','🌸','⌚','👜','🎽','👟','💍','🕶️','🧣','🎒','💄','🛍️']

function CategoryModal({ category, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!category?.id
  const [form, setForm] = useState({
    name: category?.name || '',
    description: category?.description || '',
    sort_order: category?.sort_order ?? 0,
  })
  const mutation = useMutation({
    mutationFn: data => isEdit
      ? apiClient.put(`/categories/${category.id}`, data).then(r => r.data)
      : apiClient.post('/categories', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success(isEdit ? 'Categoría actualizada' : 'Categoría creada')
      onClose()
    },
    onError: error => toast.error(error.response?.data?.detail || 'Error al guardar la categoría'),
  })
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  return (
    <div className="admin-catalog-overlay" role="presentation">
      <div className="admin-catalog-modal admin-catalog-modal-sm" role="dialog" aria-modal="true"
        aria-labelledby="category-dialog-heading">
        <div className="admin-catalog-modal-header">
          <div>
            <span className="admin-page-kicker">Organización del catálogo</span>
            <h2 id="category-dialog-heading" className="h5 fw-bold mb-1">
              {isEdit ? 'Editar categoría' : 'Nueva categoría'}
            </h2>
            <p className="text-secondary small mb-0">Agrupa los productos para facilitar su búsqueda.</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar"/>
        </div>
        <form onSubmit={event => { event.preventDefault(); mutation.mutate(form) }}>
          <div className="admin-catalog-modal-body">
            <div className="mb-3">
              <label htmlFor="category-name" className="form-label">Nombre de la categoría *</label>
              <input id="category-name" className="form-control" required maxLength={120}
                value={form.name} onChange={event => set('name', event.target.value)}
                placeholder="Ej.: Gorras, perfumes, relojes"/>
            </div>
            <div className="mb-3">
              <label htmlFor="category-description" className="form-label">Descripción</label>
              <textarea id="category-description" className="form-control" rows={3}
                value={form.description} onChange={event => set('description', event.target.value)}
                placeholder="Ayuda al cliente a identificar lo que encontrará aquí"/>
            </div>
            <div>
              <label htmlFor="category-order" className="form-label">Orden de aparición</label>
              <input id="category-order" type="number" min={0} className="form-control"
                value={form.sort_order} onChange={event => set('sort_order', parseInt(event.target.value, 10) || 0)}/>
              <div className="form-text">Las categorías con el número menor aparecen primero.</div>
            </div>
          </div>
          <div className="admin-catalog-modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear categoría'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CategoriesPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const { data: categories = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.get('/categories', { params: { include_inactive: true } }).then(r => r.data),
  })
  const toggleMutation = useMutation({
    mutationFn: id => apiClient.patch(`/categories/${id}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Estado de la categoría actualizado')
    },
    onError: error => toast.error(error.response?.data?.detail || 'No se pudo modificar la categoría'),
  })
  const totalProducts = categories.reduce((total, category) => total + Number(category.product_count || 0), 0)
  const activeCount = categories.filter(category => category.active).length
  const filtered = useMemo(() => categories.filter(category => {
    const term = normalizeSearch(search.trim())
    const text = normalizeSearch(`${category.name} ${category.slug} ${category.description || ''}`)
    return (!term || text.includes(term)) && (status === 'all' || (status === 'active') === Boolean(category.active))
  }).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)), [categories, search, status])
  const clear = () => { setSearch(''); setStatus('all') }

  return (
    <div className="admin-catalog-page">
      <header className="admin-page-intro flex-wrap">
        <div>
          <p className="admin-page-kicker">Organización de productos</p>
          <h1 className="admin-page-heading">Categorías</h1>
          <p className="admin-page-description">Organiza tu catálogo y controla qué grupos están visibles en la tienda.</p>
        </div>
        <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2"
          onClick={() => setModal('create')}><Plus size={17}/> Nueva categoría</button>
      </header>

      <div className="row g-3 mb-4" aria-label="Resumen de categorías">
        {[
          { label: 'Total de categorías', value: categories.length },
          { label: 'Categorías activas', value: activeCount },
          { label: 'Productos relacionados', value: totalProducts },
        ].map(item => <div className="col-12 col-sm-4" key={item.label}>
          <div className="admin-catalog-stat">
            <span>{item.label}</span>
            <strong>{item.value.toLocaleString('es-CO')}</strong>
          </div>
        </div>)}
      </div>

      <section className="admin-catalog-filter card mb-4" aria-label="Filtros de categorías">
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-6">
            <label htmlFor="category-search" className="form-label">Buscar categoría</label>
            <div className="admin-catalog-search"><Search size={17} aria-hidden="true"/>
              <input id="category-search" className="form-control" type="search"
                placeholder="Nombre, enlace o descripción" value={search}
                onChange={event => setSearch(event.target.value)}/>
            </div>
          </div>
          <div className="col-8 col-md-4">
            <label htmlFor="category-status" className="form-label">Visibilidad</label>
            <select id="category-status" className="form-select" value={status}
              onChange={event => setStatus(event.target.value)}>
              <option value="all">Todas</option><option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
            </select>
          </div>
          <div className="col-4 col-md-2">
            <button type="button" className="btn btn-outline-secondary w-100" onClick={clear}
              disabled={!search && status === 'all'}>Limpiar</button>
          </div>
        </div>
      </section>

      {!isLoading && !isError && <p className="admin-list-result-count" role="status" aria-live="polite">{filtered.length.toLocaleString('es-CO')} de {categories.length.toLocaleString('es-CO')} categorías visibles con los filtros actuales</p>}

      {isError ? <div className="alert alert-danger" role="alert">
        No se pudieron consultar las categorías.
        <button type="button" className="btn btn-outline-danger btn-sm ms-3" onClick={() => refetch()}>Reintentar</button>
      </div> : isLoading ? <div className="row g-3">{Array.from({ length: 6 }).map((_, index) =>
        <div className="col-12 col-md-6 col-xl-4" key={index}>
          <div className="card p-4 placeholder-glow"><span className="placeholder col-6 mb-3"/>
            <span className="placeholder col-9"/></div>
        </div>)}</div> : filtered.length === 0 ? (
        <div className="admin-catalog-empty">
          <Layers3 size={35} className="text-secondary mb-3"/>
          <h2 className="h6 fw-bold">{categories.length ? 'Ninguna categoría coincide con los filtros' : 'Aún no hay categorías'}</h2>
          <p className="text-secondary small">{categories.length ? 'Prueba otra búsqueda o limpia los filtros.' : 'Crea una categoría para comenzar a organizar tus productos.'}</p>
          {categories.length
            ? <button className="btn btn-outline-secondary" type="button" onClick={clear}>Limpiar filtros</button>
            : <button className="btn btn-primary" type="button" onClick={() => setModal('create')}>Crear categoría</button>}
        </div>
      ) : (
        <>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h6 fw-bold m-0">Listado de categorías</h2>
            <span className="text-secondary small">{filtered.length.toLocaleString('es-CO')} resultados</span>
          </div>
          <div className="row g-3">
            {filtered.map((cat, index) => <div className="col-12 col-md-6 col-xl-4" key={cat.id}>
              <article className="admin-catalog-category-card h-100">
                <div className="d-flex align-items-start gap-3">
                  <span className="admin-catalog-category-symbol" aria-hidden="true">{EMOJIS[index % EMOJIS.length]}</span>
                  <div className="min-w-0 flex-grow-1">
                    <h3 className="h6 fw-bold mb-1 text-truncate" title={cat.name}>{cat.name}</h3>
                    <p className="text-secondary small mb-1 text-truncate">/{cat.slug}</p>
                    <span className={cat.active ? 'badge text-bg-success' : 'badge text-bg-secondary'}>
                      {cat.active ? 'Visible' : 'Oculta'}
                    </span>
                  </div>
                </div>
                <p className="admin-catalog-category-description">{cat.description || 'Sin descripción registrada'}</p>
                <div className="d-flex align-items-center justify-content-between gap-2 border-top pt-3 mt-auto">
                  <div className="small text-secondary">
                    <strong className="text-dark">{cat.product_count || 0}</strong> productos
                    <span className="ms-2">· Orden {cat.sort_order}</span>
                  </div>
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-sm btn-outline-secondary" title="Editar categoría"
                      aria-label={`Editar categoría ${cat.name}`} onClick={() => setModal(cat)}><Pencil size={15}/></button>
                    <button type="button" disabled={toggleMutation.isPending} title={cat.active ? 'Ocultar categoría' : 'Mostrar categoría'}
                      aria-label={`${cat.active ? 'Ocultar' : 'Mostrar'} categoría ${cat.name}`}
                      className={cat.active ? 'btn btn-sm btn-outline-warning' : 'btn btn-sm btn-outline-success'}
                      onClick={() => toggleMutation.mutate(cat.id)}>
                      {cat.active ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                    </button>
                  </div>
                </div>
              </article>
            </div>)}
          </div>
        </>
      )}
      {modal && <CategoryModal category={modal === 'create' ? null : modal} onClose={() => setModal(null)}/>}
    </div>
  )
}
