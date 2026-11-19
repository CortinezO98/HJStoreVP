import { AlertTriangle, RotateCcw, SearchX } from 'lucide-react'

/**
 * A single accessible row for loading errors and empty filtered tables.
 * Render only inside <tbody> so column alignment stays correct.
 */
export default function AdminTableMessage({
  columns,
  error = false,
  onRetry,
  emptyTitle = 'No se encontraron registros',
  emptyDescription = 'Ajusta los filtros o intenta con otra búsqueda.',
}) {
  return (
    <tr>
      <td colSpan={columns} className="admin-table-feedback-cell">
        <div className="admin-table-feedback" role={error ? 'alert' : 'status'}>
          {error ? <AlertTriangle size={27} aria-hidden="true"/> : <SearchX size={27} aria-hidden="true"/>}
          <strong>{error ? 'No pudimos cargar la información' : emptyTitle}</strong>
          <p>{error
            ? 'El servidor no respondió correctamente. Los datos existentes no se han modificado.'
            : emptyDescription}</p>
          {error && typeof onRetry === 'function' && (
            <button type="button" className="btn btn-outline-secondary btn-sm"
              onClick={onRetry}><RotateCcw size={14} aria-hidden="true"/> Reintentar consulta</button>
          )}
        </div>
      </td>
    </tr>
  )
}
