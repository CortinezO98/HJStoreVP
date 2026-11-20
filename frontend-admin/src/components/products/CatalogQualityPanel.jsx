import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ClipboardCheck, ChevronDown, ChevronUp, Pencil, RefreshCw, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { productsApi } from '../../services/api'

const LABELS = {
  no_images: 'Sin fotografías',
  invalid_primary: 'Imagen principal no definida o duplicada',
  short_description: 'Descripción ausente o menor de 60 caracteres',
  missing_category: 'Sin categoría',
  missing_image_alt: 'Texto alternativo incompleto',
  shared_image_url: 'Fotografía compartida (posible duplicado)',
  single_photo: 'Solo una fotografía disponible',
}
const STATUS = {
  pending: 'Pendiente de revisión',
  approved: 'Aprobado por superadministrador',
  needs_changes: 'Correcciones pendientes',
  stale: 'Revisar nuevamente: cambió la ficha',
}
const CRITICAL = ['no_images', 'invalid_primary', 'missing_category']

function ReviewEditor({ item, onSubmitted, disabled }) {
  const [decision, setDecision] = useState(item.review_status === 'approved' ? 'approved' : 'needs_changes')
  const [note, setNote] = useState(item.review_note || '')
  const [confirmed, setConfirmed] = useState(false)
  const critical = item.issues.some(issue => CRITICAL.includes(issue))
  const submit = () => {
    if (decision === 'approved' && (critical || !confirmed)) {
      toast.error('Corrige los problemas críticos y confirma que las imágenes corresponden al artículo')
      return
    }
    if (decision === 'needs_changes' && note.trim().length < 5) {
      toast.error('Especifica las correcciones pendientes (mínimo cinco caracteres)')
      return
    }
    onSubmitted(item.id, { decision, note: note.trim(), confirmed_photos: confirmed })
  }
  return <div className="border rounded p-3 mt-2 bg-light">
    <p className="small fw-semibold mb-2">Revisión humana de esta ficha</p>
    <label className="form-label small d-block">Decisión
      <select className="form-select form-select-sm mt-1" value={decision} disabled={disabled}
        onChange={e => { setDecision(e.target.value); setConfirmed(false) }}>
        <option value="needs_changes">Marcar correcciones pendientes</option>
        <option value="approved" disabled={critical}>Aprobar contenido comercial</option>
        <option value="pending">Devolver a pendiente</option>
      </select>
    </label>
    <label className="form-label small d-block">Observaciones
      <textarea rows={2} maxLength={2000} className="form-control form-control-sm mt-1"
        placeholder="Describe qué hay que corregir o qué se verificó"
        value={note} disabled={disabled}
        onChange={e => setNote(e.target.value)}/>
    </label>
    {decision === 'approved' && <label className="d-flex align-items-start gap-2 small mb-2">
      <input type="checkbox" checked={confirmed} disabled={disabled}
        onChange={e => setConfirmed(e.target.checked)}/>
      Confirmo que revisé las fotografías y que corresponden al producto ofrecido.
    </label>}
    {critical && <p className="text-danger small">
      Debes corregir fotografías principales o categoría antes de aprobar.
    </p>}
    <button type="button" className="btn btn-primary btn-sm"
      disabled={disabled || (decision === 'approved' && (critical || !confirmed))}
      onClick={submit}>Guardar revisión</button>
  </div>
}

export default function CatalogQualityPanel({ products = [], onEdit }) {
  const client = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [onlyActive, setOnlyActive] = useState(true)
  const [issueFilter, setIssueFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [reviewId, setReviewId] = useState(null)
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-catalog-quality', onlyActive],
    queryFn: () => productsApi.catalogQuality({ include_inactive: !onlyActive }).then(({ data }) => data),
    enabled: expanded,
    staleTime: 30_000,
  })
  const update = useMutation({
    mutationFn: ({ id, payload }) => productsApi.reviewCatalogQuality(id, payload),
    onSuccess: () => {
      toast.success('Revisión comercial registrada')
      setReviewId(null)
      client.invalidateQueries({ queryKey: ['admin-catalog-quality'] })
    },
    onError: error => toast.error(typeof error?.response?.data?.detail === 'string'
      ? error.response.data.detail : 'No se pudo registrar la revisión. Verifica permisos.'),
  })
  const rows = (data?.issues || []).filter(item =>
    (!issueFilter || item.issues.includes(issueFilter)) &&
    (!statusFilter || item.review_status === statusFilter))
    .sort((a,b) => a.score - b.score || a.name.localeCompare(b.name, 'es'))
  const byId = new Map(products.map(product => [product.id, product]))
  return <section className="card p-0 overflow-hidden" aria-label="Centro de calidad comercial">
    <div className="p-4 d-flex flex-wrap align-items-center justify-content-between gap-3">
      <div>
        <h2 className="h6 fw-bold mb-1 d-flex align-items-center gap-2">
          <ShieldCheck size={19}/> Centro de calidad comercial
        </h2>
        <p className="text-secondary small mb-0">
          Indicadores, correcciones y aprobación humana de las fichas del catálogo.
        </p>
      </div>
      <button type="button" className="btn btn-outline-primary btn-sm"
        aria-expanded={expanded} onClick={() => setExpanded(previous => !previous)}>
        {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        <span className="ms-2">{expanded ? 'Cerrar centro' : 'Abrir centro'}</span>
      </button>
    </div>
    {expanded && <div className="border-top p-4">
      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <label className="d-flex align-items-center gap-2 small">
          <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)}/>
          Solo activos
        </label>
        <label className="small d-flex align-items-center gap-2">Hallazgo
          <select className="form-select form-select-sm" value={issueFilter}
            onChange={e => setIssueFilter(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(LABELS).map(([key, label]) =>
              <option value={key} key={key}>{label}</option>)}
          </select>
        </label>
        <label className="small d-flex align-items-center gap-2">Revisión
          <select className="form-select form-select-sm" value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(STATUS).map(([key,label]) =>
              <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2"
          disabled={isFetching} onClick={() => refetch()}><RefreshCw size={14}/> Actualizar</button>
      </div>
      {isLoading && <p className="small text-secondary">Analizando fichas y decisiones registradas…</p>}
      {isError && <p className="alert alert-warning small" role="alert">
        No se pudo consultar el centro de calidad. Revisa la migración y permisos del backend.
      </p>}
      {data && <>
        <div className="d-flex flex-wrap gap-2 mb-3">
          {[
            ['Productos revisados por el sistema',data.total],
            ['Puntuación técnica promedio',`${data.average_score ?? 0}/100`],
            ['Con alertas',data.affected], ['Aprobados',data.approved],
            ['Pendientes',data.awaiting_review], ['Por revisar nuevamente',data.stale],
          ].map(([label,value]) => <span className="badge bg-light text-dark border" key={label}>
            {label}: {value}
          </span>)}
        </div>
        <p className="small text-secondary">
          La puntuación es orientativa y no aprueba productos automáticamente. Las URLs idénticas
          indican posibles fotos repetidas, no igualdad visual. Las decisiones no modifican el stock,
          la publicación de la ficha ni los pedidos. Solo el superadministrador puede aprobar.
        </p>
        <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead><tr><th>Producto</th><th>Calidad técnica</th>
              <th>Estado editorial</th><th>Hallazgos</th><th>Acciones</th></tr></thead>
            <tbody>{rows.map(item => <tr key={item.id}>
              <td><strong>{item.name}</strong>
                <div className="small text-secondary">SKU: {item.sku}</div>
                <div className="small text-secondary">{item.image_count} fotografías</div></td>
              <td><strong>{item.score}/100</strong>
                <div className="progress mt-1" style={{ minWidth: 90, height: 7 }}>
                  <div className="progress-bar" role="progressbar"
                    style={{width: `${item.score}%`}}
                    aria-valuenow={item.score} aria-valuemin={0} aria-valuemax={100}/>
                </div></td>
              <td><span className="small fw-semibold">{STATUS[item.review_status] || 'Pendiente'}</span>
                {item.review_note && <p className="small text-secondary mb-0">{item.review_note}</p>}</td>
              <td>{item.issues.length ? item.issues.map(key => <div key={key}
                className="small text-warning-emphasis d-flex gap-1 align-items-start mb-1">
                <AlertTriangle size={13} className="shrink-0 mt-1"/>
                {LABELS[key] || key}
              </div>) : <span className="small text-success">Sin alertas técnicas</span>}</td>
              <td>
                <div className="d-flex gap-2 flex-wrap">
                  <button type="button" className="btn btn-sm btn-outline-secondary"
                    disabled={!byId.has(item.id)} onClick={() => onEdit(byId.get(item.id))}>
                    <Pencil size={14}/> Editar
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-primary"
                    aria-expanded={reviewId === item.id}
                    onClick={() => setReviewId(reviewId === item.id ? null : item.id)}>
                    <ClipboardCheck size={14}/> Revisar
                  </button>
                </div>
                {reviewId === item.id && <ReviewEditor key={item.id + ':' + item.review_status}
                  item={item} disabled={update.isPending}
                  onSubmitted={(id, payload) => update.mutate({ id, payload })}/>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="small text-secondary">No hay productos para estos filtros.</p>}
        <p className="small text-secondary mt-2 mb-0">
          Las fichas modificadas después de su aprobación requieren una nueva revisión humana.
        </p>
      </>}
    </div>}
  </section>
}
