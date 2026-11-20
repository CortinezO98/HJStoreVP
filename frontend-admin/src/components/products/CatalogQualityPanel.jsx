import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ClipboardCheck, ChevronDown, ChevronUp, Pencil, RefreshCw } from 'lucide-react'
import { productsApi } from '../../services/api'

const ISSUE_LABELS = {
  no_images: 'Sin fotografías',
  invalid_primary: 'Imagen principal no definida o duplicada',
  short_description: 'Descripción ausente o menor de 60 caracteres',
  missing_category: 'Sin categoría',
  missing_image_alt: 'Texto alternativo de fotografía incompleto',
  shared_image_url: 'Fotografía compartida entre productos (posible duplicado)',
  single_photo: 'Solo una fotografía disponible',
}
const PRIORITY = {
  no_images: 0, invalid_primary: 1, missing_category: 2,
  short_description: 3, shared_image_url: 4, missing_image_alt: 5, single_photo: 6,
}

export default function CatalogQualityPanel({ products = [], onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const [onlyActive, setOnlyActive] = useState(true)
  const [issueFilter, setIssueFilter] = useState('')
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-catalog-quality', onlyActive],
    queryFn: () => productsApi.catalogQuality({ include_inactive: !onlyActive }).then(({ data }) => data),
    enabled: expanded,
    staleTime: 30_000,
  })
  const rows = (data?.issues || []).filter(item =>
    !issueFilter || item.issues.includes(issueFilter))
    .sort((a,b) => {
      const rank = item => Math.min(...item.issues.map(issue => PRIORITY[issue] ?? 99))
      return rank(a) - rank(b) || a.name.localeCompare(b.name, 'es')
    })
  const byId = new Map(products.map(product => [product.id, product]))

  return <section className="card p-0 overflow-hidden" aria-label="Auditoría de calidad del catálogo">
    <div className="p-4 d-flex flex-wrap align-items-center justify-content-between gap-3">
      <div>
        <h2 className="h6 fw-bold mb-1 d-flex align-items-center gap-2">
          <ClipboardCheck size={19}/> Auditoría de calidad del catálogo
        </h2>
        <p className="text-secondary small mb-0">
          Detecta fichas incompletas y fotografías compartidas sin modificar los productos.
        </p>
      </div>
      <button type="button" className="btn btn-outline-primary btn-sm"
        aria-expanded={expanded}
        onClick={() => setExpanded(previous => !previous)}>
        {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        <span className="ms-2">{expanded ? 'Cerrar auditoría' : 'Revisar catálogo'}</span>
      </button>
    </div>
    {expanded && <div className="border-top p-4">
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <label className="d-flex align-items-center gap-2 small">
          <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)}/>
          Solo productos activos
        </label>
        <label className="d-flex align-items-center gap-2 small">
          Tipo de hallazgo
          <select className="form-select form-select-sm" value={issueFilter}
            onChange={e => setIssueFilter(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ISSUE_LABELS).map(([key,label]) =>
              <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-outline-secondary btn-sm d-inline-flex gap-2 align-items-center"
          disabled={isFetching} onClick={() => refetch()}><RefreshCw size={14}/> Actualizar</button>
      </div>
      {isLoading && <p className="small text-secondary">Analizando fichas e imágenes guardadas…</p>}
      {isError && <p className="alert alert-warning small" role="alert">
        No se pudo consultar la auditoría. Verifica los permisos y el backend.
      </p>}
      {data && <>
        <div className="d-flex flex-wrap gap-2 mb-3">
          <span className="badge bg-light text-dark border">Revisados: {data.total}</span>
          <span className="badge bg-light text-dark border">Con alertas: {data.affected}</span>
          {Object.entries(data.summary || {}).map(([key,value]) =>
            <span className="badge bg-light text-dark border" key={key}>
              {ISSUE_LABELS[key] || key}: {value}
            </span>)}
        </div>
        <p className="small text-secondary">
          Se señalan URLs de fotografías idénticas entre productos, no similitud visual.
          El sistema no puede determinar si una foto muestra el artículo correcto:
          requiere revisión humana. Una sola fotografía tampoco es necesariamente un error.
        </p>
        {rows.length ? <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead><tr>
              <th>Producto</th><th>Fotografías</th><th>Hallazgos</th><th>Acción</th>
            </tr></thead>
            <tbody>{rows.map(item => <tr key={item.id}>
              <td><strong>{item.name}</strong><div className="text-secondary small">SKU: {item.sku}</div></td>
              <td>{item.image_count}</td>
              <td>{item.issues.map(key => <div key={key}
                className="text-warning-emphasis small d-flex align-items-start gap-1 mb-1">
                <AlertTriangle size={13} className="shrink-0 mt-1"/>{ISSUE_LABELS[key] || key}
              </div>)}</td>
              <td><button type="button" className="btn btn-sm btn-outline-primary d-flex gap-1 align-items-center"
                disabled={!byId.has(item.id)} onClick={() => onEdit(byId.get(item.id))}>
                <Pencil size={14}/> Corregir
              </button></td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="small text-secondary mb-0">
          No se encontraron hallazgos con el filtro seleccionado.
        </p>}
        <p className="text-secondary small mt-2 mb-0">
          El diagnóstico es de solo lectura y se actualiza a solicitud o al volver a abrirlo.
        </p>
      </>}
    </div>}
  </section>
}
